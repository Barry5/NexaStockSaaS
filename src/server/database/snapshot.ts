import db from './db.js';
import fs from 'fs';
import path from 'path';

const SNAPSHOT_PATH = path.join(process.cwd(), 'snapshot.json');

function getTables(): string[] {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_migrations'").all() as { name: string }[];
  return rows.map(r => r.name);
}

function getColumns(table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.map(r => r.name);
}

export function exportSnapshot(): void {
  const tables = getTables();
  const data: Record<string, any[]> = {};
  for (const table of tables) {
    data[table] = db.prepare(`SELECT * FROM ${table}`).all();
    console.log(`  ${table}: ${data[table].length} rows`);
  }
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(data, null, 2));
  console.log(`\nSnapshot saved to ${SNAPSHOT_PATH}`);
}

export function importSnapshot(): void {
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    console.log('No snapshot file found, skipping import.');
    return;
  }

  const data: Record<string, any[]> = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'));
  const tables = getTables();

  const transaction = db.transaction(() => {
    db.pragma('foreign_keys = OFF');

    for (const table of tables) {
      if (!data[table] || data[table].length === 0) continue;
      const columns = getColumns(table);
      const placeholders = columns.map(() => '?').join(', ');
      const deleteStmt = db.prepare(`DELETE FROM ${table}`);
      deleteStmt.run();
      const insertStmt = db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`);
      for (const row of data[table]) {
        insertStmt.run(columns.map(c => row[c]));
      }
      console.log(`  ${table}: ${data[table].length} rows restored`);
    }

    db.pragma('foreign_keys = ON');
  });

  transaction();
  console.log('\nSnapshot restored successfully.');
}

if (process.argv[1]?.endsWith('snapshot.ts') || process.argv[1]?.endsWith('snapshot.js')) {
  const cmd = process.argv[2];
  if (cmd === 'export') {
    console.log('Exporting data snapshot...');
    exportSnapshot();
  } else if (cmd === 'import') {
    console.log('Importing data snapshot...');
    importSnapshot();
  } else {
    console.log('Usage: tsx snapshot.ts [export|import]');
  }
}
