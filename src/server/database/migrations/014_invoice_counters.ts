import { Database } from 'better-sqlite3';

// Migration 014 : compteurs persistants de numérotation comptable (audit §2.5,
// P5) + index SQLite sur les tables de sync (audit §4.3, S3).
//
// Les numéros de facture/BL/retour étaient générés par COUNT(*)+1 : doublons
// dès qu'un document est supprimé, courses en multi-instance. Le compteur
// persistant (tenantId, type, year) est immune aux suppressions et atomique
// (INSERT ... ON CONFLICT DO UPDATE counter = counter + 1, en transaction).
export function up(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoice_counters (
      tenantId TEXT NOT NULL,
      type TEXT NOT NULL,
      year INTEGER NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (tenantId, type, year)
    )
  `);

  // Hot path des requêtes de sync (hasPendingChangesForTable,
  // hasDeadChangesForTable, getChangesForSupabase) et de la résolution des
  // tombstones (audit §4.3, recommandation 1).
  db.exec(`CREATE INDEX IF NOT EXISTS idx_changelog_push_status ON sync_changelog(pushed_to_supabase, table_name, status, retry_count)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_deletions_table ON sync_deletions(table_name, deleted_at)`);

  console.log('Migration 014 applied: invoice_counters + index sync_changelog/sync_deletions');
}
