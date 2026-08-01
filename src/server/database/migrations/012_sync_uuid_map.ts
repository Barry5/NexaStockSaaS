import { Database } from 'better-sqlite3';

export function up(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_uuid_map (
      sqlite_id TEXT PRIMARY KEY,
      pg_uuid TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_uuid_map_pg_uuid ON sync_uuid_map(pg_uuid)`);

  console.log('Migration 012_sync_uuid_map applied: sync_uuid_map');
}
