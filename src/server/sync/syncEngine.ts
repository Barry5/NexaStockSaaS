import db from '../database/db.js';
import { v4 as uuidv4 } from 'uuid';
import * as SyncQueue from './syncQueue.js';

export type SyncOperation = 'CREATE' | 'UPDATE' | 'DELETE';

export interface SyncChange {
  table: string;
  recordId: string;
  operation: SyncOperation;
  data: Record<string, unknown>;
  version?: number;
  deviceId?: string;
  companyId?: string;
}

export interface SyncConflict {
  table: string;
  recordId: string;
  clientVersion: number;
  serverVersion: number;
  clientData: Record<string, unknown>;
  serverData: Record<string, unknown>;
  resolvedData: Record<string, unknown>;
  strategy: string;
}

export interface PushResult {
  applied: number;
  conflicts: SyncConflict[];
  errors: { table: string; recordId: string; error: string }[];
}

export interface PullResult {
  changes: Record<string, unknown[]>;
  deletions: Record<string, string[]>;
  timestamp: string;
}

const SYNC_TABLES = [
  'tenants', 'users', 'products', 'product_variants', 'customers', 'suppliers',
  'sales', 'sale_items', 'expenses', 'loans', 'repayments', 'loan_installments',
  'warehouses', 'stock_transfers', 'invoices', 'invoice_items',
  'delivery_orders', 'delivery_order_items', 'payments', 'returns', 'return_items',
  'affiliates', 'commission_rules', 'commission_ledger', 'commission_payments',
  'commission_audit', 'sale_affiliates', 'sale_commission_items',
  'subscription_invoices', 'subscription_payments', 'pricing_plans',
  'global_saas_settings', 'audit_logs', 'invoice_audit_log',
  'delivery_note_audit', 'gdrive_tokens', 'roles', 'permissions',
  'role_permissions', 'user_roles', 'module_definitions', 'tenant_modules',
];

export class SyncEngine {
  recordChange(
    tableName: string,
    recordId: string,
    operation: SyncOperation,
    oldValues: Record<string, unknown> | null,
    newValues: Record<string, unknown> | null,
    oldVersion: number | null,
    newVersion: number,
    companyId?: string,
    deviceId?: string,
  ): string {
    const id = `chg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO sync_changelog (id, table_name, record_id, operation, old_values, new_values, old_version, new_version, created_at, device_id, company_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, tableName, recordId, operation,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      oldVersion, newVersion, now,
      deviceId || null, companyId || null,
    );

    SyncQueue.enqueue(tableName, recordId, operation, newValues || {}, companyId, deviceId);

    return id;
  }

  getCurrentVersion(tableName: string, recordId: string): number {
    try {
      const row = db.prepare(`SELECT version FROM ${tableName} WHERE id = ?`).get(recordId) as { version: number } | undefined;
      return row?.version || 0;
    } catch {
      return 0;
    }
  }

  incrementVersion(tableName: string, recordId: string): number {
    const current = this.getCurrentVersion(tableName, recordId);
    const next = current + 1;
    try {
      db.prepare(`UPDATE ${tableName} SET version = ?, updatedAt = ? WHERE id = ?`).run(next, new Date().toISOString(), recordId);
    } catch {}
    return next;
  }

  pushChanges(changes: SyncChange[]): PushResult {
    const result: PushResult = { applied: 0, conflicts: [], errors: [] };

    const transaction = db.transaction(() => {
      for (const change of changes) {
        try {
          const { table, recordId, operation, data, version, deviceId, companyId } = change;

          if (!SYNC_TABLES.includes(table)) {
            result.errors.push({ table, recordId, error: `Table ${table} non autorisée` });
            continue;
          }

          const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
          const colNames = new Set(cols.map(c => c.name));

          if (operation === 'DELETE') {
            const existing = this.getRecord(table, recordId);
            const currentVersion = existing ? (existing.version as number) || 0 : 0;

            if (existing) {
              this.recordChange(table, recordId, 'DELETE', existing as Record<string, unknown>, null, currentVersion, currentVersion + 1, companyId, deviceId);
              db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(recordId);
              db.prepare(`INSERT OR REPLACE INTO sync_deletions (id, table_name, record_id, deleted_at, company_id) VALUES (?, ?, ?, ?, ?)`).run(
                `del-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, table, recordId, new Date().toISOString(), companyId || null,
              );
            }
            result.applied++;
            continue;
          }

          const existing = this.getRecord(table, recordId);
          const serverVersion = existing ? (existing.version as number) || 0 : 0;
          const clientVersion = version || 0;

          if (operation === 'CREATE') {
            if (existing) {
              if (clientVersion > 0 && serverVersion > 0 && clientVersion !== serverVersion) {
                const conflict = this.buildConflict(table, recordId, clientVersion, serverVersion, data, existing as Record<string, unknown>);
                const resolved = this.resolveConflict('remote_wins', data, existing as Record<string, unknown>);
                conflict.resolvedData = resolved;
                result.conflicts.push(conflict);
                this.recordChange(table, recordId, 'UPDATE', existing as Record<string, unknown>, resolved, serverVersion, serverVersion + 1, companyId, deviceId);
                this.applyRecord(table, colNames, recordId, resolved);
                result.applied++;
                continue;
              }
              const oldVals = existing as Record<string, unknown>;
              const newVals = { ...oldVals, ...data };
              const nextVersion = this.incrementVersion(table, recordId);
              this.recordChange(table, recordId, 'UPDATE', oldVals, newVals, serverVersion, nextVersion, companyId, deviceId);
              this.applyRecord(table, colNames, recordId, { ...newVals, version: nextVersion });
              result.applied++;
              continue;
            }
            const record = { ...data, id: recordId, version: 1, updatedAt: new Date().toISOString() };
            this.applyRecord(table, colNames, recordId, record);
            this.recordChange(table, recordId, 'CREATE', null, record, null, 1, companyId, deviceId);
            result.applied++;
            continue;
          }

          if (operation === 'UPDATE') {
            if (!existing) {
              const record = { ...data, id: recordId, version: 1, updatedAt: new Date().toISOString() };
              this.applyRecord(table, colNames, recordId, record);
              this.recordChange(table, recordId, 'CREATE', null, record, null, 1, companyId, deviceId);
              result.applied++;
              continue;
            }

            if (serverVersion === clientVersion || clientVersion === 0) {
              const oldVals = existing as Record<string, unknown>;
              const newVals = { ...oldVals, ...data };
              const nextVersion = this.incrementVersion(table, recordId);
              this.recordChange(table, recordId, 'UPDATE', oldVals, newVals, serverVersion, nextVersion, companyId, deviceId);
              this.applyRecord(table, colNames, recordId, { ...newVals, version: nextVersion });
              result.applied++;
            } else if (clientVersion > serverVersion) {
              const oldVals = existing as Record<string, unknown>;
              const newVals = { ...oldVals, ...data };
              const nextVersion = clientVersion + 1;
              this.recordChange(table, recordId, 'UPDATE', oldVals, newVals, serverVersion, nextVersion, companyId, deviceId);
              this.applyRecord(table, colNames, recordId, { ...newVals, version: nextVersion });
              result.applied++;
            } else {
              const oldVals = existing as Record<string, unknown>;
              const newVals = { ...oldVals, ...data };
              const nextVersion = serverVersion + 1;
              this.recordChange(table, recordId, 'UPDATE', oldVals, newVals, serverVersion, nextVersion, companyId, deviceId);
              this.applyRecord(table, colNames, recordId, { ...newVals, version: nextVersion });
              result.applied++;
            }
          }
        } catch (err: any) {
          result.errors.push({ table: change.table, recordId: change.recordId, error: err.message });
        }
      }
    });

    transaction();
    return result;
  }

  pullChanges(since: string, tableName?: string): PullResult {
    const result: PullResult = { changes: {}, deletions: {}, timestamp: new Date().toISOString() };
    const tables = tableName ? [tableName] : SYNC_TABLES;

    for (const table of tables) {
      try {
        const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
        const colNames = cols.map(c => c.name);
        const hasUpdatedAt = colNames.includes('updatedAt');
        const hasCreatedAt = colNames.includes('createdAt');

        if (hasUpdatedAt) {
          result.changes[table] = db.prepare(`SELECT * FROM ${table} WHERE updatedAt >= ?`).all(since);
        } else if (hasCreatedAt) {
          result.changes[table] = db.prepare(`SELECT * FROM ${table} WHERE createdAt >= ?`).all(since);
        } else {
          result.changes[table] = [];
        }

        result.deletions[table] = (db.prepare(`
          SELECT record_id FROM sync_deletions WHERE table_name = ? AND deleted_at >= ?
        `).all(table, since) as { record_id: string }[]).map(r => r.record_id);
      } catch (err: any) {
        result.changes[table] = [];
        result.deletions[table] = [];
      }
    }

    return result;
  }

  getChangesForSupabase(): { table: string; recordId: string; operation: string; data: string }[] {
    const items = db.prepare(`
      SELECT c.* FROM sync_changelog c
      WHERE c.pushed_to_supabase = 0
      ORDER BY c.created_at ASC
      LIMIT 200
    `).all() as any[];

    return items.map(item => ({
      table: item.table_name,
      recordId: item.record_id,
      operation: item.operation,
      data: item.new_values || item.old_values || '',
    }));
  }

  markPushedToSupabase(ids: string[]) {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(', ');
    db.prepare(`UPDATE sync_changelog SET pushed_to_supabase = 1 WHERE id IN (${placeholders})`).run(...ids);
  }

  private getRecord(table: string, id: string): Record<string, unknown> | undefined {
    try {
      const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
      return row;
    } catch {
      return undefined;
    }
  }

  private applyRecord(table: string, colNames: Set<string>, id: string, data: Record<string, unknown>) {
    const insertCols = ['id', ...Array.from(colNames).filter(c => c !== 'id' && c in data)];
    const placeholders = insertCols.map(() => '?').join(', ');
    const values = insertCols.map(c => {
      const v = data[c];
      if (v === undefined) return null;
      if (typeof v === 'boolean') return v ? 1 : 0;
      if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
        return JSON.stringify(v);
      }
      return v;
    });

    db.prepare(`INSERT OR REPLACE INTO ${table} (${insertCols.join(', ')}) VALUES (${placeholders})`).run(...values);
  }

  private buildConflict(
    table: string, recordId: string,
    clientVersion: number, serverVersion: number,
    clientData: Record<string, unknown>, serverData: Record<string, unknown>,
  ): SyncConflict {
    return {
      table, recordId, clientVersion, serverVersion,
      clientData, serverData,
      resolvedData: {},
      strategy: 'remote_wins',
    };
  }

  private resolveConflict(strategy: string, clientData: Record<string, unknown>, serverData: Record<string, unknown>): Record<string, unknown> {
    if (strategy === 'remote_wins') return { ...clientData, ...serverData };
    if (strategy === 'client_wins') return { ...serverData, ...clientData };
    if (strategy === 'last_write_wins') {
      const clientUpdated = clientData.updatedAt as string || '';
      const serverUpdated = serverData.updatedAt as string || '';
      return clientUpdated >= serverUpdated
        ? { ...serverData, ...clientData }
        : { ...clientData, ...serverData };
    }
    return { ...clientData, ...serverData };
  }
}

export const syncEngine = new SyncEngine();
