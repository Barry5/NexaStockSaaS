import db from '../database/db.js';
import {
  countRemoteRows,
  fetchAllLegacyIds,
  getAdminClient,
  isSupabaseConfigured,
} from './supabase/supabaseService.js';
import { NO_LEGACY_ID_TABLES } from './supabase/transform.js';
import { syncEngine } from '../sync/syncEngine.js';
import * as SyncQueue from '../sync/syncQueue.js';
import { SYNC_TABLES, TABLE_MAPPINGS, TABLES_WITHOUT_UPDATED_AT } from '../sync/syncTables.js';

// ============================================================================
// Contrôle de cohérence SQLite <-> Supabase (diagnostic SEUL, aucune correction
// automatique). Comparaison par table : comptes de lignes, identifiants,
// données modifiées (version / horodatage), données supprimées, données en
// attente de synchronisation. Les écarts expliqués par des changements encore
// en attente sont classés `pending` (⚠), les écarts inexpliqués `incoherent` (❌).
// ============================================================================

export type CoherenceStatus = 'ok' | 'pending' | 'incoherent' | 'unknown';

export interface CoherenceIssue {
  type: 'local_only' | 'remote_only' | 'version_mismatch' | 'pending_delete';
  id: string;
  localVersion?: number;
  remoteVersion?: number;
  localUpdatedAt?: string;
  remoteUpdatedAt?: string;
}

export interface CoherenceTableReport {
  table: string;
  pgTable: string;
  status: CoherenceStatus;
  sqliteCount: number;
  supabaseCount: number | null;
  localOnlyCount: number;
  remoteOnlyCount: number;
  versionMismatchCount: number;
  explainedByPending: boolean;
  pendingCreates: number;
  pendingUpdates: number;
  pendingDeletes: number;
  pendingDeletionIdsCount: number;
  deadLetterCount: number;
  queueFailedCount: number;
  lastSyncAt: string | null;
  issues: CoherenceIssue[];
  cause: string;
  recommendation: string;
  action: string;
}

export interface CoherenceSummary {
  checked: number;
  ok: number;
  pending: number;
  incoherent: number;
  unknown: number;
}

export interface CoherenceReport {
  generatedAt: string;
  durationMs: number;
  supabaseReachable: boolean;
  deep: boolean;
  overall: CoherenceStatus;
  summary: CoherenceSummary;
  pendingTotal: {
    changelog: number;
    deletions: number;
    deadLetters: number;
    queueFailed: number;
  };
  conflictsCount: number;
  tables: CoherenceTableReport[];
}

export interface CoherenceOptions {
  deep?: boolean; // comparaison version/horodatage (plus lent, plus réseau)
}

// Cache des colonnes locales par table (PRAGMA table_info).
const localColumnsCache = new Map<string, Set<string>>();
function getLocalColumns(table: string): Set<string> {
  let cols = localColumnsCache.get(table);
  if (!cols) {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    cols = new Set(rows.map(r => r.name));
    localColumnsCache.set(table, cols);
  }
  return cols;
}

// Ligne présente en local mais pas côté Supabase, expliquée par une création
// encore en attente dans le changelog -> écart attendu (pending).
function getPendingCreationCounts(): Map<string, number> {
  const summary = syncEngine.getPendingChangesSummary();
  const map = new Map<string, number>();
  for (const row of summary.changelogByTable) {
    map.set(row.table_name, row.create);
  }
  return map;
}

// Tombstones de suppression non encore poussés, par table (ids inclus).
function getPendingDeletions(): Map<string, string[]> {
  const rows = db.prepare(`
    SELECT table_name, record_id FROM sync_deletions WHERE pushed_to_supabase = 0
  `).all() as { table_name: string; record_id: string }[];
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const list = map.get(r.table_name) || [];
    list.push(r.record_id);
    map.set(r.table_name, list);
  }
  return map;
}

// Changements en dead-letter (retry borné dépassé), par table.
function getDeadLettersByTable(): Map<string, number> {
  const dead = syncEngine.getDeadChanges(2000);
  const map = new Map<string, number>();
  for (const item of dead) {
    map.set(item.table_name, (map.get(item.table_name) || 0) + 1);
  }
  return map;
}

// Items de file legacy en échec, par table.
function getQueueFailedByTable(): Map<string, number> {
  const summary = SyncQueue.getSummary();
  const map = new Map<string, number>();
  for (const row of summary.perTable) {
    if (row.failed > 0) map.set(row.table_name, row.failed);
  }
  return map;
}

const pgNameBySqlite = new Map(TABLE_MAPPINGS.map(m => [m.sqliteName, m.pgName]));

// Colonne d'identité pour la comparaison des IDs, par table. Le défaut est
// `id` (SQLite) <-> `legacy_id` (PG). Les tables sans legacy_id côté PG
// comparent les `id` (UUID PG, ou INTEGER pour global_saas_settings). Deux
// tables ont une clé naturelle différente : module_definitions (key) et
// gdrive_tokens (tenant_id).
const IDENTITY_COLUMN: Record<string, { local: string; remote: string }> = {
  module_definitions: { local: 'key', remote: 'key' },
  gdrive_tokens: { local: 'tenantId', remote: 'tenant_id' },
};

function getIdentityColumn(table: string): { local: string; remote: string } | null {
  const override = IDENTITY_COLUMN[table];
  if (override) return override;
  const localCols = getLocalColumns(table);
  if (!localCols.has('id')) return null; // pas de clé d'identité comparable
  return { local: 'id', remote: NO_LEGACY_ID_TABLES.has(table) ? 'id' : 'legacy_id' };
}

/**
 * Récupère l'identité (id SQLite) de toutes les lignes d'une table côté PG.
 * La colonne de comparaison dépend de la table (legacy_id, id, key, tenant_id).
 */
async function fetchRemoteIds(table: string, remoteIdentity: string): Promise<{ ids: string[]; pgIds: string[]; error: any }> {
  const client = getAdminClient();
  const ids: string[] = [];
  const pgIds: string[] = [];
  let offset = 0;
  const pageSize = 1000;
  // Colonnes à sélectionner selon la clé d'identité PG : les tables à clé
  // naturelle (module_definitions -> key, gdrive_tokens -> tenant_id) et les
  // tables sans legacy_id (NO_LEGACY_ID_TABLES -> id) ne doivent JAMAIS
  // sélectionner une colonne inexistante (PostgREST rejette la requête).
  const selectCols = remoteIdentity === 'key' || remoteIdentity === 'tenant_id' || remoteIdentity === 'id'
    ? remoteIdentity
    : 'id, legacy_id';
  try {
    while (true) {
      const { data, error } = await client
        .from(table)
        .select(selectCols)
        .range(offset, offset + pageSize - 1);
      if (error) return { ids, pgIds, error };
      if (!data || data.length === 0) break;
      for (const r of data) {
        pgIds.push(String(r.id ?? ''));
        const idVal = r[remoteIdentity];
        if (idVal !== undefined && idVal !== null) {
          ids.push(String(idVal));
        } else if (r.legacy_id) {
          ids.push(String(r.legacy_id));
        } else if (r.id) {
          ids.push(String(r.id));
        }
      }
      offset += data.length;
      if (data.length < pageSize) break;
    }
    return { ids, pgIds, error: null };
  } catch (e: any) {
    return { ids, pgIds, error: e };
  }
}

/**
 * Récupère version + horodatage des lignes locales d'une table (si présents).
 * La colonne d'identité locale est passée explicitement : module_definitions
 * (key) et gdrive_tokens (tenantId) n'ont pas de colonne `id`.
 */
function fetchLocalVersions(table: string, identityLocal: string): Map<string, { version: number; updatedAt: string }> {
  const cols = getLocalColumns(table);
  if ((!cols.has('updatedAt') && !cols.has('version')) || !cols.has(identityLocal)) return new Map();
  const select = cols.has('version') ? `${identityLocal}, version, updatedAt` : `${identityLocal}, updatedAt`;
  const rows = db.prepare(`SELECT ${select} FROM ${table}`).all() as any[];
  const map = new Map<string, { version: number; updatedAt: string }>();
  for (const r of rows) {
    map.set(String(r[identityLocal]), { version: r.version || 0, updatedAt: r.updatedAt || r.createdAt || '' });
  }
  return map;
}

/**
 * Récupère version + horodatage des lignes PG d'une table.
 * Uniquement pour les tables hors NO_LEGACY_ID_TABLES (les autres n'ont ni
 * version ni updated_at côté PG) : appelée uniquement depuis le contrôle
 * approfondi, déjà filtré en amont.
 */
async function fetchRemoteVersions(table: string): Promise<{ map: Map<string, { version: number; updatedAt: string }>; error: any }> {
  const identity = getIdentityColumn(table);
  if (!identity || identity.remote === 'key' || identity.remote === 'tenant_id') {
    return { map: new Map(), error: null };
  }
  const usesCreatedAt = TABLES_WITHOUT_UPDATED_AT.has(table);
  const tsCol = usesCreatedAt ? 'created_at' : 'updated_at';
  const client = getAdminClient();
  const map = new Map<string, { version: number; updatedAt: string }>();
  let offset = 0;
  const pageSize = 1000;
  try {
    while (true) {
      const { data, error } = await client
        .from(table)
        .select(`id, legacy_id, version, ${tsCol}`)
        .range(offset, offset + pageSize - 1);
      if (error) return { map, error };
      if (!data || data.length === 0) break;
      for (const r of data) {
        const localId = identity.remote === 'id' ? String(r.id) : String(r.legacy_id || r.id);
        map.set(localId, { version: r.version || 0, updatedAt: r[tsCol] || '' });
      }
      offset += data.length;
      if (data.length < pageSize) break;
    }
    return { map, error: null };
  } catch (e: any) {
    return { map, error: e };
  }
}

function timestampsClose(a: string, b: string): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a === b;
  return Math.abs(ta - tb) <= 1000; // tolérance 1s (format ISO)
}

/**
 * Contrôle de cohérence complet SQLite <-> Supabase.
 * Diagnostique uniquement : ne modifie AUCUNE donnée.
 */
export async function runCoherenceCheck(options: CoherenceOptions = {}): Promise<CoherenceReport> {
  const started = Date.now();
  const deep = options.deep !== false;
  let supabaseReachable = false;
  try {
    supabaseReachable = isSupabaseConfigured() && (await countRemoteRows('products').then(r => !r.error).catch(() => false));
  } catch {
    supabaseReachable = false;
  }

  const pendingCreates = getPendingCreationCounts();
  const pendingDeletions = getPendingDeletions();
  const deadLetters = getDeadLettersByTable();
  const queueFailed = getQueueFailedByTable();
  const lastSyncMap = new Map(SyncQueue.loadLastSyncTimestamps().map(r => [r.table_name, r.last_sync_at]));
  const conflictsCount = (db.prepare(`SELECT COUNT(*) as c FROM sync_conflicts`).get() as any).c;
  const pendingSummary = syncEngine.getPendingChangesSummary();
  const pendingUpdatesByTable = new Map(pendingSummary.changelogByTable.map(r => [r.table_name, r.update]));

  // Carte sqlite_id -> pg_uuid (sync_uuid_map) : les tables NO_LEGACY_ID_TABLES
  // (plan_modules, tenant_modules...) portent des UUID PG distincts des ids
  // locaux déterministes (pm-plan-free-*). Sans traduction, la comparaison
  // brute d'ids produirait de faux écarts local_only/remote_only.
  const uuidMap = new Map<string, string>();
  for (const row of db.prepare(`SELECT sqlite_id, pg_uuid FROM sync_uuid_map`).all() as { sqlite_id: string; pg_uuid: string }[]) {
    uuidMap.set(row.sqlite_id, row.pg_uuid);
  }

  const tables: CoherenceTableReport[] = [];

  for (const table of SYNC_TABLES) {
    const pgTable = pgNameBySqlite.get(table) || table;
    const sqliteCount = (db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as any).c as number;
    const identity = getIdentityColumn(table);
    let remote: { count: number | null; error: any };
    try {
      // Comptage sur la clé d'identité PG : les tables à clé naturelle
      // (module_definitions, gdrive_tokens) n'ont pas de colonne `id`.
      remote = await countRemoteRows(pgTable, identity?.remote || 'id');
    } catch (e: any) {
      remote = { count: null, error: e };
    }
    const supabaseCount = remote.error ? null : (remote.count as number);

    // --- Identités -------------------------------------------------------
    let localOnlyIds: string[] = [];
    let remoteOnlyIds: string[] = [];
    let versionMismatchIds: { id: string; localVersion: number; remoteVersion: number; localUpdatedAt: string; remoteUpdatedAt: string }[] = [];

    if (supabaseCount !== null) {
      if (identity) {
        const localIds = (db.prepare(`SELECT ${identity.local} FROM ${table}`).all() as any[]).map(r => String(r[identity.local]));
        const remoteIdsRes = await fetchRemoteIds(pgTable, identity.remote);
        const remoteIds = remoteIdsRes.error ? [] : remoteIdsRes.ids;

        const remoteSet = new Set(remoteIds);
        // Traduction locale -> PG via sync_uuid_map pour les tables
        // NO_LEGACY_ID_TABLES : on préfère un match direct, sinon la
        // correspondance enregistrée (un mapping périmé n'est utilisé que
        // s'il correspond réellement à une ligne présente côté PG).
        const resolveLocalId = (id: string): string => {
          if (remoteSet.has(id)) return id;
          const mapped = uuidMap.get(id);
          if (mapped && remoteSet.has(mapped)) return mapped;
          return id;
        };
        const localResolvedSet = new Set(localIds.map(resolveLocalId));
        localOnlyIds = localIds.filter(id => !remoteSet.has(resolveLocalId(id)));
        remoteOnlyIds = remoteIds.filter(id => !localResolvedSet.has(id));

        // --- Données modifiées (version / horodatage) ----------------------
        // Tables NO_LEGACY_ID_TABLES : le schéma PG n'a ni version ni
        // updated_at (created_at = insertion, jamais rejouée) -> la
        // comparaison version/horodatage n'y est pas significative.
        if (deep && supabaseCount > 0 && !NO_LEGACY_ID_TABLES.has(table)) {
          const localVersions = fetchLocalVersions(table, identity.local);
          if (localVersions.size > 0) {
            const remoteVersionsRes = await fetchRemoteVersions(pgTable);
            if (!remoteVersionsRes.error) {
              for (const [localId, lv] of localVersions) {
                const remoteId = resolveLocalId(localId);
                if (!remoteSet.has(remoteId)) continue; // déjà compté local_only
                const rv = remoteVersionsRes.map.get(remoteId);
                if (!rv) continue;
                if (lv.version !== rv.version || !timestampsClose(lv.updatedAt, rv.updatedAt)) {
                  versionMismatchIds.push({
                    id: localId,
                    localVersion: lv.version,
                    remoteVersion: rv.version,
                    localUpdatedAt: lv.updatedAt,
                    remoteUpdatedAt: rv.updatedAt,
                  });
                }
              }
            }
          }
        }
      }
    }

    // --- Écarts expliqués par des changements en attente -----------------
    const pendingDelIds = pendingDeletions.get(table) || [];
    const pendingDelSet = new Set(pendingDelIds);
    const explainedRemoteOnly = remoteOnlyIds.filter(id => pendingDelSet.has(id));
    const unexplainedRemoteOnly = remoteOnlyIds.filter(id => !pendingDelSet.has(id));

    const pendingCreatesCount = pendingCreates.get(table) || 0;
    const pendingDeletesCount = pendingDelIds.length;

    // Si les écarts (local_only / remote_only) sont entièrement couverts par
    // des opérations en attente dans le changelog / les tombstones, ils seront
    // réconciliés à la prochaine synchronisation -> statut `pending` (⚠).
    const explainedByPending =
      localOnlyIds.length <= pendingCreatesCount && unexplainedRemoteOnly.length === 0;

    const realLocalOnly = explainedByPending ? 0 : Math.max(0, localOnlyIds.length - pendingCreatesCount);
    const realRemoteOnly = unexplainedRemoteOnly.length;

    // --- Statut ----------------------------------------------------------
    let status: CoherenceStatus;
    let cause = '';
    let recommendation = '';
    let action = 'Aucune correction automatique — diagnostic uniquement';

    if (supabaseCount === null) {
      status = 'unknown';
      cause = 'Supabase injoignable ou requête de comptage en échec.';
      recommendation = 'Vérifier la connectivité (configuration .env, /api/sync/status) puis relancer le contrôle.';
    } else if (sqliteCount !== supabaseCount || realLocalOnly > 0 || realRemoteOnly > 0 || versionMismatchIds.length > 0) {
      status = 'incoherent';
      const details: string[] = [];
      if (sqliteCount !== supabaseCount) details.push(`${sqliteCount} ligne(s) en local vs ${supabaseCount} côté Supabase`);
      if (realLocalOnly > 0) details.push(`${realLocalOnly} ligne(s) présentes uniquement en local`);
      if (realRemoteOnly > 0) details.push(`${realRemoteOnly} ligne(s) présentes uniquement sur Supabase`);
      if (versionMismatchIds.length > 0) details.push(`${versionMismatchIds.length} ligne(s) avec version/horodatage différents`);
      cause = `Écarts inexpliqués : ${details.join(', ')}.`;
      if (realRemoteOnly > 0) {
        recommendation = 'Lignes présentes uniquement sur Supabase : supprimées localement sans tombstone, ou créées depuis un autre appareil. Après analyse, restaurer depuis une sauvegarde vérifiée ou re-synchroniser.';
      } else if (realLocalOnly > 0) {
        recommendation = 'Lignes présentes uniquement en local : jamais poussées, ou supprimées côté Supabase. Après analyse, restaurer depuis une sauvegarde vérifiée ou re-synchroniser.';
      } else {
        recommendation = 'Version/horodatage divergents : dernier écrit vainqueur (LWW). Après analyse, restaurer depuis une sauvegarde vérifiée ou re-synchroniser.';
      }
    } else if (pendingCreatesCount > 0 || pendingDeletesCount > 0 || (deadLetters.get(table) || 0) > 0 || (queueFailed.get(table) || 0) > 0) {
      status = 'pending';
      const pendingBits: string[] = [];
      if (pendingCreatesCount > 0) pendingBits.push(`${pendingCreatesCount} création(s) en attente`);
      if (pendingDeletesCount > 0) pendingBits.push(`${pendingDeletesCount} suppression(s) en attente`);
      if ((deadLetters.get(table) || 0) > 0) pendingBits.push(`${deadLetters.get(table)} dead-letter(s)`);
      if ((queueFailed.get(table) || 0) > 0) pendingBits.push(`${queueFailed.get(table)} échec(s) en file`);
      cause = `Changements en attente de synchronisation : ${pendingBits.join(', ')}.`;
      recommendation = 'Déclencher la synchronisation (POST /api/sync/trigger), puis relancer le contrôle de cohérence.';
      action = 'Exécuter /api/sync/trigger puis re-vérifier (aucune correction automatique).';
    } else {
      status = 'ok';
      cause = 'Les comptes, identifiants, versions et horodatages correspondent.';
      recommendation = 'Aucune action requise.';
      action = 'Aucune action requise.';
    }

    const issues: CoherenceIssue[] = [
      ...localOnlyIds.slice(0, 100).map(id => ({ type: 'local_only' as const, id })),
      ...remoteOnlyIds.slice(0, 100).map(id => ({ type: 'remote_only' as const, id })),
      ...versionMismatchIds.slice(0, 100).map(m => ({
        type: 'version_mismatch' as const,
        id: m.id,
        localVersion: m.localVersion,
        remoteVersion: m.remoteVersion,
        localUpdatedAt: m.localUpdatedAt,
        remoteUpdatedAt: m.remoteUpdatedAt,
      })),
    ];

    tables.push({
      table,
      pgTable,
      status,
      sqliteCount,
      supabaseCount,
      localOnlyCount: localOnlyIds.length,
      remoteOnlyCount: remoteOnlyIds.length,
      versionMismatchCount: versionMismatchIds.length,
      explainedByPending,
      pendingCreates: pendingCreatesCount,
      pendingUpdates: pendingUpdatesByTable.get(table) || 0,
      pendingDeletes: pendingDeletesCount,
      pendingDeletionIdsCount: pendingDeletesCount,
      deadLetterCount: deadLetters.get(table) || 0,
      queueFailedCount: queueFailed.get(table) || 0,
      lastSyncAt: lastSyncMap.get(table) || null,
      issues,
      cause,
      recommendation,
      action,
    });
  }

  const summary: CoherenceSummary = { checked: tables.length, ok: 0, pending: 0, incoherent: 0, unknown: 0 };
  for (const t of tables) summary[t.status] += 1;

  const overall: CoherenceStatus = summary.incoherent > 0 ? 'incoherent' : summary.unknown > 0 ? 'unknown' : summary.pending > 0 ? 'pending' : 'ok';

  const pendingTotal = {
    changelog: pendingSummary.changelogCount,
    deletions: db.prepare(`SELECT COUNT(*) as c FROM sync_deletions WHERE pushed_to_supabase = 0`).get() as { c: number },
    deadLetters: [...deadLetters.values()].reduce((a, b) => a + b, 0),
    queueFailed: [...queueFailed.values()].reduce((a, b) => a + b, 0),
  } as any;

  return {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    supabaseReachable,
    deep,
    overall,
    summary,
    pendingTotal: {
      changelog: pendingTotal.changelog,
      deletions: pendingTotal.deletions.c,
      deadLetters: pendingTotal.deadLetters,
      queueFailed: pendingTotal.queueFailed,
    },
    conflictsCount,
    tables,
  };
}

/**
 * État rapide de cohérence (léger, pour les cartes du tableau de bord) :
 * comptes par table + changements en attente, sans comparaison de versions.
 */
export async function runCoherenceQuickStatus(): Promise<{
  generatedAt: string;
  supabaseReachable: boolean;
  checked: number;
  coherent: number;
  pending: number;
  incoherent: number;
  unknown: number;
  pendingTotal: { changelog: number; deletions: number; deadLetters: number; queueFailed: number };
  lastBackupSqlite: { id: string; createdAt: string; size: number } | null;
  lastBackupSupabase: { id: string; createdAt: string; size: number } | null;
}> {
  const report = await runCoherenceCheck({ deep: false });
  const lastBackupSqlite = db.prepare(`SELECT id, createdAt, size FROM admin_backups WHERE type = 'sqlite' ORDER BY createdAt DESC LIMIT 1`).get() as any || null;
  const lastBackupSupabase = db.prepare(`SELECT id, createdAt, size FROM admin_backups WHERE type = 'supabase' ORDER BY createdAt DESC LIMIT 1`).get() as any || null;
  return {
    generatedAt: report.generatedAt,
    supabaseReachable: report.supabaseReachable,
    checked: report.summary.checked,
    coherent: report.summary.ok,
    pending: report.summary.pending,
    incoherent: report.summary.incoherent,
    unknown: report.summary.unknown,
    pendingTotal: report.pendingTotal,
    lastBackupSqlite,
    lastBackupSupabase,
  };
}
