import db from '../database/db.js';
import { isSupabaseConfigured, checkConnection, batchUpsert, getChangesSince, getChangesSinceByCreatedAt, countRemoteRows, fetchAllLegacyIds, ensureUuidMappingForPush, fetchUuidMappings, type PullCursor } from '../services/supabase/supabaseService.js';
import { transformToPostgres, transformFromPostgres, getConflictColumn, getDeleteCriteria, recordUuidMapping, NO_LEGACY_ID_TABLES } from '../services/supabase/transform.js';
import * as SyncQueue from './syncQueue.js';
import { syncEngine } from './syncEngine.js';
import { TABLE_MAPPINGS, TABLES_WITHOUT_UPDATED_AT } from './syncTables.js';

export type SyncDirection = 'up' | 'down' | 'both';
export type SyncMode = 'automatic' | 'manual' | 'background';

export interface SyncResult {
  direction: SyncDirection;
  upResult?: { pushed: number; failed: number; errors: string[] };
  downResult?: { pulled: number; errors: string[] };
  timestamp: string;
  duration: number;
}



class SyncService {
  private isRunning = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private online = false;
  private lastCheck = 0;

  async initialize() {
    SyncQueue.initializeSyncTables();

    if (isSupabaseConfigured()) {
      this.online = await checkConnection();
      console.log(`[SYNC] Supabase ${this.online ? 'connecté' : 'non joignable'}`);
    } else {
      console.log('[SYNC] Supabase non configuré. Mode SQLite uniquement.');
    }
  }

  async checkConnectivity(): Promise<boolean> {
    if (!isSupabaseConfigured()) return false;
    const now = Date.now();
    if (now - this.lastCheck < 30000) return this.online;
    this.lastCheck = now;
    this.online = await checkConnection();
    return this.online;
  }

  isOnline(): boolean {
    return this.online;
  }

  // Drain LEGACY de la file sync_queue (pré-déploiement du pipeline unique).
  // À n'appeler qu'une fois au démarrage : les nouvelles écritures passent
  // exclusivement par sync_changelog (syncUpFromChangelog).
  async syncUp(): Promise<{ pushed: number; failed: number; errors: string[] }> {
    if (!await this.checkConnectivity()) {
      return { pushed: 0, failed: 0, errors: ['Supabase non disponible'] };
    }

    SyncQueue.retryFailed();

    const items = SyncQueue.dequeue(50);
    if (items.length === 0) return { pushed: 0, failed: 0, errors: [] };

    let pushed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const item of items) {
      try {
        SyncQueue.markProcessing(item.id);
        const payload = JSON.parse(item.payload);

        if (item.operation === 'DELETE') {
          await this.deleteFromRemote(item.table_name, item.record_id);
        } else {
          await this.upsertToRemote(item.table_name, payload);
        }

        SyncQueue.markCompleted(item.id);
        pushed++;
      } catch (err: any) {
        SyncQueue.markFailed(item.id, err.message);
        failed++;
        errors.push(`${item.table_name}/${item.record_id}: ${err.message}`);
      }
    }

    return { pushed, failed, errors };
  }

  // Pipeline UNIQUE de push (Phase 1) : sync_changelog -> Supabase.
  // L'état poussé est relu depuis SQLite au moment du push (jamais un snapshot
  // périmé) ; en cas d'échec, l'item est marqué failed/dead (retry borné).
  async syncUpFromChangelog(): Promise<{ pushed: number; failed: number; errors: string[] }> {
    if (!await this.checkConnectivity()) {
      return { pushed: 0, failed: 0, errors: ['Supabase non disponible'] };
    }

    const changes = syncEngine.getChangesForSupabase();
    if (changes.length === 0) return { pushed: 0, failed: 0, errors: [] };

    let pushed = 0;
    let failed = 0;
    const errors: string[] = [];
    const pushedIds: string[] = [];

    for (const change of changes) {
      try {
        if (change.operation === 'DELETE') {
          await this.deleteFromRemote(change.table, change.recordId);
        } else {
          // Réaligner le mapping UUID sur la ligne PG existante AVANT le push
          // (évite les doublons de legacy_id quand sync_uuid_map est incomplet).
          await ensureUuidMappingForPush(change.table, change.recordId);
          const record = this.getCurrentRecordForPush(change.table, change.recordId, change.data);
          await this.upsertToRemote(change.table, record);
        }
        pushed++;
        pushedIds.push(change.changeId);
      } catch (err: any) {
        syncEngine.markChangeFailed(change.changeId, err?.message);
        failed++;
        errors.push(`${change.table}/${change.recordId}: ${err.message}`);
      }
    }

    if (pushedIds.length > 0) {
      syncEngine.markPushedToSupabase(pushedIds);
    }

    return { pushed, failed, errors };
  }

  // Relit l'état courant de la ligne avant push (le changelog peut référencer
  // un snapshot partiel). Si la ligne n'existe plus localement (supprimée entre
  // le log et le push), on retombe sur les données journalisées.
  getCurrentRecordForPush(tableName: string, recordId: string, fallbackData: string): Record<string, unknown> {
    try {
      const row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(recordId) as Record<string, unknown> | undefined;
      if (row) return row;
    } catch {
      // table inconnue : on retombe sur le payload journalisé
    }
    try {
      const parsed = JSON.parse(fallbackData);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }

  async syncDown(tableName?: string): Promise<{ pulled: number; errors: string[] }> {
    if (!await this.checkConnectivity()) {
      return { pulled: 0, errors: ['Supabase non disponible'] };
    }

    const tables = tableName
      ? TABLE_MAPPINGS.filter(t => t.sqliteName === tableName)
      : TABLE_MAPPINGS;

    let pulled = 0;
    const errors: string[] = [];

    for (const table of tables) {
      try {
        const lastSync = SyncQueue.getLastSyncTime(table.sqliteName);
        const since = lastSync || new Date(0).toISOString();
        // Tables sans updated_at en PG (RBAC/audit) : on utilise created_at.
        const usesCreatedAt = TABLES_WITHOUT_UPDATED_AT.has(table.sqliteName);
        const fetcher = usesCreatedAt
          ? getChangesSinceByCreatedAt
          : getChangesSince;

        // Pagination par curseur keyset (updated_at|created_at, id) : ne saute
        // JAMAIS de records, même avec des horodatages identiques (Phase 2).
        let cursor: PullCursor | null = null;
        let watermark: string | null = null;
        let tablePulled = 0;
        let tableError = false;

        while (true) {
          const { data, error } = await fetcher(table.pgName, since, 100, cursor ?? undefined);
          if (error) {
            errors.push(`${table.sqliteName}: ${error.message}`);
            tableError = true;
            break;
          }
          if (!data || data.length === 0) {
            break;
          }

          const maxTs = this.computeMaxTimestamp(data, usesCreatedAt);
          if (maxTs && (!watermark || maxTs > watermark)) watermark = maxTs;

          this.upsertBatchToLocal(table.sqliteName, data, watermark ?? undefined);
          tablePulled += data.length;
          pulled += data.length;

          if (data.length < 100) {
            break;
          }
          const last = data[data.length - 1];
          cursor = {
            updatedAt: String(usesCreatedAt ? last.created_at : last.updated_at),
            id: String(last.id),
          };
        }
      } catch (err: any) {
        errors.push(`${table.sqliteName}: ${err.message}`);
      }
    }

    if (pulled > 0) {
      console.log(`[SYNC DOWN] ${pulled} enregistrements récupérés, ${errors.length} erreurs`);
    }

    return { pulled, errors };
  }

  private computeMaxTimestamp(records: any[], usesCreatedAt: boolean): string | null {
    let max: string | null = null;
    for (const r of records) {
      const ts = usesCreatedAt ? r?.created_at : r?.updated_at;
      if (typeof ts === 'string' && (!max || ts > max)) max = ts;
    }
    return max;
  }

  async fullSync(direction: SyncDirection = 'both'): Promise<SyncResult> {
    const start = Date.now();
    const result: SyncResult = {
      direction,
      timestamp: new Date().toISOString(),
      duration: 0,
    };

    if (direction === 'up' || direction === 'both') {
      result.upResult = await this.syncUp();
    }
    if (direction === 'down' || direction === 'both') {
      result.downResult = await this.syncDown();
    }

    result.duration = Date.now() - start;
    return result;
  }

  async fullPull(clearLocalBeforeInsert: boolean = false): Promise<{ pulled: number; errors: string[]; tables: number }> {
    let totalPulled = 0;
    const errors: string[] = [];
    let tablesProcessed = 0;

    for (const mapping of TABLE_MAPPINGS) {
      try {
        const client = (await import('../services/supabase/supabaseService.js')).getAdminClient();
        let offset = 0;
        const pageSize = 100;
        let hasMore = true;

        if (clearLocalBeforeInsert) {
          db.prepare(`DELETE FROM ${mapping.sqliteName}`).run();
        }

        while (hasMore) {
          const { data, error } = await client
            .from(mapping.pgName)
            .select('*')
            .order('id', { ascending: true })
            .range(offset, offset + pageSize - 1);

          if (error) {
            errors.push(`${mapping.sqliteName}: ${error.message}`);
            break;
          }
          if (!data || data.length === 0) {
            hasMore = false;
          } else {
            this.upsertBatchToLocal(mapping.sqliteName, data);
            totalPulled += data.length;
            offset += data.length;
            if (data.length < pageSize) hasMore = false;
          }
        }

        tablesProcessed++;
      } catch (err: any) {
        errors.push(`${mapping.sqliteName}: ${err.message}`);
      }
    }

    return { pulled: totalPulled, errors, tables: tablesProcessed };
  }

  async fullPush(missingOnly: boolean = false): Promise<{ pushed: number; failed: number; errors: string[]; tables: number }> {
    if (!await this.checkConnectivity()) {
      return { pushed: 0, failed: 0, errors: ['Supabase non disponible'], tables: 0 };
    }

    let totalPushed = 0;
    let totalFailed = 0;
    const errors: string[] = [];
    let tablesProcessed = 0;

    for (const mapping of TABLE_MAPPINGS) {
      try {
        if (missingOnly && SyncQueue.getLastSyncTime(mapping.sqliteName) !== null) {
          continue;
        }

        const tableInfo = db.prepare(`PRAGMA table_info(${mapping.sqliteName})`).all() as { name: string }[];
        const cols = tableInfo.map(c => c.name).join(', ');
        const records = db.prepare(`SELECT ${cols} FROM ${mapping.sqliteName}`).all() as Record<string, unknown>[];

        if (records.length === 0) continue;

        // Réaligner les mappings legacy_id -> id pour TOUTES les lignes déjà
        // présentes côté PG : sans cela, l'upsert (onConflict: 'id') générerait
        // des doublons de legacy_id (unique index migration 002) pour toute
        // ligne locale dont sync_uuid_map est incomplet.
        if (!NO_LEGACY_ID_TABLES.has(mapping.sqliteName)) {
          const uuidMappings = await fetchUuidMappings(mapping.pgName);
          if (uuidMappings) {
            for (const m of uuidMappings) recordUuidMapping(m.legacy_id, m.id);
          }
        }

        const pgRecords = records.map(r => transformToPostgres(mapping.sqliteName, r));
        const result = await batchUpsert(mapping.pgName, pgRecords, getConflictColumn(mapping.pgName));
        totalPushed += result.success;
        if (result.errors.length > 0) {
          errors.push(...result.errors.map(e => `${mapping.sqliteName}: ${e}`));
          totalFailed += records.length - result.success;
        }
        tablesProcessed++;
      } catch (err: any) {
        errors.push(`${mapping.sqliteName}: ${err.message}`);
        totalFailed++;
      }
    }

    return { pushed: totalPushed, failed: totalFailed, errors, tables: tablesProcessed };
  }

  private async upsertToRemote(tableName: string, record: Record<string, unknown>): Promise<void> {
    const mapping = TABLE_MAPPINGS.find(t => t.sqliteName === tableName);
    if (!mapping) throw new Error(`Table ${tableName} non configurée pour la synchro`);

    const pgRecord = transformToPostgres(tableName, record);
    const result = await batchUpsert(mapping.pgName, [pgRecord], getConflictColumn(mapping.pgName));
    if (result.errors.length > 0) throw new Error(result.errors.join('; '));
  }

  private async deleteFromRemote(tableName: string, recordId: string): Promise<void> {
    const mapping = TABLE_MAPPINGS.find(t => t.sqliteName === tableName);
    if (!mapping) throw new Error(`Table ${tableName} non configurée`);

    const { getAdminClient } = await import('../services/supabase/supabaseService.js');
    const client = getAdminClient();
    const { column, value } = getDeleteCriteria(tableName, recordId);
    const { error } = await client.from(mapping.pgName).delete().eq(column, value);
    if (error) throw new Error(error.message);
  }

  private upsertBatchToLocal(tableName: string, records: any[], watermark?: string) {
    if (records.length === 0) return;

    // Enregistrer les mappings UUID <-> ID local pour permettre la résolution des FK.
    // Si legacy_id est absent, on utilise l'UUID de PG comme ID local.
    for (const r of records) {
      if (r && r.id) { // r.id est l'UUID de PG
        const localId = r.legacy_id || r.id;
        recordUuidMapping(localId as string, r.id as string);
      }
    }

    // Convertir les enregistrements Supabase (snake_case) en format SQLite (camelCase)
    const camelRecords = records.map(r => transformFromPostgres(tableName, r));

    const columns = Object.keys(camelRecords[0]).filter(c => c !== 'id');
    const allColumns = ['id', ...columns];

    const tableInfo = db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[];
    const existingColumns = new Set(tableInfo.map(c => c.name));
    const hasSyncStatus = existingColumns.has('sync_status');

    const insertCols = allColumns.filter(c => existingColumns.has(c));
    const insertPlaceholders = insertCols.map(() => '?').join(', ');

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO ${tableName} (${insertCols.join(', ')})
      VALUES (${insertPlaceholders})
    `);
    const selectStmt = db.prepare(`SELECT version FROM ${tableName} WHERE id = ?`);

    const transaction = db.transaction(() => {
      for (const record of camelRecords) {
        const remoteVersion = (record.version as number) || 0;

        if (hasSyncStatus) {
          (record as any).sync_status = 'synced';
        }

        const localVersion = (selectStmt.get(record.id) as { version: number } | undefined)?.version || 0;

        if (localVersion > 0 && remoteVersion > 0 && localVersion > remoteVersion) {
          continue;
        }

        const values = insertCols.map(c => {
          const val = record[c];
          if (val === undefined) return null;
          if (typeof val === 'boolean') return val ? 1 : 0;
          if (val !== null && typeof val === 'object' && !(val instanceof Date) && !Buffer.isBuffer(val)) {
            return JSON.stringify(val);
          }
          return val;
        });
        stmt.run(...values);
      }

      // Watermark avancé dans la MÊME transaction que les upserts : si le
      // process crashe entre les deux, le pull reprend de l'ancien watermark
      // (idempotent, aucun record perdu).
      if (watermark) {
        SyncQueue.updateLastSyncTime(tableName, watermark);
      }
    });

    transaction();
  }

  // Réconciliation locale <-> Supabase (Phase 2, correction M3) : détecte les
  // écarts de comptage par table et répare les lignes "fantômes" locales
  // (supprimées en dur côté PG) ainsi que les lignes PG jamais pullées.
  // Sûre car jamais exécutée sur une table ayant des changements locaux en
  // attente (hasPendingChangesForTable).
  async reconcileLocalWithRemote(): Promise<{ checked: number; repaired: number; errors: string[] }> {
    let checked = 0;
    let repaired = 0;
    const errors: string[] = [];

    for (const mapping of TABLE_MAPPINGS) {
      // Tables sans legacy_id (clé naturelle) : non réconciliables simplement.
      if (NO_LEGACY_ID_TABLES.has(mapping.sqliteName)) continue;
      // Ne jamais réconcilier une table avec des changements locaux non poussés.
      if (syncEngine.hasPendingChangesForTable(mapping.sqliteName)) continue;
      // …NI une table avec des changements en dead-letter non résolus : la
      // purge de lignes locales absentes de PG détruirait des données
      // légitimes dont le push a simplement échoué (max_retries atteint).
      // Seul un rejeu manuel (/api/sync/retry-failed) débloque la table.
      if (syncEngine.hasDeadChangesForTable(mapping.sqliteName)) continue;

      try {
        checked++;
        const { count: pgCount, error: countError } = await countRemoteRows(mapping.pgName);
        if (countError || pgCount === null) {
          errors.push(`${mapping.sqliteName}: ${countError?.message || 'count indisponible'}`);
          continue;
        }

        const localCount = this.countLocalRows(mapping.sqliteName);
        if (pgCount === localCount) continue;

        if (localCount > pgCount) {
          // Lignes locales absentes de PG (supprimées en dur côté PG) -> purge
          const removed = await this.pruneLocalRowsMissingFromRemote(mapping);
          if (removed > 0) {
            repaired++;
            console.log(`[SYNC RECONCILE] ${mapping.sqliteName}: ${removed} lignes fantômes supprimées localement`);
          }
        }

        // Repull complet de la table (récupère aussi les lignes PG jamais vues)
        await this.syncDown(mapping.sqliteName);
      } catch (err: any) {
        errors.push(`${mapping.sqliteName}: ${err.message}`);
      }
    }

    if (repaired > 0) {
      console.log(`[SYNC RECONCILE] ${checked} tables vérifiées, ${repaired} réparées`);
    }
    return { checked, repaired, errors };
  }

  private countLocalRows(tableName: string): number {
    const row = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get() as { count: number };
    return row.count;
  }

  private async pruneLocalRowsMissingFromRemote(mapping: { sqliteName: string; pgName: string }): Promise<number> {
    const { ids: pgLegacyIds, error } = await fetchAllLegacyIds(mapping.pgName);
    if (error) throw new Error(error.message);

    const pgIdSet = new Set(pgLegacyIds);
    const localRows = db.prepare(`SELECT id FROM ${mapping.sqliteName}`).all() as { id: string }[];

    let removed = 0;
    const transaction = db.transaction(() => {
      for (const r of localRows) {
        if (!pgIdSet.has(r.id)) {
          db.prepare(`DELETE FROM ${mapping.sqliteName} WHERE id = ?`).run(r.id);
          // Tombstone local pour que le pull client supprime aussi la ligne
          // fantôme ; PG n'a déjà plus la ligne (pushed=1 -> purgable).
          db.prepare(`INSERT OR REPLACE INTO sync_deletions (id, table_name, record_id, deleted_at, company_id, pushed_to_supabase) VALUES (?, ?, ?, ?, ?, 1)`)
            .run(`del-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, mapping.sqliteName, r.id, new Date().toISOString(), null);
          removed++;
        }
      }
    });
    transaction();
    return removed;
  }

  startBackgroundSync(intervalMs: number = 300000) {
    // SUPPRIMÉ en Phase 1 : un seul planificateur (SupabaseWorker) pilote la
    // synchronisation pour éviter le double-push. Cette méthode est conservée
    // comme no-op pour ne pas casser d'éventuels appelants.
    console.warn('[SYNC] startBackgroundSync est désactivée (pipeline unique : SupabaseWorker)');
  }

  stopBackgroundSync() {
    // No-op depuis Phase 1 (voir startBackgroundSync).
  }

  getStatus() {
    return {
      online: this.online,
      pendingCount: SyncQueue.getPendingCount(),
      failedCount: SyncQueue.getFailedItems().length,
      isRunning: this.isRunning,
      isConfigured: isSupabaseConfigured(),
    };
  }
}

export const syncService = new SyncService();
