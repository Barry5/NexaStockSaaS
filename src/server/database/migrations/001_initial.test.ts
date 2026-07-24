import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { up } from './001_initial.js';

describe('tenant migration schema', () => {
  it('adds the expected tenant columns for SaaS admin flows', () => {
    const db = new Database(':memory:');

    try {
      up(db);
      const columns = db.prepare("PRAGMA table_info(tenants)").all() as Array<{ name: string }>;
      const names = columns.map(column => column.name);

      expect(names).toEqual(expect.arrayContaining(['email', 'city', 'country', 'updatedAt']));
    } finally {
      db.close();
    }
  });
});
