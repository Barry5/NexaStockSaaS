import db from '../database/db.js';
import type { Repository, Syncable } from './baseRepository.js';

export class LocalRepository<T extends Syncable> implements Repository<T> {
  constructor(
    protected tableName: string,
    protected idColumn: string = 'id'
  ) {}

  getAll(tenantId?: string): T[] {
    if (tenantId) {
      return db.prepare(`SELECT * FROM ${this.tableName} WHERE tenantId = ? AND deleted_at IS NULL ORDER BY created_at DESC`)
        .all(tenantId) as T[];
    }
    return db.prepare(`SELECT * FROM ${this.tableName} WHERE deleted_at IS NULL ORDER BY created_at DESC`).all() as T[];
  }

  getById(id: string): T | undefined {
    return db.prepare(`SELECT * FROM ${this.tableName} WHERE ${this.idColumn} = ? AND deleted_at IS NULL`)
      .get(id) as T | undefined;
  }

  create(data: Partial<T>): T {
    const now = new Date().toISOString();
    const record = {
      ...data,
      id: data.id || `gen-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      created_at: data.created_at || now,
      updated_at: now,
      version: 1,
      sync_status: 'pending',
    } as T;

    const columns = Object.keys(record as object);
    const placeholders = columns.map(() => '?').join(', ');
    const values = columns.map(c => (record as any)[c]);

    db.prepare(`INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES (${placeholders})`).run(...values);
    return record;
  }

  update(id: string, data: Partial<T>): T | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updates = { ...data, updated_at: now, sync_status: 'pending' } as any;

    if (existing.version !== undefined) {
      updates.version = (existing.version as number) + 1;
    }

    const setClause = Object.keys(updates)
      .filter(k => k !== this.idColumn)
      .map(k => `${k} = ?`)
      .join(', ');
    const values = Object.keys(updates)
      .filter(k => k !== this.idColumn)
      .map(k => updates[k]);

    values.push(id);
    db.prepare(`UPDATE ${this.tableName} SET ${setClause} WHERE ${this.idColumn} = ?`).run(...values);

    return this.getById(id);
  }

  delete(id: string): boolean {
    const existing = this.getById(id);
    if (!existing) return false;

    db.prepare(`UPDATE ${this.tableName} SET deleted_at = ?, sync_status = 'pending', updated_at = ? WHERE ${this.idColumn} = ?`)
      .run(new Date().toISOString(), new Date().toISOString(), id);
    return true;
  }

  hardDelete(id: string): boolean {
    const result = db.prepare(`DELETE FROM ${this.tableName} WHERE ${this.idColumn} = ?`).run(id);
    return result.changes > 0;
  }

  count(tenantId?: string): number {
    if (tenantId) {
      const row = db.prepare(`SELECT COUNT(*) as count FROM ${this.tableName} WHERE tenantId = ? AND deleted_at IS NULL`).get(tenantId) as { count: number };
      return row.count;
    }
    const row = db.prepare(`SELECT COUNT(*) as count FROM ${this.tableName} WHERE deleted_at IS NULL`).get() as { count: number };
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
