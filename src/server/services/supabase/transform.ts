import db from '../../database/db.js';
import { v4 as uuidv4 } from 'uuid';

const uuidMapTable = 'sync_uuid_map';

// Tables dont le schéma PostgreSQL n'a PAS de colonne legacy_id (clé naturelle différente)
export const NO_LEGACY_ID_TABLES = new Set([
  'global_saas_settings', // clé: id (INTEGER, fixe = 1)
  'gdrive_tokens',        // clé: tenant_id (UUID)
  'module_definitions',   // clé: key (TEXT)
  'tenant_modules',       // clé: id (UUID)
]);

export function getConflictColumn(tableName: string): string {
  switch (tableName) {
    case 'global_saas_settings': return 'id';
    case 'module_definitions': return 'key';
    case 'gdrive_tokens': return 'tenant_id';
    case 'tenant_modules': return 'id';
    default: return 'legacy_id';
  }
}

export function getDeleteCriteria(tableName: string, recordId: string): { column: string; value: string } {
  switch (tableName) {
    case 'global_saas_settings': return { column: 'id', value: recordId };
    case 'module_definitions': return { column: 'key', value: recordId };
    case 'gdrive_tokens': return { column: 'tenant_id', value: resolveFkValue(recordId) };
    case 'tenant_modules': return { column: 'id', value: getOrCreateUuid(recordId) };
    default: return { column: 'legacy_id', value: recordId };
  }
}

function ensureUuidMapTable() {
  db.exec(`CREATE TABLE IF NOT EXISTS ${uuidMapTable} (
    sqlite_id TEXT PRIMARY KEY,
    pg_uuid TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  )`);
}

export function getOrCreateUuid(sqliteId: string): string {
  ensureUuidMapTable();
  const existing = db.prepare(`SELECT pg_uuid FROM ${uuidMapTable} WHERE sqlite_id = ?`).get(sqliteId) as { pg_uuid: string } | undefined;
  if (existing) return existing.pg_uuid;
  const uuid = uuidv4();
  db.prepare(`INSERT OR IGNORE INTO ${uuidMapTable} (sqlite_id, pg_uuid, created_at) VALUES (?, ?, ?)`).run(sqliteId, uuid, new Date().toISOString());
  return uuid;
}

export function getSqliteIdFromUuid(pgUuid: string): string | null {
  ensureUuidMapTable();
  const row = db.prepare(`SELECT sqlite_id FROM ${uuidMapTable} WHERE pg_uuid = ?`).get(pgUuid) as { sqlite_id: string } | undefined;
  return row?.sqlite_id || null;
}

export function recordUuidMapping(sqliteId: string, pgUuid: string): void {
  if (!sqliteId || !pgUuid) return;
  ensureUuidMapTable();
  db.prepare(`INSERT OR IGNORE INTO ${uuidMapTable} (sqlite_id, pg_uuid, created_at) VALUES (?, ?, ?)`)
    .run(sqliteId, pgUuid, new Date().toISOString());
}

function isFkColumn(pgKey: string): boolean {
  const fkSuffixes = ['_id', 'Id'];
  return fkSuffixes.some(s => pgKey.endsWith(s)) && pgKey !== 'legacy_id';
}

function resolveFkValue(value: string): string {
  ensureUuidMapTable();
  const mapped = db.prepare(`SELECT pg_uuid FROM ${uuidMapTable} WHERE sqlite_id = ?`).get(value) as { pg_uuid: string } | undefined;
  if (mapped) return mapped.pg_uuid;
  return getOrCreateUuid(value);
}

export function camelToSnake(key: string): string {
  return key.replace(/([A-Z])/g, '_$1').toLowerCase();
}

export function snakeToCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

export function transformToPostgres(tableName: string, record: Record<string, unknown>): Record<string, unknown> {
  const pg: Record<string, unknown> = {};
  const skipKeys = new Set(['_table']);
  if (!NO_LEGACY_ID_TABLES.has(tableName)) skipKeys.add('id');

  for (const [key, value] of Object.entries(record)) {
    if (skipKeys.has(key)) continue;
    const pgKey = key === 'tenantId' ? 'tenant_id' : key === 'legacy_id' ? 'legacy_id' : camelToSnake(key);
    if (value === null || value === undefined) {
      pg[pgKey] = null;
      continue;
    }
    if (typeof value === 'string' && (value.startsWith('[') || value.startsWith('{'))) {
      try { pg[pgKey] = JSON.parse(value); } catch { pg[pgKey] = value; }
    } else if (typeof value === 'string' && isFkColumn(pgKey)) {
      pg[pgKey] = resolveFkValue(value);
    } else {
      pg[pgKey] = value;
    }
  }

  if (NO_LEGACY_ID_TABLES.has(tableName)) {
    if (tableName === 'tenant_modules' && record.id) {
      pg.id = getOrCreateUuid(record.id as string);
    }
    return pg;
  }

  pg.legacy_id = record.legacy_id || record.id as string;
  pg.id = getOrCreateUuid(pg.legacy_id as string);

  return pg;
}

export function transformFromPostgres(record: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === 'id') continue;
    const camelKey = key === 'legacy_id' ? 'id' : snakeToCamel(key);
    if (value === null || value === undefined) {
      result[camelKey] = null;
      continue;
    }
    if (key.endsWith('_id') && key !== 'legacy_id' && typeof value === 'string') {
      const sqliteId = getSqliteIdFromUuid(value);
      result[camelKey] = sqliteId || value;
    } else if (typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) {
      result[camelKey] = JSON.stringify(value);
    } else {
      result[camelKey] = value;
    }
  }
  return result;
}
