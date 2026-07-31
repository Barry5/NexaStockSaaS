import db from '../database/db.js';
import { isSupabaseConfigured, checkConnection, batchUpsert, getChangesSince } from '../services/supabase/supabaseService.js';
import { transformToPostgres, transformFromPostgres, getConflictColumn, getDeleteCriteria, recordUuidMapping } from '../services/supabase/transform.js';
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
      console.log(`[SYNC] Supabase ${this.online ? 'connectÃ©' : 'non joignable'}`);
    } else {
      console.log('[SYNC] Supabase non configurÃ©. Mode SQLite uniquement.');
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
          const record = JSON.parse(change.data);
          await this.upsertToRemote(change.table, record);
        }
        pushed++;
        pushedIds.push(change.changeId);
      } catch (err: any) {
        failed++;
        errors.push(`${change.table}/${change.recordId}: ${err.message}`);
      }
    }

    if (pushedIds.length > 0) {
      syncEngine.markPushedToSupabase(pushedIds);
    }

    return { pushed, failed, errors };
  }

  async syncDown(tableName?: string): Promise<{ pulled: number; errors: string[] }> {
    if (!await this.checkConnectivity()) {
      return { pulled: 0, errors: ['Supabase non disponible'] };
    }

    const tables = tableName
      ? TABLE_MAPPINGS.filter(t => t.sqliteName === tableName)
      : TABLE_MAPPINGS;

    let pulled = 0;
    let deleted = 0;
    const errors: string[] = [];

    for (const table of tables) {
      if (TABLES_WITHOUT_UPDATED_AT.has(table.sqliteName)) continue;
      try {
        const lastSync = SyncQueue.getLastSyncTime(table.sqliteName);
        const since = lastSync || new Date(0).toISOString();

        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await getChangesSince(table.pgName, since, 100, offset);
          if (error) {
            errors.push(`${table.sqliteName}: ${error.message}`);
            break;
          }
          if (!data || data.length === 0) {
            hasMore = false;
          } else {
            this.upsertBatchToLocal(table.sqliteName, data);
            pulled += data.length;
            offset += data.length;
            if (data.length < 100) hasMore = false;
          }
        }

        SyncQueue.updateLastSyncTime(table.sqliteName);
      } catch (err: any) {
        errors.push(`${table.sqliteName}: ${err.message}`);
      }
    }

    if (pulled > 0) {
      console.log(`[SYNC DOWN] ${pulled} enregistrements rÃ©cupÃ©rÃ©s, ${errors.length} erreurs`);
    }

    return { pulled, errors };
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
    if (!mapping) throw new Error(`Table ${tableName} non configurÃ©e pour la synchro`);

    const pgRecord = transformToPostgres(tableName, record);
    const result = await batchUpsert(mapping.pgName, [pgRecord], getConflictColumn(mapping.pgName));
    if (result.errors.length > 0) throw new Error(result.errors.join('; '));
  }

  private async deleteFromRemote(tableName: string, recordId: string): Promise<void> {
    const mapping = TABLE_MAPPINGS.find(t => t.sqliteName === tableName);
    if (!mapping) throw new Error(`Table ${tableName} non configurÃ©e`);

    const { getAdminClient } = await import('../services/supabase/supabaseService.js');
    const client = getAdminClient();
    const { column, value } = getDeleteCriteria(tableName, recordId);
    const { error } = await client.from(mapping.pgName).delete().eq(column, value);
    if (error) throw new Error(error.message);
  }

  private upsertBatchToLocal(tableName: string, records: any[]) {
    if (records.length === 0) return;

    // Enregistrer les mappings UUID <-> legacy_id pour permettre la résolution des FK
    for (const r of records) {
      if (r && r.id && r.legacy_id) {
        recordUuidMapping(r.legacy_id as string, r.id as string);
      }
    }

    // Convertir les enregistrements Supabase (snake_case) en format SQLite (camelCase)
    const camelRecords = records.map(r => transformFromPostgres(r));

    const columns = Object.keys(camelRecords[0]).filter(c => c !== 'id');
    const allColumns = ['id', ...columns];

    // RÃ©cupÃ©rer les colonnes rÃ©elles de la table SQLite
    const tableInfo = db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[];
    const existingColumns = new Set(tableInfo.map(c => c.name));

    const insertCols = allColumns.filter(c => existingColumns.has(c));
    const insertPlaceholders = insertCols.map(() => '?').join(', ');

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO ${tableName} (${insertCols.join(', ')})
      VALUES (${insertPlaceholders})
    `);

    const transaction = db.transaction(() => {
      for (const record of camelRecords) {
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
    });

    transaction();
  }

  startBackgroundSync(intervalMs: number = 300000) {
    if (this.intervalId) return;
    console.log(`[SYNC] Sync automatique activÃ©e (intervalle: ${intervalMs / 1000}s)`);

    this.intervalId = setInterval(async () => {
      if (this.isRunning) return;
      this.isRunning = true;
      try {
        const queueCount = SyncQueue.getPendingCount();
        if (queueCount > 0) {
          const result = await this.syncUp();
          if (result.pushed > 0 || result.failed > 0) {
            console.log(`[SYNC] syncUp: ${result.pushed} pushed, ${result.failed} failed`);
          }
        }

        const changelogResult = await this.syncUpFromChangelog();
        if (changelogResult.pushed > 0 || changelogResult.failed > 0) {
          console.log(`[SYNC] Changelog sync: ${changelogResult.pushed} pushed, ${changelogResult.failed} failed`);
        }

        await this.syncDown();
      } catch (err: any) {
        console.error('[SYNC] Erreur sync automatique:', err.message);
      } finally {
        this.isRunning = false;
      }
    }, intervalMs);
  }

  stopBackgroundSync() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[SYNC] Sync automatique arrÃªtÃ©e');
    }
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
