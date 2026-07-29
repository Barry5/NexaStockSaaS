import db from '../database/db.js';
import { isSupabaseConfigured, checkConnection, batchUpsert, getChangesSince, batchDelete } from '../services/supabase/supabaseService.js';
import { defaultConflictResolver, type ConflictRecord } from './conflictResolver.js';
import * as SyncQueue from './syncQueue.js';
import { syncEngine } from './syncEngine.js';
import { v4 as uuidv4 } from 'uuid';

export type SyncDirection = 'up' | 'down' | 'both';
export type SyncMode = 'automatic' | 'manual' | 'background';

export interface SyncResult {
  direction: SyncDirection;
  upResult?: { pushed: number; failed: number; errors: string[] };
  downResult?: { pulled: number; errors: string[] };
  timestamp: string;
  duration: number;
}

interface TableMapping {
  sqliteName: string;
  pgName: string;
  isChild?: boolean;
  parentTable?: string;
  parentFk?: string;
}

// Mapping complet des tables SQLite → PostgreSQL
const TABLE_MAPPINGS: TableMapping[] = [
  { sqliteName: 'tenants', pgName: 'tenants' },
  { sqliteName: 'users', pgName: 'users' },
  { sqliteName: 'products', pgName: 'products' },
  { sqliteName: 'product_variants', pgName: 'product_variants' },
  { sqliteName: 'customers', pgName: 'customers' },
  { sqliteName: 'suppliers', pgName: 'suppliers' },
  { sqliteName: 'sales', pgName: 'sales' },
  { sqliteName: 'sale_items', pgName: 'sale_items' },
  { sqliteName: 'expenses', pgName: 'expenses' },
  { sqliteName: 'loans', pgName: 'loans' },
  { sqliteName: 'repayments', pgName: 'repayments' },
  { sqliteName: 'loan_installments', pgName: 'loan_installments' },
  { sqliteName: 'warehouses', pgName: 'warehouses' },
  { sqliteName: 'stock_transfers', pgName: 'stock_transfers' },
  { sqliteName: 'invoices', pgName: 'invoices' },
  { sqliteName: 'invoice_items', pgName: 'invoice_items' },
  { sqliteName: 'delivery_orders', pgName: 'delivery_orders' },
  { sqliteName: 'delivery_order_items', pgName: 'delivery_order_items' },
  { sqliteName: 'payments', pgName: 'payments' },
  { sqliteName: 'returns', pgName: 'returns' },
  { sqliteName: 'return_items', pgName: 'return_items' },
  { sqliteName: 'invoice_audit_log', pgName: 'invoice_audit_log' },
  { sqliteName: 'affiliates', pgName: 'affiliates' },
  { sqliteName: 'commission_rules', pgName: 'commission_rules' },
  { sqliteName: 'commission_ledger', pgName: 'commission_ledger' },
  { sqliteName: 'commission_payments', pgName: 'commission_payments' },
  { sqliteName: 'commission_audit', pgName: 'commission_audit' },
  { sqliteName: 'sale_affiliates', pgName: 'sale_affiliates' },
  { sqliteName: 'sale_commission_items', pgName: 'sale_commission_items' },
  { sqliteName: 'audit_logs', pgName: 'audit_logs' },
  { sqliteName: 'delivery_note_audit', pgName: 'delivery_note_audit' },
  { sqliteName: 'subscription_invoices', pgName: 'subscription_invoices' },
  { sqliteName: 'subscription_payments', pgName: 'subscription_payments' },
  { sqliteName: 'pricing_plans', pgName: 'pricing_plans' },
  { sqliteName: 'global_saas_settings', pgName: 'global_saas_settings' },
  { sqliteName: 'gdrive_tokens', pgName: 'gdrive_tokens' },
  { sqliteName: 'roles', pgName: 'roles' },
  { sqliteName: 'permissions', pgName: 'permissions' },
  { sqliteName: 'role_permissions', pgName: 'role_permissions' },
  { sqliteName: 'user_roles', pgName: 'user_roles' },
  { sqliteName: 'module_definitions', pgName: 'module_definitions' },
  { sqliteName: 'tenant_modules', pgName: 'tenant_modules' },
];

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

  async syncUp(): Promise<{ pushed: number; failed: number; errors: string[] }> {
    if (!await this.checkConnectivity()) {
      return { pushed: 0, failed: 0, errors: ['Supabase non disponible'] };
    }

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
        pushedIds.push(change.recordId);
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
      console.log(`[SYNC DOWN] ${pulled} enregistrements récupérés, ${errors.length} erreurs`);
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
        const { data, error } = await client
          .from(mapping.pgName)
          .select('*')
          .order('id', { ascending: true });

        if (error) {
          errors.push(`${mapping.sqliteName}: ${error.message}`);
          continue;
        }
        if (!data || data.length === 0) continue;

        if (clearLocalBeforeInsert) {
          db.prepare(`DELETE FROM ${mapping.sqliteName}`).run();
        }

        this.upsertBatchToLocal(mapping.sqliteName, data);
        totalPulled += data.length;
        tablesProcessed++;
      } catch (err: any) {
        errors.push(`${mapping.sqliteName}: ${err.message}`);
      }
    }

    return { pulled: totalPulled, errors, tables: tablesProcessed };
  }

  async fullPush(): Promise<{ pushed: number; failed: number; errors: string[]; tables: number }> {
    if (!await this.checkConnectivity()) {
      return { pushed: 0, failed: 0, errors: ['Supabase non disponible'], tables: 0 };
    }

    let totalPushed = 0;
    let totalFailed = 0;
    const errors: string[] = [];
    let tablesProcessed = 0;

    for (const mapping of TABLE_MAPPINGS) {
      try {
        const tableInfo = db.prepare(`PRAGMA table_info(${mapping.sqliteName})`).all() as { name: string }[];
        const cols = tableInfo.map(c => c.name).join(', ');
        const records = db.prepare(`SELECT ${cols} FROM ${mapping.sqliteName}`).all() as Record<string, unknown>[];

        if (records.length === 0) continue;

        const pgRecords = records.map(r => this.transformToPostgres(mapping.sqliteName, r));
        const result = await batchUpsert(mapping.pgName, pgRecords, 'legacy_id');
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

    const pgRecord = this.transformToPostgres(tableName, record);
    const result = await batchUpsert(mapping.pgName, [pgRecord], 'legacy_id');
    if (result.errors.length > 0) throw new Error(result.errors.join('; '));
  }

  private async deleteFromRemote(tableName: string, recordId: string): Promise<void> {
    const mapping = TABLE_MAPPINGS.find(t => t.sqliteName === tableName);
    if (!mapping) throw new Error(`Table ${tableName} non configurée`);

    const { getAdminClient } = await import('../services/supabase/supabaseService.js');
    const client = getAdminClient();
    const { error } = await client.from(mapping.pgName).delete().eq('legacy_id', recordId);
    if (error) throw new Error(error.message);
  }

  private upsertBatchToLocal(tableName: string, records: any[]) {
    if (records.length === 0) return;

    // Convertir les enregistrements Supabase (snake_case) en format SQLite (camelCase)
    const camelRecords = records.map(r => this.transformFromPostgres(r));

    const columns = Object.keys(camelRecords[0]).filter(c => c !== 'id');
    const allColumns = ['id', ...columns];

    // Récupérer les colonnes réelles de la table SQLite
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

  private uuidMap = new Map<string, string>();
  private uuidMapTable = 'sync_uuid_map';

  private ensureUuidMapTable() {
    db.exec(`CREATE TABLE IF NOT EXISTS ${this.uuidMapTable} (
      sqlite_id TEXT PRIMARY KEY,
      pg_uuid TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    )`);
  }

  private getOrCreateUuid(sqliteId: string): string {
    const existing = db.prepare(`SELECT pg_uuid FROM ${this.uuidMapTable} WHERE sqlite_id = ?`).get(sqliteId) as { pg_uuid: string } | undefined;
    if (existing) return existing.pg_uuid;
    const uuid = uuidv4();
    db.prepare(`INSERT OR IGNORE INTO ${this.uuidMapTable} (sqlite_id, pg_uuid, created_at) VALUES (?, ?, ?)`).run(sqliteId, uuid, new Date().toISOString());
    return uuid;
  }

  private getSqliteIdFromUuid(pgUuid: string): string | null {
    const row = db.prepare(`SELECT sqlite_id FROM ${this.uuidMapTable} WHERE pg_uuid = ?`).get(pgUuid) as { sqlite_id: string } | undefined;
    return row?.sqlite_id || null;
  }

  private isFkColumn(pgKey: string): boolean {
    const fkSuffixes = ['_id', 'Id'];
    return fkSuffixes.some(s => pgKey.endsWith(s)) && pgKey !== 'legacy_id';
  }

  private resolveFkValue(value: string): string {
    const mapped = db.prepare(`SELECT pg_uuid FROM ${this.uuidMapTable} WHERE sqlite_id = ?`).get(value) as { pg_uuid: string } | undefined;
    if (mapped) return mapped.pg_uuid;
    return this.getOrCreateUuid(value);
  }

  private transformToPostgres(tableName: string, record: Record<string, unknown>): Record<string, unknown> {
    this.ensureUuidMapTable();
    const pg: Record<string, unknown> = {};
    const skipKeys = new Set(['_table', 'id']);

    for (const [key, value] of Object.entries(record)) {
      if (skipKeys.has(key)) continue;
      const pgKey = key === 'tenantId' ? 'tenant_id' : key === 'legacy_id' ? 'legacy_id' : this.camelToSnake(key);
      if (value === null || value === undefined) {
        pg[pgKey] = null;
        continue;
      }
      if (typeof value === 'string' && (value.startsWith('[') || value.startsWith('{'))) {
        try { pg[pgKey] = JSON.parse(value); } catch { pg[pgKey] = value; }
      } else if (typeof value === 'string' && this.isFkColumn(pgKey)) {
        pg[pgKey] = this.resolveFkValue(value);
      } else {
        pg[pgKey] = value;
      }
    }

    pg.legacy_id = record.legacy_id || record.id as string;
    pg.id = this.getOrCreateUuid(pg.legacy_id as string);

    return pg;
  }

  private snakeToCamel(key: string): string {
    return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  }

  private transformFromPostgres(record: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (key === 'id') continue;
      const camelKey = key === 'legacy_id' ? 'id' : this.snakeToCamel(key);
      if (value === null || value === undefined) {
        result[camelKey] = null;
        continue;
      }
      if (key.endsWith('_id') && key !== 'legacy_id' && typeof value === 'string') {
        const sqliteId = this.getSqliteIdFromUuid(value);
        result[camelKey] = sqliteId || value;
      } else if (typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) {
        result[camelKey] = JSON.stringify(value);
      } else {
        result[camelKey] = value;
      }
    }
    return result;
  }

  private camelToSnake(key: string): string {
    return key.replace(/([A-Z])/g, '_$1').toLowerCase();
  }

  startBackgroundSync(intervalMs: number = 300000) {
    if (this.intervalId) return;
    console.log(`[SYNC] Sync automatique activée (intervalle: ${intervalMs / 1000}s)`);

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
      console.log('[SYNC] Sync automatique arrêtée');
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
