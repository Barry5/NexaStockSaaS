import db from '../database/db.js';
import type { Repository, Syncable } from './baseRepository.js';

export class LocalRepository<T extends Syncable> implements Repository<T> {
  private columnCache: Set<string> | null = null;

  constructor(
    protected tableName: string,
    protected idColumn: string = 'id'
  ) {}

  private columns(): Set<string> {
    if (!this.columnCache) {
      const rows = db.prepare(`PRAGMA table_info(${this.tableName})`).all() as { name: string }[];
      this.columnCache = new Set(rows.map(r => r.name));
    }
    return this.columnCache;
  }

  private hasColumn(name: string): boolean {
    return this.columns().has(name);
  }

  private timestampColumn(kind: 'created' | 'updated'): string | null {
    const camel = kind === 'created' ? 'createdAt' : 'updatedAt';
    const snake = kind === 'created' ? 'created_at' : 'updated_at';
    if (this.hasColumn(camel)) return camel;
    if (this.hasColumn(snake)) return snake;
    return null;
  }

  private liveWhereClause(): string {
    return this.hasColumn('deleted_at') ? ' AND deleted_at IS NULL' : '';
  }

  getAll(tenantId?: string): T[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (tenantId && this.hasColumn('tenantId')) {
      where.push('tenantId = ?');
      params.push(tenantId);
    } else if (tenantId && this.hasColumn('tenant_id')) {
      where.push('tenant_id = ?');
      params.push(tenantId);
    }
    if (this.hasColumn('deleted_at')) where.push('deleted_at IS NULL');

    const orderCol = this.timestampColumn('created');
    const sql = [
      `SELECT * FROM ${this.tableName}`,
      where.length ? `WHERE ${where.join(' AND ')}` : '',
      orderCol ? `ORDER BY ${orderCol} DESC` : '',
    ].filter(Boolean).join(' ');

    return db.prepare(sql).all(...params) as T[];
  }

  getById(id: string): T | undefined {
    return db.prepare(`SELECT * FROM ${this.tableName} WHERE ${this.idColumn} = ?${this.liveWhereClause()}`)
      .get(id) as T | undefined;
  }

  create(data: Partial<T>): T {
    const now = new Date().toISOString();
    const record: Record<string, unknown> = {
      ...data,
      id: (data as any).id || `gen-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    };

    const createdCol = this.timestampColumn('created');
    const updatedCol = this.timestampColumn('updated');
    if (createdCol && record[createdCol] === undefined) record[createdCol] = now;
    if (updatedCol) record[updatedCol] = now;
    if (this.hasColumn('version')) record.version = 1;
    if (this.hasColumn('sync_status')) record.sync_status = 'pending';

    const columns = Object.keys(record).filter(c => this.hasColumn(c));
    const placeholders = columns.map(() => '?').join(', ');
    const values = columns.map(c => record[c]);

    db.prepare(`INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES (${placeholders})`).run(...values);
    return this.getById(record[this.idColumn] as string) || (record as unknown as T);
  }

  update(id: string, data: Partial<T>): T | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { ...data };
    const updatedCol = this.timestampColumn('updated');
    if (updatedCol) updates[updatedCol] = now;
    if (this.hasColumn('sync_status')) updates.sync_status = 'pending';

    if (this.hasColumn('version') && existing.version !== undefined) {
      updates.version = (existing.version as number) + 1;
    }

    const cols = Object.keys(updates).filter(k => k !== this.idColumn && this.hasColumn(k));
    if (cols.length === 0) return existing;

    const setClause = cols.map(k => `${k} = ?`).join(', ');
    const values = cols.map(k => updates[k]);
    values.push(id);
    db.prepare(`UPDATE ${this.tableName} SET ${setClause} WHERE ${this.idColumn} = ?`).run(...values);

    return this.getById(id);
  }

  delete(id: string): boolean {
    const existing = this.getById(id);
    if (!existing) return false;

    if (this.hasColumn('deleted_at')) {
      const updates: Record<string, unknown> = { deleted_at: new Date().toISOString() };
      const updatedCol = this.timestampColumn('updated');
      if (updatedCol) updates[updatedCol] = updates.deleted_at;
      if (this.hasColumn('sync_status')) updates.sync_status = 'pending';
      const cols = Object.keys(updates).filter(c => this.hasColumn(c));
      const setClause = cols.map(c => `${c} = ?`).join(', ');
      db.prepare(`UPDATE ${this.tableName} SET ${setClause} WHERE ${this.idColumn} = ?`).run(...cols.map(c => updates[c]), id);
      return true;
    }

    return this.hardDelete(id);
  }

  hardDelete(id: string): boolean {
    const result = db.prepare(`DELETE FROM ${this.tableName} WHERE ${this.idColumn} = ?`).run(id);
    return result.changes > 0;
  }

  count(tenantId?: string): number {
    const where: string[] = [];
    const params: unknown[] = [];
    if (tenantId && this.hasColumn('tenantId')) {
      where.push('tenantId = ?');
      params.push(tenantId);
    } else if (tenantId && this.hasColumn('tenant_id')) {
      where.push('tenant_id = ?');
      params.push(tenantId);
    }
    if (this.hasColumn('deleted_at')) where.push('deleted_at IS NULL');
    const sql = `SELECT COUNT(*) as count FROM ${this.tableName}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`;
    const row = db.prepare(sql).get(...params) as { count: number };
    return row.count;
  }

  query(sql: string, params: any[] = []): T[] {
    return db.prepare(sql).all(...params) as T[];
  }

  queryOne(sql: string, params: any[] = []): T | undefined {
    return db.prepare(sql).get(...params) as T | undefined;
  }

  transaction<TResult>(fn: () => TResult): TResult {
    return db.transaction(fn)();
  }
}