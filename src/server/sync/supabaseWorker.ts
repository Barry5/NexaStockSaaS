import * as SyncQueue from './syncQueue.js';
import { syncEngine } from './syncEngine.js';
import { isSupabaseConfigured, checkConnection, batchUpsert } from '../services/supabase/supabaseService.js';
import { transformToPostgres, getConflictColumn, getDeleteCriteria } from '../services/supabase/transform.js';
import { SYNC_TABLE_SET } from './syncTables.js';
import fs from 'fs';
import path from 'path';

interface WorkerStatus {
  running: boolean;
  online: boolean;
  cycleCount: number;
  lastRunAt: string | null;
  lastResult: string;
  uptime: number;
  pendingCount: number;
  failedCount: number;
}

// Durée de vie d'un lock de worker avant qu'il ne soit considéré comme orphelin
// (crash du process sans nettoyage). Au-delà, un nouveau worker peut démarrer.
const WORKER_LOCK_STALE_MS = 10 * 60 * 1000;

export class SupabaseWorker {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private online = false;
  private cycleCount = 0;
  private lastRunAt: string | null = null;
  private lastResult = 'idle';
  private startedAt = 0;
  private consecutiveErrors = 0;
  private baseIntervalMs: number;
  private lockPath: string;

  constructor(
    private intervalMs: number = 15000,
    private batchSize: number = 25,
  ) {
    this.baseIntervalMs = intervalMs;
    // Lock fichier multi-process (Phase 4) : un seul worker actif par volume de
    // données. Le chemin dépend du SNAPSHOT_PATH/DB_PATH (défini dans db.js).
    const dbPath = process.env.DB_PATH || 'data/database.db';
    const dir = path.dirname(dbPath);
    this.lockPath = path.join(dir, '.supabase-worker.lock');
  }

  private getEffectiveInterval(): number {
    if (this.consecutiveErrors === 0) return this.baseIntervalMs;
    return Math.min(
      this.baseIntervalMs * Math.pow(2, this.consecutiveErrors),
      300000
    );
  }

  private restartInterval(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    const effectiveMs = this.getEffectiveInterval();
    this.intervalId = setInterval(() => this.tick(), effectiveMs);
    if (effectiveMs !== this.baseIntervalMs) {
      console.log('[SUPABASE_WORKER] Backoff: ' + (effectiveMs / 1000) + 's (' + this.consecutiveErrors + ' consecutive errors)');
    }
  }

  // Verrou fichier (Phase 4, M5) : empêche deux workers (deux process, deux
  // instances) de pousser/pull simultanément le même volume de données, ce qui
  // gonflerait les versions PG et créerait des courses.
  private acquireLock(): boolean {
    try {
      if (!fs.existsSync(this.lockPath)) {
        fs.writeFileSync(this.lockPath, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), 'utf8');
        return true;
      }
      const stat = fs.statSync(this.lockPath);
      const stale = Date.now() - stat.mtimeMs > WORKER_LOCK_STALE_MS;
      if (stale) {
        console.warn('[SUPABASE_WORKER] Lock orphelin (crash précédent ?) - reprise du verrou');
        fs.writeFileSync(this.lockPath, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), 'utf8');
        return true;
      }
      console.warn(`[SUPABASE_WORKER] Un autre worker est actif (lock ${this.lockPath}) - arrêt sans démarrer`);
      return false;
    } catch {
      // Pas de FS (tests) : on laisse tourner (le verrou en-process isRunning suffit).
      return true;
    }
  }

  private releaseLock(): void {
    try {
      if (fs.existsSync(this.lockPath)) fs.unlinkSync(this.lockPath);
    } catch { /* ignore */ }
  }

  async start(): Promise<void> {
    if (this.intervalId) return;
    if (!this.acquireLock()) return;

    this.startedAt = Date.now();
    this.online = await this.checkConnectivity();

    if (!this.online) {
      console.log('[SUPABASE_WORKER] Supabase unreachable at startup - waiting for next cycle');
    }

    this.restartInterval();
    console.log('[SUPABASE_WORKER] Started (interval: ' + (this.getEffectiveInterval() / 1000) + 's, batch: ' + this.batchSize + ')');

    this.tick();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.releaseLock();
    console.log('[SUPABASE_WORKER] Stopped');
  }

  getStatus(): WorkerStatus {
    return {
      running: this.isRunning,
      online: this.online,
      cycleCount: this.cycleCount,
      lastRunAt: this.lastRunAt,
      lastResult: this.lastResult,
      uptime: this.startedAt ? Date.now() - this.startedAt : 0,
      pendingCount: SyncQueue.getPendingCount(),
      failedCount: SyncQueue.getFailedItems().length,
    };
  }

  private async checkConnectivity(): Promise<boolean> {
    if (!isSupabaseConfigured()) {
      console.log('[SUPABASE_WORKER] Supabase not configured');
      return false;
    }
    return checkConnection();
  }

  private async tick(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      if (!this.online) {
        this.online = await this.checkConnectivity();
        if (!this.online) {
          this.lastResult = 'offline';
          return;
        }
      }

      // Pipeline unique (Phase 1) : plus de processQueue — tout passe par le
      // changelog (syncEngine.logChange) pour éviter le double-push.
      const changelogResult = await this.processChangelog();
      if (changelogResult.processed > 0 || changelogResult.failed > 0) {
        this.lastResult = 'changelog: ' + changelogResult.processed + ' pushed, ' + changelogResult.failed + ' failed';
      }

      const { syncService } = await import('./syncService.js');
      const downResult = await syncService.syncDown();
      if (downResult.pulled > 0) {
        this.lastResult = 'pull: ' + downResult.pulled + ' records';
      }

      // Réconciliation périodique (Phase 2, M3) : purge des lignes fantômes
      // locales et rattrapage des lignes PG jamais pullées.
      if (this.cycleCount > 0 && this.cycleCount % 20 === 0) {
        try {
          const rec = await syncService.reconcileLocalWithRemote();
          if (rec.repaired > 0) {
            this.lastResult = 'reconcile: ' + rec.repaired + ' tables réparées';
          }
        } catch (e: any) {
          console.warn('[SUPABASE_WORKER] Reconcile failed:', e?.message || e);
        }
      }

      if (changelogResult.processed === 0 && changelogResult.failed === 0 && downResult.pulled === 0) {
        this.lastResult = 'idle';
      }

      this.cycleCount++;
      this.consecutiveErrors = 0;

      // Nettoyer les enregistrements de sync déjà poussés (+7j) pour éviter la
      // croissance infinie des tables sync_changelog / sync_deletions / sync_queue.
      if (this.cycleCount % 10 === 0) {
        try {
          const removed = syncEngine.cleanupPushedRecords();
          if (removed > 0) console.log('[SUPABASE_WORKER] Cleanup: ' + removed + ' sync records removed');
        } catch (e: any) {
          console.warn('[SUPABASE_WORKER] Cleanup failed:', e?.message || e);
        }
      }

      this.restartInterval();
    } catch (err: any) {
      this.consecutiveErrors++;
      this.lastResult = 'error: ' + err.message;
      this.restartInterval();

      if (this.consecutiveErrors >= 3) {
        this.online = false;
      }
    } finally {
      this.lastRunAt = new Date().toISOString();
      this.isRunning = false;
    }
  }

  // Drain LEGACY de la file sync_queue (pré-déploiement du pipeline unique).
  // Conservé pour compatibilité / usage manuel ; non appelé par tick().
  private async processQueue(): Promise<{ processed: number; failed: number }> {
    const items = SyncQueue.dequeue(this.batchSize);
    if (items.length === 0) return { processed: 0, failed: 0 };

    let processed = 0;
    let failed = 0;

    for (const item of items) {
      try {
        SyncQueue.markProcessing(item.id);
        const payload = JSON.parse(item.payload);
        const mapping = this.resolveTableName(item.table_name);

        if (item.operation === 'DELETE') {
          const admin = (await import('../services/supabase/supabaseService.js')).getAdminClient();
          const { column, value } = getDeleteCriteria(item.table_name, item.record_id);
          const { error } = await admin.from(mapping).delete().eq(column, value);
          if (error) throw error;
        } else {
          const pgRecord = transformToPostgres(item.table_name, payload);
          const result = await batchUpsert(mapping, [pgRecord], getConflictColumn(mapping));
          if (result.errors.length > 0) throw new Error(result.errors.join('; '));
        }

        SyncQueue.markCompleted(item.id);
        processed++;
      } catch (err: any) {
        SyncQueue.markFailed(item.id, err.message);
        failed++;
      }
    }

    return { processed, failed };
  }

  private async processChangelog(): Promise<{ processed: number; failed: number }> {
    const changes = syncEngine.getChangesForSupabase();
    if (changes.length === 0) return { processed: 0, failed: 0 };

    let processed = 0;
    let failed = 0;
    const pushedIds: string[] = [];

    for (const change of changes) {
      try {
        const mapping = this.resolveTableName(change.table);

        if (change.operation === 'DELETE') {
          const admin = (await import('../services/supabase/supabaseService.js')).getAdminClient();
          const { column, value } = getDeleteCriteria(change.table, change.recordId);
          const { error } = await admin.from(mapping).delete().eq(column, value);
          if (error) throw error;
        } else {
          const { syncService } = await import('./syncService.js');
          const record = syncService.getCurrentRecordForPush(change.table, change.recordId, change.data);
          const pgRecord = transformToPostgres(change.table, record);
          const result = await batchUpsert(mapping, [pgRecord], getConflictColumn(mapping));
          if (result.errors.length > 0) throw new Error(result.errors.join('; '));
        }

        processed++;
        pushedIds.push(change.changeId);
      } catch (err: any) {
        // Retry borné + dead-letter : incrémente retry_count, passe en 'dead'
        // au-delà de max_retries (visible via /api/sync/failed).
        syncEngine.markChangeFailed(change.changeId);
        failed++;
      }
    }

    if (pushedIds.length > 0) {
      syncEngine.markPushedToSupabase(pushedIds);
    }

    return { processed, failed };
  }

  private resolveTableName(sqliteName: string): string {
    if (!SYNC_TABLE_SET.has(sqliteName)) {
      throw new Error(`Table sqlite "${sqliteName}" non autorisée pour la synchronisation`);
    }
    return sqliteName;
  }
}

export const supabaseWorker = new SupabaseWorker();
