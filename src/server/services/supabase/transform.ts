import db from '../../database/db.js';
import { v4 as uuidv4 } from 'uuid';

const uuidMapTable = 'sync_uuid_map';

// Tables dont le schéma PostgreSQL n'a PAS de colonne legacy_id (clé naturelle différente)
export const NO_LEGACY_ID_TABLES = new Set([
  'global_saas_settings', // clé: id (INTEGER, fixe = 1)
  'gdrive_tokens',        // clé: tenant_id (UUID)
  'module_definitions',   // clé: key (TEXT)
  'tenant_modules',       // clé: id (UUID)
  'plan_modules',         // clé: id (UUID) — PG n'a pas de legacy_id
]);

// Colonnes SQLite à ne JAMAIS pousser vers PostgreSQL :
// - 'version' a été ajoutée à toutes les tables SQLite par la migration 010
//   mais n'existe sur aucune table PG (PostgREST rejette le batch entier).
const ALWAYS_EXCLUDED_COLUMNS = new Set(['version']);

// Colonnes SQLite absentes du schéma PG pour certaines tables.
// D'après 001_full_schema.sql, certaines tables n'ont PAS de colonne updated_at
// ou d'autres colonnes locales qui existent seulement dans SQLite.
const TABLE_EXCLUDED_COLUMNS: Record<string, Set<string>> = {
  permissions: new Set(['updated_at']),
  module_definitions: new Set(['updated_at']),
  tenant_modules: new Set(['updated_at']),
  role_permissions: new Set(['updated_at']),
  user_roles: new Set(['updated_at']),
  plan_modules: new Set(['updated_at']),
  products: new Set(['variants']),
  loans: new Set(['repayments', 'installments']),
  invoices: new Set(['items', 'deliveryOrders', 'payments', 'returns', 'auditLogs']),
  delivery_orders: new Set(['items']),
  returns: new Set(['items']),
  pricing_plans: new Set(['deleted_at', 'deletedAt']),
  global_saas_settings: new Set(['deleted_at', 'deletedAt']),
};

export function getConflictColumn(tableName: string): string {
  switch (tableName) {
    case 'global_saas_settings': return 'id';
    case 'module_definitions': return 'key';
    case 'gdrive_tokens': return 'tenant_id';
    case 'tenant_modules': return 'id';
    case 'plan_modules': return 'id';
    default: return 'id';
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function getDeleteCriteria(tableName: string, recordId: string): { column: string; value: string } {
  switch (tableName) {
    case 'global_saas_settings': return { column: 'id', value: recordId };
    case 'module_definitions': return { column: 'key', value: recordId };
    case 'gdrive_tokens': return { column: 'tenant_id', value: resolveFkValue(recordId) };
    case 'tenant_modules': return { column: 'id', value: getOrCreateUuid(recordId) };
    case 'plan_modules': return { column: 'id', value: getOrCreateUuid(recordId) };
    default:
      if (isUuid(recordId)) return { column: 'id', value: recordId };
      return { column: 'legacy_id', value: recordId };
  }
}

function ensureUuidMapTable() {
  // La table sync_uuid_map est créée par la migration 012_sync_uuid_map.
  // Ce appel de secours garantit la compatibilité avec les bases de données
  // non encore migrées (ex: instances existantes démarrées avant la migration).
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
  if (pgKey === 'user_id') return false;
  const fkSuffixes = ['_id'];
  return fkSuffixes.some(s => pgKey.endsWith(s)) && pgKey !== 'legacy_id';
}

function resolveFkValue(value: string): string {
  if (!value) return value; // Ne pas traiter les FK nulles ou vides
  ensureUuidMapTable();
  // Pour toute valeur de clé étrangère, nous devons garantir un UUID.
  // Soit il existe déjà dans la table de mapping, soit nous le créons.
  return getOrCreateUuid(value);
}

export function camelToSnake(key: string): string {
  return key.replace(/([A-Z])/g, '_$1').toLowerCase();
}

export function snakeToCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function getAllowedRecordKeys(tableName: string): Set<string> {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[];
  const allowed = new Set(columns.map(c => c.name));
  allowed.add('legacy_id');
  allowed.add('_table');
  return allowed;
}

// Colonnes PostgreSQL NOT NULL SANS DEFAULT qui risquent d'être absentes d'un
// payload local (ex: facture historique poussée avec l'ancien payload minimal
// ne contenant pas `date`). Sans repli, PostgreSQL rejette l'insertion avec une
// violation de contrainte NOT NULL. On complète avec la colonne source
// (`created_at`) quand elle est disponible, sinon avec l'horodatage courant.
const PG_REQUIRED_DEFAULTS: Record<string, [column: string, source?: string]> = {
  invoices: ['date', 'created_at'],
  delivery_orders: ['date', 'created_at'],
  returns: ['date', 'created_at'],
  payments: ['date', 'created_at'],
  loans: ['date', 'created_at'],
  stock_transfers: ['date', 'created_at'],
  expenses: ['date', 'created_at'],
  subscription_invoices: ['date', 'created_at'],
  subscription_payments: ['date', 'created_at'],
};

function applyRequiredDefaults(tableName: string, pg: Record<string, unknown>) {
  const def = PG_REQUIRED_DEFAULTS[tableName];
  if (!def) return;
  const [column, source] = def;
  if (pg[column] === null || pg[column] === undefined) {
    const fallback = (source && pg[source]) ? pg[source] : new Date().toISOString();
    pg[column] = fallback;
  }
}

export function transformToPostgres(tableName: string, record: Record<string, unknown>): Record<string, unknown> {
  const pg: Record<string, unknown> = {};
  const skipKeys = new Set(['_table', ...ALWAYS_EXCLUDED_COLUMNS]);
  const tableExclusions = TABLE_EXCLUDED_COLUMNS[tableName];
  if (tableExclusions) {
    for (const k of tableExclusions) {
      skipKeys.add(k);
      skipKeys.add(k === 'updated_at' ? 'updatedAt' : k === 'created_at' ? 'createdAt' : k);
    }
  }
  if (!NO_LEGACY_ID_TABLES.has(tableName)) skipKeys.add('id');

  const allowedKeys = getAllowedRecordKeys(tableName);

  for (const [key, value] of Object.entries(record)) {
    if (skipKeys.has(key)) continue;
    if (!allowedKeys.has(key) && key !== 'legacy_id') continue;

    let pgKey = key === 'tenantId' ? 'tenant_id' : key === 'legacy_id' ? 'legacy_id' : camelToSnake(key);

    // Correction pour la colonne 'returns' de la table 'sales' qui est nommée 'returns_json' en PG
    if (tableName === 'sales' && key === 'returns') {
      pgKey = 'returns_json';
    }

    if (value === null || value === undefined) {
      // Les colonnes created_at/updated_at sont NOT NULL DEFAULT NOW() en PG :
      // les omettre (plutôt que d'envoyer NULL) laisse PostgreSQL appliquer son
      // DEFAULT. Les autres colonnes restent NULL explicite (nullable en PG).
      if (pgKey === 'created_at' || pgKey === 'updated_at') continue;
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

  // Compléter les colonnes NOT NULL sans DEFAULT avant d'ajouter id/legacy_id,
  // afin que les enregistrements (notamment historiques) ne soient pas rejetés
  // par une contrainte NOT NULL côté PostgreSQL.
  applyRequiredDefaults(tableName, pg);

  if (NO_LEGACY_ID_TABLES.has(tableName)) {
    if ((tableName === 'tenant_modules' || tableName === 'plan_modules') && record.id) {
      pg.id = getOrCreateUuid(record.id as string);
    }
    return pg;
  }

  pg.legacy_id = record.legacy_id || record.id as string;
  pg.id = getOrCreateUuid(pg.legacy_id as string);

  return pg;
}

export function transformFromPostgres(tableName: string, record: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Déterminer l'ID local : priorité au legacy_id, sinon fallback sur l'UUID de PG.
  // C'est crucial pour les enregistrements créés directement sur Supabase.
  const localId = record.legacy_id || record.id;
  if (localId) {
    result.id = localId;
  }

  for (const [key, value] of Object.entries(record)) {
    // La logique de l'ID a déjà été traitée
    if (key === 'id' || key === 'legacy_id') continue;

    let camelKey = snakeToCamel(key);
    // Correction pour la colonne 'returns_json' de la table 'sales' qui est nommée 'returns' en local
    if (tableName === 'sales' && key === 'returns_json') {
      camelKey = 'returns';
    }

    if (value === null || value === undefined) {
      result[camelKey] = null;
      continue;
    }
    if (key.endsWith('_id') && typeof value === 'string') {
      const sqliteId = getSqliteIdFromUuid(value);
      // Si une FK ne peut être résolue, on met null pour éviter de violer
      // la contrainte de clé étrangère locale avec un UUID brut.
      result[camelKey] = sqliteId;
    } else if (typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) {
      result[camelKey] = JSON.stringify(value);
    } else {
      result[camelKey] = value;
    }
  }
  return result;
}
