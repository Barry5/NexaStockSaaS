import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'database.db');
const db = new Database(dbPath);

// Enable WAL mode & foreign keys for high performance and integrity
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Backup directory
const BACKUP_DIR = path.join(process.cwd(), 'backups');

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

export function createBackup(): string {
  ensureBackupDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = path.join(BACKUP_DIR, `database-backup-${timestamp}.db`);
  db.backup(backupPath);
  console.log(`[BACKUP] Database backed up to: ${backupPath}`);
  return backupPath;
}

export function cleanupOldBackups(maxBackups: number = 30) {
  ensureBackupDir();
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('database-backup-') && f.endsWith('.db'))
    .sort()
    .reverse();
  const toDelete = files.slice(maxBackups);
  for (const file of toDelete) {
    fs.unlinkSync(path.join(BACKUP_DIR, file));
    console.log(`[BACKUP] Removed old backup: ${file}`);
  }
}

export function getBackupList(): { name: string; size: number; date: string }[] {
  ensureBackupDir();
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('database-backup-') && f.endsWith('.db'))
    .map(f => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return { name: f, size: stat.size, date: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

// Create a backup on startup
try {
  createBackup();
  cleanupOldBackups(30);
} catch (err) {
  console.error('[BACKUP] Startup backup failed:', err);
}

// Schedule automatic backup every hour
const BACKUP_INTERVAL = 60 * 60 * 1000;
setInterval(() => {
  try {
    createBackup();
    cleanupOldBackups(30);
  } catch (err) {
    console.error('[BACKUP] Scheduled backup failed:', err);
  }
}, BACKUP_INTERVAL);

export default db;
