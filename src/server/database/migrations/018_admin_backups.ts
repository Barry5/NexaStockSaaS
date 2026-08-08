import { Database } from 'better-sqlite3';

// Registre des sauvegardes gérées par la Console Super Admin
// ("Sauvegardes & Restauration") : métadonnées des sauvegardes SQLite et
// Supabase (checksum SHA-256, taille, statut, version de base, statistiques
// par table). Chaque opération de sauvegarde/restauration/vérification est
// également journalisée dans audit_logs.
export function up(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_backups (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('sqlite', 'supabase')),
      label TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'error', 'verified')),
      checksum TEXT NOT NULL DEFAULT '',
      version TEXT NOT NULL DEFAULT '',
      baseVersion TEXT NOT NULL DEFAULT '',
      filePath TEXT NOT NULL DEFAULT '',
      stats TEXT NOT NULL DEFAULT '{}',
      restoredAt TEXT,
      restoredFrom TEXT,
      createdBy TEXT NOT NULL DEFAULT 'system'
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_admin_backups_created ON admin_backups(createdAt DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_admin_backups_type ON admin_backups(type)`);
}

export function down(db: Database) {
  db.exec(`DROP TABLE IF EXISTS admin_backups`);
}
