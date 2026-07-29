import { Database } from 'better-sqlite3';

export function up(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      operation TEXT NOT NULL CHECK(operation IN ('CREATE','UPDATE','DELETE')),
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 5,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','processing','completed','failed')),
      device_id TEXT,
      company_id TEXT,
      last_error TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_tracking (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL UNIQUE,
      last_sync_at TEXT,
      last_sync_version INTEGER DEFAULT 0,
      device_id TEXT,
      company_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sync_queue_table ON sync_queue(table_name)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sync_queue_created ON sync_queue(created_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sync_tracking_table ON sync_tracking(table_name)`);

  console.log('Migration 011_sync_tables applied: sync_queue, sync_tracking');
}
