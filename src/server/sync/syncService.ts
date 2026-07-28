import db from '../database/db.js';
import { isSupabaseConfigured, checkConnection, batchUpsert, getChangesSince } from '../services/supabase/supabaseService.js';
import { defaultConflictResolver, type ConflictRecord } from './conflictResolver.js';
import * as SyncQueue from './syncQueue.js';

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

  async fullPull(): Promise<{ pulled: number; errors: string[]; tables: number }> {
    if (!await this.checkConnectivity()) {
      return { pulled: 0, errors: ['Supabase non disponible'], tables: 0 };
    }

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

        db.prepare(`DELETE FROM ${mapping.sqliteName}`).run();
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

        const pgRecords = records.map(r => this.transformToPostgres(r));
        const result = await batchUpsert(mapping.pgName, pgRecords);
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

    const pgRecord = this.transformToPostgres(record);
    const result = await batchUpsert(mapping.pgName, [pgRecord]);
    if (result.errors.length > 0) throw new Error(result.errors.join('; '));
  }

  private async deleteFromRemote(tableName: string, recordId: string): Promise<void> {
    const mapping = TABLE_MAPPINGS.find(t => t.sqliteName === tableName);
    if (!mapping) throw new Error(`Table ${tableName} non configurée`);

    const { SupabaseClient } = await import('@supabase/supabase-js');
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
        const values = insertCols.map(c => record[c] !== undefined ? record[c] : null);
        stmt.run(...values);
      }
    });

    transaction();
  }

  private transformToPostgres(record: Record<string, unknown>): Record<string, unknown> {
    const pg: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      const pgKey = this.camelToSnake(key);
      if (value === null || value === undefined) {
        pg[pgKey] = null;
      } else if (typeof value === 'boolean') {
        pg[pgKey] = value;
      } else if (typeof value === 'number') {
        pg[pgKey] = value;
      } else {
        pg[pgKey] = value;
      }
    }
    return pg;
  }

  private snakeToCamel(key: string): string {
    return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  }

  private transformFromPostgres(record: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      result[this.snakeToCamel(key)] = value;
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
        const count = SyncQueue.getPendingCount();
        if (count > 0) {
          const result = await this.syncUp();
          if (result.pushed > 0) {
            console.log(`[SYNC] ${result.pushed} enregistrements poussés, ${result.failed} échecs`);
          }
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
