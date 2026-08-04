import { Database } from 'better-sqlite3';

// Phase 1 du plan de fiabilisation sync : retry borné + dead-letter sur le
// changelog (sync_changelog), en remplacement du retry non borné actuel.
// Les items `dead` restent visibles via /api/sync/failed pour diagnostic.
export function up(db: Database) {
  const cols = db.prepare(`PRAGMA table_info(sync_changelog)`).all() as { name: string }[];
  const names = new Set(cols.map(c => c.name));

  if (!names.has('retry_count')) {
    db.exec(`ALTER TABLE sync_changelog ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0`);
  }
  if (!names.has('max_retries')) {
    db.exec(`ALTER TABLE sync_changelog ADD COLUMN max_retries INTEGER NOT NULL DEFAULT 10`);
  }
  if (!names.has('status')) {
    db.exec(`ALTER TABLE sync_changelog ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_changelog_status ON sync_changelog(status)`);

  console.log('Migration 013_changelog_retry applied: retry_count, max_retries, status');
}
