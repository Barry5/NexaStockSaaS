import { Database } from 'better-sqlite3';

// Persistance des conflits de sync (audit §8.2.1) : chaque conflit détecté au
// push (snapshot périmé, CREATE collision, UPDATE sur record supprimé…) est
// journalisé dans sync_conflicts pour la supervision (qui a gagné, pourquoi,
// avec quelles données). Purge à 30 j (avec les dead du changelog).
export function up(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_conflicts (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      client_version INTEGER NOT NULL DEFAULT 0,
      server_version INTEGER NOT NULL DEFAULT 0,
      client_data TEXT,
      server_data TEXT,
      resolved_data TEXT,
      strategy TEXT NOT NULL DEFAULT 'remote_wins',
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sync_conflicts_created ON sync_conflicts(created_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sync_conflicts_table ON sync_conflicts(table_name, record_id)`);
  console.log('Migration 016_sync_conflicts applied: sync_conflicts');
}
