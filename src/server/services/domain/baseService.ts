import db from '../../database/db.js';
import { enqueue } from '../../sync/syncQueue.js';
import type { SyncOperation } from '../../sync/syncQueue.js';

export interface ColumnMap {
  sqlite: string;
  pg: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export abstract class BaseService {
  constructor(
    protected tableName: string,
    protected pgTableName: string,
    protected columnMaps: ColumnMap[]
  ) {}

  protected sqliteColumns(): string[] {
    return this.columnMaps.map(m => m.sqlite);
  }

  protected pgColumns(): string[] {
    return this.columnMaps.map(m => m.pg);
  }

  protected toPg(sqliteKey: string): string {
    const map = this.columnMaps.find(m => m.sqlite === sqliteKey);
    return map?.pg || sqliteKey.replace(/([A-Z])/g, '_$1').toLowerCase();
  }

  protected toSqlite(pgKey: string): string {
    const map = this.columnMaps.find(m => m.pg === pgKey);
    return map?.sqlite || pgKey;
  }

  protected toPgRecord(record: Record<string, any>): Record<string, any> {
    const pg: Record<string, any> = {};
    for (const [key, value] of Object.entries(record)) {
      if (value === undefined) continue;
      pg[this.toPg(key)] = value;
    }
    return pg;
  }

  protected now(): string {
    return new Date().toISOString();
  }

  protected enqueueSync(operation: SyncOperation, recordId: string, payload: Record<string, unknown>, companyId?: string, deviceId?: string): void {
    enqueue(this.tableName, recordId, operation, payload, companyId, deviceId);
  }

  protected getAllRaw<T = any>(tenantId: string, orderBy = ''): T[] {
    const cols = this.sqliteColumns().join(', ');
    const order = orderBy ? ` ORDER BY ${orderBy}` : '';
    return db.prepare(`SELECT ${cols} FROM ${this.tableName} WHERE tenantId = ?${order}`).all(tenantId) as T[];
  }

  protected getAllPaginated<T = any>(tenantId: string, page = 1, limit = 50, orderBy = ''): PaginatedResult<T> {
    const cols = this.sqliteColumns().join(', ');
    const order = orderBy ? ` ORDER BY ${orderBy}` : '';
    const offset = (page - 1) * limit;
    const total = (db.prepare(`SELECT COUNT(*) as count FROM ${this.tableName} WHERE tenantId = ?`).get(tenantId) as any).count;
    const data = db.prepare(`SELECT ${cols} FROM ${this.tableName} WHERE tenantId = ?${order} LIMIT ? OFFSET ?`).all(tenantId, limit, offset) as T[];
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  protected getByIdRaw<T = any>(id: string): T | undefined {
    const cols = this.sqliteColumns().join(', ');
    return db.prepare(`SELECT ${cols} FROM ${this.tableName} WHERE id = ?`).get(id) as T | undefined;
  }

  protected insertRaw(data: Record<string, any>): void {
    const cols = this.sqliteColumns().filter(c => c in data);
    const placeholders = cols.map(() => '?').join(', ');
    const values = cols.map(c => data[c]);
    db.prepare(`INSERT INTO ${this.tableName} (${cols.join(', ')}) VALUES (${placeholders})`).run(...values);
  }

  protected updateRaw(id: string, data: Record<string, any>): void {
    const cols = this.sqliteColumns().filter(c => c in data && c !== 'id');
    if (cols.length === 0) return;
    const setClause = cols.map(c => `${c} = ?`).join(', ');
    const values = [...cols.map(c => data[c]), id];
    db.prepare(`UPDATE ${this.tableName} SET ${setClause} WHERE id = ?`).run(...values);
  }

  protected deleteRaw(id: string): void {
    db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`).run(id);
  }

  protected runInTransaction<T>(fn: () => T): T {
    const transaction = db.transaction(fn);
    return transaction();
  }
}
