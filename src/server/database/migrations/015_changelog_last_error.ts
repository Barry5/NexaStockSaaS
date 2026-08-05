import { Database } from 'better-sqlite3';

// Diagnostic des échecs de push : persiste le message d'erreur du dernier
// échec sur l'item du changelog (retourné par getDeadChanges -> /api/sync/failed).
export function up(db: Database) {
  const cols = db.prepare(`PRAGMA table_info(sync_changelog)`).all() as { name: string }[];
  if (!cols.some(c => c.name === 'last_error')) {
    db.exec(`ALTER TABLE sync_changelog ADD COLUMN last_error TEXT`);
  }
  console.log('Migration 015_changelog_last_error applied: last_error');
}
