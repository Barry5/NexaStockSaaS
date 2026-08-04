import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'database.db');
if (!fs.existsSync(DB_PATH)) {
  console.error('DB not found at', DB_PATH);
  process.exit(2);
}

const db = new Database(DB_PATH, { readonly: true });

const failedQuery = `SELECT id, table_name, record_id, operation, retry_count, max_retries, last_error, created_at, device_id, company_id
FROM sync_queue
WHERE status = 'failed' OR (status = 'pending' AND retry_count >= max_retries)
ORDER BY created_at ASC`;

const failed = db.prepare(failedQuery).all();

console.log('\n== Failed sync_queue items ==\n');
if (failed.length === 0) {
  console.log('No failed items');
} else {
  failed.forEach((r, i) => {
    console.log(`${i + 1}. id=${r.id} table=${r.table_name} op=${r.operation} record=${r.record_id} retries=${r.retry_count}/${r.max_retries} created_at=${r.created_at}`);
    console.log(`   last_error: ${r.last_error}`);
    console.log(`   device: ${r.device_id} company: ${r.company_id}\n`);
  });
}

const changelog = db.prepare(
  'SELECT id, table_name, record_id, operation, created_at, pushed_to_supabase, new_values, old_values FROM sync_changelog ORDER BY created_at DESC LIMIT 10'
).all();

console.log('\n== Recent sync_changelog (last 10) ==\n');
changelog.forEach(c => {
  console.log(`${c.created_at} ${c.operation} ${c.table_name} ${c.record_id} pushed=${c.pushed_to_supabase} id=${c.id}`);
});

const deletions = db.prepare(
  'SELECT id, table_name, record_id, deleted_at, company_id FROM sync_deletions ORDER BY deleted_at DESC LIMIT 10'
).all();

console.log('\n== Recent sync_deletions (last 10) ==\n');
deletions.forEach(d => {
  console.log(`${d.deleted_at} ${d.table_name} ${d.record_id} id=${d.id} company=${d.company_id}`);
});

db.close();
