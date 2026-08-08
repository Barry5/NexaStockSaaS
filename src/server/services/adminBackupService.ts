import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import db, { BACKUP_DIR } from '../database/db.js';
import {
  getAdminClient,
  isSupabaseConfigured,
} from './supabase/supabaseService.js';
import {
  SYNC_TABLES,
  TABLE_MAPPINGS,
  TABLE_SYNC_PRIORITY,
} from '../sync/syncTables.js';
import { runCoherenceCheck, type CoherenceReport } from './coherenceService.js';

// ============================================================================
// Sauvegardes & Restauration (Console Super Admin).
// - Sauvegarde SQLite : copie binaire du fichier de base (API better-sqlite3
//   backup, cohérente même en WAL) + checksum SHA-256.
// - Sauvegarde Supabase : dump JSON de TOUTES les tables synchronisées
//   (via le client admin — SERVICE_ROLE_KEY n'est JAMAIS exposé au client).
// - Restauration sécurisée : vérification du backup + checksum, sauvegarde de
//   sécurité de l'état courant, contrôle de cohérence AVANT, restauration,
//   vérification d'intégrité, contrôle de cohérence APRÈS. Journalisée.
// ============================================================================

export type BackupType = 'sqlite' | 'supabase';
export type BackupStatus = 'ok' | 'error' | 'verified';

export interface AdminBackupRecord {
  id: string;
  type: BackupType;
  label: string;
  createdAt: string;
  size: number;
  status: BackupStatus;
  checksum: string;
  version: string;
  baseVersion: string;
  filePath: string;
  stats: string;
  restoredAt: string | null;
  restoredFrom: string | null;
  createdBy: string;
}

export interface RestoreReport {
  backupId: string;
  backupType: BackupType;
  startedAt: string;
  completedAt: string;
  verified: boolean;
  safetyBackupId: string | null;
  coherenceBefore: CoherenceReport | null;
  coherenceAfter: CoherenceReport | null;
  integrity: { ok: boolean; details: string } | null;
  tables: { restored: number; wiped: number };
  message: string;
  success: boolean;
}

const APP_VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'))?.version || 'unknown';
  } catch {
    return 'unknown';
  }
})();

const KEEP_BACKUPS_PER_TYPE = 10;

export function sha256(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

// PRAGMA integrity_check renvoie [{ integrity_check: 'ok' }] en better-sqlite3.
export function pragmaIntegrityResult(res: unknown): string {
  const arr = Array.isArray(res) ? res : [res];
  if (arr.length === 0) return 'ok';
  const first = arr[0];
  if (first && typeof first === 'object') {
    const v = Object.values(first as Record<string, unknown>)[0];
    return v === null || v === undefined ? '' : String(v);
  }
  return first === null || first === undefined ? '' : String(first);
}

function ensureBackupDir(): string {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  return BACKUP_DIR;
}

function insertRecord(rec: Partial<AdminBackupRecord>): AdminBackupRecord {
  const full: AdminBackupRecord = {
    id: rec.id as string,
    type: rec.type as BackupType,
    label: rec.label || '',
    createdAt: rec.createdAt as string,
    size: rec.size || 0,
    status: rec.status || 'ok',
    checksum: rec.checksum || '',
    version: rec.version || APP_VERSION,
    baseVersion: rec.baseVersion || '',
    filePath: rec.filePath || '',
    stats: rec.stats || '{}',
    restoredAt: rec.restoredAt || null,
    restoredFrom: rec.restoredFrom || null,
    createdBy: rec.createdBy || 'system',
  };
  db.prepare(`
    INSERT INTO admin_backups (id, type, label, createdAt, size, status, checksum, version, baseVersion, filePath, stats, restoredAt, restoredFrom, createdBy)
    VALUES (@id, @type, @label, @createdAt, @size, @status, @checksum, @version, @baseVersion, @filePath, @stats, @restoredAt, @restoredFrom, @createdBy)
  `).run(full as any);
  return full;
}

function purgeOldBackups(type: BackupType, keep: number = KEEP_BACKUPS_PER_TYPE): number {
  const rows = db.prepare(
    `SELECT id FROM admin_backups WHERE type = ? ORDER BY createdAt DESC`
  ).all(type) as { id: string }[];
  let removed = 0;
  for (const row of rows.slice(keep)) {
    try {
      const rec = db.prepare(`SELECT filePath FROM admin_backups WHERE id = ?`).get(row.id) as { filePath: string } | undefined;
      if (rec?.filePath && fs.existsSync(rec.filePath)) fs.unlinkSync(rec.filePath);
      db.prepare(`DELETE FROM admin_backups WHERE id = ?`).run(row.id);
      removed++;
    } catch {
      /* ignore */
    }
  }
  return removed;
}

export function logAudit(action: string, details: string, userName = 'system'): void {
  try {
    db.prepare(`INSERT INTO audit_logs (id, timestamp, userId, userName, action, details, tenantId) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(`audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, new Date().toISOString(), 'sa-root', userName, action, details, '__superadmin__');
  } catch {
    /* le journal ne doit pas bloquer une opération */
  }
}

// ============================================================================
// SAUVEGARDES
// ============================================================================

/** Sauvegarde binaire du fichier SQLite (via l'API backup, cohérente en WAL). */
export async function createSqliteBackup(label = 'Sauvegarde SQLite', createdBy = 'system'): Promise<AdminBackupRecord> {
  ensureBackupDir();
  const id = `sqlite-backup-${Date.now()}`;
  const filePath = path.join(BACKUP_DIR, `${id}.db`);
  await db.backup(filePath);
  const size = fs.statSync(filePath).size;
  const checksum = sha256(filePath);
  const stats = JSON.stringify({
    tables: SYNC_TABLES.map(t => {
      try {
        return { table: t, rows: (db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get() as any).c };
      } catch {
        return { table: t, rows: -1 };
      }
    }),
  });
  const rec = insertRecord({ id, type: 'sqlite', label, createdAt: new Date().toISOString(), size, status: 'ok', checksum, filePath, stats, createdBy });
  purgeOldBackups('sqlite');
  logAudit('BACKUP_SQLITE_CREATE', `Sauvegarde SQLite créée: ${id} (${size} o, checksum ${checksum.slice(0, 12)}…)`, createdBy);
  return rec;
}

/** Récupère toutes les lignes d'une table PG (paginé). */
async function fetchAllRows(table: string): Promise<{ rows: any[]; error: any }> {
  const client = getAdminClient();
  const rows: any[] = [];
  let offset = 0;
  const pageSize = 1000;
  try {
    while (true) {
      const { data, error } = await client.from(table).select('*').range(offset, offset + pageSize - 1);
      if (error) return { rows, error };
      if (!data || data.length === 0) break;
      rows.push(...data);
      offset += data.length;
      if (data.length < pageSize) break;
    }
    return { rows, error: null };
  } catch (e: any) {
    return { rows, error: e };
  }
}

/** Sauvegarde logique (JSON) de toutes les tables synchronisées côté Supabase. */
export async function createSupabaseBackup(label = 'Sauvegarde Supabase', createdBy = 'system'): Promise<AdminBackupRecord> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase n\'est pas configuré (SUPABASE_URL / SERVICE_ROLE_KEY manquants).');
  }
  ensureBackupDir();
  const id = `supabase-backup-${Date.now()}`;
  const filePath = path.join(BACKUP_DIR, `${id}.json`);

  const tables: Record<string, { rows: any[]; error?: string }> = {};
  let totalRows = 0;
  const errors: string[] = [];

  for (const table of SYNC_TABLES) {
    const pgTable = (TABLE_MAPPINGS.find(m => m.sqliteName === table)?.pgName) || table;
    const { rows, error } = await fetchAllRows(pgTable);
    if (error) {
      tables[table] = { rows: [], error: error.message };
      errors.push(`${pgTable}: ${error.message}`);
    } else {
      tables[table] = { rows };
      totalRows += rows.length;
    }
  }

  const payload = {
    format: 'nexastock-supabase-backup',
    version: 1,
    generatedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    tableCounts: Object.fromEntries(SYNC_TABLES.map(t => [t, (tables[t]?.rows || []).length])),
    tables,
  };

  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  const size = fs.statSync(filePath).size;
  const checksum = sha256(filePath);
  const rec = insertRecord({
    id, type: 'supabase', label, createdAt: payload.generatedAt, size, status: errors.length ? 'error' : 'ok',
    checksum, filePath,
    stats: JSON.stringify({ tableCounts: payload.tableCounts, totalRows, errors: errors.length ? errors : undefined }),
    createdBy,
  });
  purgeOldBackups('supabase');
  logAudit('BACKUP_SUPABASE_CREATE', `Sauvegarde Supabase créée: ${id} (${totalRows} lignes, ${errors.length} erreur(s))`, createdBy);
  return rec;
}

export function listBackups(): AdminBackupRecord[] {
  return db.prepare(`SELECT * FROM admin_backups ORDER BY createdAt DESC`).all() as AdminBackupRecord[];
}

export function getBackup(id: string): AdminBackupRecord | null {
  return (db.prepare(`SELECT * FROM admin_backups WHERE id = ?`).get(id) as AdminBackupRecord) || null;
}

/** Vérifie le checksum d'un backup (et l'intégrité SQLite/JSON si pertinent). */
export function verifyBackup(id: string): { ok: boolean; checksumMatch: boolean; integrity: string | null; message: string } {
  const rec = getBackup(id);
  if (!rec) throw new Error('Sauvegarde introuvable.');
  if (!fs.existsSync(rec.filePath)) {
    db.prepare(`UPDATE admin_backups SET status = 'error' WHERE id = ?`).run(id);
    return { ok: false, checksumMatch: false, integrity: null, message: 'Fichier de sauvegarde introuvable sur le disque.' };
  }
  const actual = sha256(rec.filePath);
  const checksumMatch = actual === rec.checksum;
  let integrity: string | null = null;
  if (rec.type === 'sqlite') {
    if (checksumMatch) {
      try {
        const source = new Database(rec.filePath, { readonly: true });
        const res = source.pragma('integrity_check');
        source.close();
        integrity = pragmaIntegrityResult(res);
      } catch (e: any) {
        integrity = `Ouverture impossible: ${e.message}`;
      }
    } else {
      integrity = 'checksum_ko';
    }
  } else {
    // Sauvegarde Supabase : validation du format JSON + présence des tables
    try {
      const payload = JSON.parse(fs.readFileSync(rec.filePath, 'utf8'));
      integrity = payload?.format === 'nexastock-supabase-backup'
        ? `json_ok (${Object.keys(payload.tables || {}).length} tables)`
        : 'format_invalide';
    } catch (e: any) {
      integrity = `json_ko: ${e.message}`;
    }
  }
  const ok = checksumMatch && integrity !== null && integrity !== 'checksum_ko' && integrity !== 'format_invalide' && integrity !== 'not ok' && !String(integrity).startsWith('Ouverture impossible') && !String(integrity).startsWith('json_ko');
  db.prepare(`UPDATE admin_backups SET status = ? WHERE id = ?`).run(ok ? 'verified' : 'error', id);
  return { ok, checksumMatch, integrity, message: ok ? 'Sauvegarde valide (checksum + intégrité OK).' : 'Sauvegarde invalide — ne pas restaurer.' };
}

export function deleteBackup(id: string): { removed: boolean; refused: boolean; reason?: string } {
  const rec = getBackup(id);
  if (!rec) throw new Error('Sauvegarde introuvable.');
  if (rec.type === 'sqlite') {
    const sqliteCount = (db.prepare(`SELECT COUNT(*) as c FROM admin_backups WHERE type = 'sqlite'`).get() as any).c;
    if (sqliteCount <= 1) {
      return { removed: false, refused: true, reason: 'Impossible de supprimer la dernière sauvegarde SQLite (protection anti-perte de données).' };
    }
  }
  try { if (fs.existsSync(rec.filePath)) fs.unlinkSync(rec.filePath); } catch { /* ignore */ }
  db.prepare(`DELETE FROM admin_backups WHERE id = ?`).run(id);
  logAudit('BACKUP_DELETE', `Sauvegarde supprimée: ${id} (${rec.type})`, 'system');
  return { removed: true, refused: false };
}

// ============================================================================
// RESTAURATION
// ============================================================================

function syncTablesOrdered(): string[] {
  return [...SYNC_TABLES].sort((a, b) => (TABLE_SYNC_PRIORITY[a] ?? 50) - (TABLE_SYNC_PRIORITY[b] ?? 50));
}

function wipeLocalTable(table: string): void {
  if (table === 'users') {
    db.prepare(`DELETE FROM users WHERE id != 'u-1'`).run();
  } else {
    db.prepare(`DELETE FROM ${table}`).run();
  }
}

function insertLocalRow(table: string, row: Record<string, unknown>): void {
  const cols = Object.keys(row);
  if (cols.length === 0) return;
  const placeholders = cols.map(() => '?').join(', ');
  db.prepare(`INSERT OR REPLACE INTO ${table} (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`).run(...cols.map(c => row[c]));
}

/**
 * Restauration SQLite : vérification, sauvegarde de sécurité, contrôle de
 * cohérence AVANT, import table par table (parents avant enfants), purge des
 * files de sync, vérification d'intégrité, contrôle de cohérence APRÈS.
 * Le mapping sync_uuid_map est conservé (les UUID PG restent valides).
 */
export async function restoreSqliteBackup(id: string, createdBy = 'system'): Promise<RestoreReport> {
  const rec = getBackup(id);
  if (!rec) throw new Error('Sauvegarde introuvable.');
  if (rec.type !== 'sqlite') throw new Error('Cette sauvegarde n\'est pas de type SQLite.');
  const startedAt = new Date().toISOString();

  // 1. Vérification du backup (checksum + intégrité)
  const verified = verifyBackup(id);
  if (!verified.ok) {
    throw new Error(`La sauvegarde ${id} a échoué la vérification (${verified.message}). Restauration annulée.`);
  }

  // 2. Sauvegarde de sécurité de l'état courant
  const safety = await createSqliteBackup('Sauvegarde de sécurité avant restauration', createdBy);

  // 3. Contrôle de cohérence AVANT (diagnostic, non bloquant)
  let coherenceBefore: CoherenceReport | null = null;
  try { coherenceBefore = await runCoherenceCheck(); } catch { coherenceBefore = null; }

  // 4. Import des données depuis le fichier de sauvegarde (lecture seule)
  const source = new Database(rec.filePath, { readonly: true });
  let restored = 0;
  let wiped = 0;
  try {
    const ordered = syncTablesOrdered();
    // Suppression en sens inverse (enfants d'abord) pour respecter les FK locales
    for (const table of [...ordered].reverse()) {
      try { wipeLocalTable(table); wiped++; } catch { /* table absente du schéma */ }
    }
    for (const table of ordered) {
      const cols = (source.prepare(`PRAGMA table_info(${table})`).all() as any[]).map(c => c.name);
      if (cols.length === 0) continue;
      const rows = source.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
      for (const row of rows) {
        try { insertLocalRow(table, row); restored++; } catch { /* ligne orpheline / contrainte */ }
      }
    }
  } finally {
    source.close();
  }

  // 5. Purge des files de synchronisation (l'état restauré est la vérité locale)
  for (const t of ['sync_changelog', 'sync_deletions', 'sync_queue', 'sync_conflicts']) {
    try { db.prepare(`DELETE FROM ${t}`).run(); } catch { /* absente */ }
  }

  // 6. Vérification d'intégrité locale
  let integrity: { ok: boolean; details: string } | null = null;
  try {
    const res = db.pragma('integrity_check');
    const details = pragmaIntegrityResult(res);
    integrity = { ok: details === 'ok', details };
  } catch (e: any) {
    integrity = { ok: false, details: e.message };
  }

  // 7. Contrôle de cohérence APRÈS
  let coherenceAfter: CoherenceReport | null = null;
  try { coherenceAfter = await runCoherenceCheck(); } catch { coherenceAfter = null; }

  db.prepare(`UPDATE admin_backups SET restoredAt = ?, restoredFrom = ? WHERE id = ?`).run(startedAt, `restore:${id}`, safety.id);
  logAudit('BACKUP_SQLITE_RESTORE', `Restauration SQLite depuis ${id} (${restored} lignes importées, sauvegarde de sécurité ${safety.id})`, createdBy);

  return {
    backupId: id,
    backupType: 'sqlite',
    startedAt,
    completedAt: new Date().toISOString(),
    verified: verified.ok,
    safetyBackupId: safety.id,
    coherenceBefore,
    coherenceAfter,
    integrity,
    tables: { restored, wiped },
    message: `Restauration SQLite terminée : ${restored} lignes restaurées sur ${wiped} tables. Intégrité: ${integrity?.ok ? 'OK' : 'ÉCHEC'}.`,
    success: integrity?.ok !== false,
  };
}

/** Vide une table PG (enfants avant parents — ordre inverse de priorité).
 * Le filtre `neq(<sentinelle>)` est requis par PostgREST (delete sans filtre
 * refusé) ; la colonne ET la sentinelle doivent correspondre au schéma PG :
 * module_definitions n'a pas de colonne id (clé `key`), global_saas_settings
 * a un id INTEGER (CHECK id = 1) — une sentinelle UUID y est invalide. */
function wipePgTable(table: string, pgTable: string): Promise<string | null> {
  const client = getAdminClient();
  return (async () => {
    try {
      let query: any;
      if (pgTable === 'module_definitions') {
        query = client.from(pgTable).delete().neq('key', '__never__');
      } else if (pgTable === 'global_saas_settings') {
        query = client.from(pgTable).delete().neq('id', 0);
      } else if (pgTable === 'gdrive_tokens') {
        query = client.from(pgTable).delete().not('tenant_id', 'is', null);
      } else if (NO_LEGACY_ID_PG_TABLES.has(pgTable)) {
        query = client.from(pgTable).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      } else {
        query = client.from(pgTable).delete().neq('legacy_id', '__never__');
      }
      const { error } = await query;
      return error ? error.message : null;
    } catch (e: any) {
      return e.message;
    }
  })();
}

const NO_LEGACY_ID_PG_TABLES = new Set(['global_saas_settings', 'module_definitions', 'tenant_modules', 'plan_modules', 'gdrive_tokens']);

// Colonne de conflit d'insertion par table : les tables à clé naturelle
// (module_definitions, gdrive_tokens) n'ont pas de colonne `id` côté PG.
const PG_CONFLICT_COLUMN: Record<string, string> = {
  module_definitions: 'key',
  gdrive_tokens: 'tenant_id',
};

/** Insertion de lignes PG dans l'ordre des priorités (parents d'abord). */
function insertPgRows(pgTable: string, rows: any[]): Promise<string | null> {
  const client = getAdminClient();
  return (async () => {
    if (rows.length === 0) return null;
    let error: any = null;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error: e } = await client.from(pgTable).insert(chunk, { onConflict: PG_CONFLICT_COLUMN[pgTable] || 'id' });
      if (e) { error = e; break; }
    }
    return error ? error.message : null;
  })();
}

/**
 * Restauration Supabase : vérification, sauvegarde de sécurité, contrôle de
 * cohérence AVANT, vidage des tables PG (enfants d'abord), ré-insertion depuis
 * le backup (parents d'abord), contrôle de cohérence APRÈS.
 */
export async function restoreSupabaseBackup(id: string, createdBy = 'system'): Promise<RestoreReport> {
  const rec = getBackup(id);
  if (!rec) throw new Error('Sauvegarde introuvable.');
  if (rec.type !== 'supabase') throw new Error('Cette sauvegarde n\'est pas de type Supabase.');
  const startedAt = new Date().toISOString();

  const verified = verifyBackup(id);
  if (!verified.ok) throw new Error(`La sauvegarde ${id} a échoué la vérification (${verified.message}). Restauration annulée.`);

  const payload = JSON.parse(fs.readFileSync(rec.filePath, 'utf8'));
  if (payload.format !== 'nexastock-supabase-backup') {
    throw new Error('Format de sauvegarde Supabase invalide.');
  }

  const safety = await createSqliteBackup('Sauvegarde de sécurité avant restauration', createdBy);
  let coherenceBefore: CoherenceReport | null = null;
  try { coherenceBefore = await runCoherenceCheck(); } catch { coherenceBefore = null; }

  const ordered = syncTablesOrdered();
  const errors: string[] = [];
  let wiped = 0;
  let restored = 0;

  // 1. Vidage : enfants d'abord (ordre inverse de priorité)
  for (const table of [...ordered].reverse()) {
    const pgTable = (TABLE_MAPPINGS.find(m => m.sqliteName === table)?.pgName) || table;
    const err = await wipePgTable(table, pgTable);
    if (err) errors.push(`vidage ${pgTable}: ${err}`);
    else wiped++;
  }

  // 2. Ré-insertion : parents d'abord
  for (const table of ordered) {
    const pgTable = (TABLE_MAPPINGS.find(m => m.sqliteName === table)?.pgName) || table;
    const rows = payload.tables?.[table]?.rows || [];
    if (rows.length === 0) continue;
    const err = await insertPgRows(pgTable, rows);
    if (err) errors.push(`insertion ${pgTable}: ${err}`);
    else restored += rows.length;
  }

  let integrity: { ok: boolean; details: string } | null = null;
  try {
    const res = db.pragma('integrity_check');
    const details = pragmaIntegrityResult(res);
    integrity = { ok: details === 'ok', details };
  } catch (e: any) {
    integrity = { ok: false, details: e.message };
  }

  let coherenceAfter: CoherenceReport | null = null;
  try { coherenceAfter = await runCoherenceCheck(); } catch { coherenceAfter = null; }

  db.prepare(`UPDATE admin_backups SET restoredAt = ?, restoredFrom = ? WHERE id = ?`).run(startedAt, `restore:${id}`, safety.id);
  logAudit('BACKUP_SUPABASE_RESTORE', `Restauration Supabase depuis ${id} (${restored} lignes, ${wiped} tables vidées, ${errors.length} erreur(s))`, createdBy);

  return {
    backupId: id,
    backupType: 'supabase',
    startedAt,
    completedAt: new Date().toISOString(),
    verified: verified.ok,
    safetyBackupId: safety.id,
    coherenceBefore,
    coherenceAfter,
    integrity,
    tables: { restored, wiped },
    message: errors.length
      ? `Restauration Supabase avec ${errors.length} erreur(s): ${errors.join('; ')}`
      : `Restauration Supabase terminée : ${restored} lignes restaurées sur ${wiped} tables.`,
    success: errors.length === 0 && integrity?.ok !== false,
  };
}

export function getBackupFilePath(id: string): string | null {
  const rec = getBackup(id);
  if (!rec || !fs.existsSync(rec.filePath)) return null;
  return rec.filePath;
}
