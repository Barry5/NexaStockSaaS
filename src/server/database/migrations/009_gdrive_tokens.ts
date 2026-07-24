import { Database } from 'better-sqlite3';

export function up(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS gdrive_tokens (
      tenantId TEXT PRIMARY KEY,
      tokens TEXT NOT NULL,
      email TEXT,
      connectedAt TEXT NOT NULL,
      FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);
  console.log('Migration 009: gdrive_tokens table created.');
}
