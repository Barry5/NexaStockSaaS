#!/usr/bin/env node
/**
 * scripts/resync-users-roles.mjs
 * Re-synchronise les tables `users` et `roles` vers Supabase (LWW : l'état
 * local gagne) après que le contrôle de cohérence les a marquées incohérentes
 * (versions/horodatages divergents, rien en attente).
 *
 * Le trigger PG force `version = OLD.version + 1` et `updated_at = NOW()` à
 * chaque UPDATE : on normalise donc la version locale à `PG.version + 1` et
 * l'horodatage local à l'instant du push, puis on rejoue via le pipeline
 * officiel syncUpFromChangelog. En sortie, on aligne l'horodatage local sur
 * la valeur PG post-push (tolérance du contrôle : 1 s).
 *
 * Prérequis : l'application doit être ARRÊTÉE (lock du worker vérifié).
 *
 * Usage : node --import tsx scripts/resync-users-roles.mjs
 */
import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

import fs from 'fs';
import path from 'path';
import db from '../src/server/database/db.js';
import { syncService } from '../src/server/sync/syncService.js';
import { syncEngine, CHANGELOG_MAX_RETRIES } from '../src/server/sync/syncEngine.js';
import { getAdminClient } from '../src/server/services/supabase/supabaseService.js';

const TABLES = ['users', 'roles'];
const DB_PATH = process.env.DB_PATH || 'data/database.db';
const LOCK_PATH = path.join(path.dirname(DB_PATH), '.supabase-worker.lock');

// 1) Sécurité : le worker ne doit pas tourner (course possible sur les
//    versions pendant la normalisation). Même règle de staleness que
//    SupabaseWorker.acquireLock (10 min) : un lock orphelin (crash) est ignoré.
const WORKER_LOCK_STALE_MS = 10 * 60 * 1000;
if (fs.existsSync(LOCK_PATH)) {
  const ageMs = Date.now() - fs.statSync(LOCK_PATH).mtimeMs;
  if (ageMs > WORKER_LOCK_STALE_MS) {
    console.warn('[resync] Lock orphelin (' + Math.round(ageMs / 1000) + 's) — considéré stale, reprise.');
  } else {
    console.error('[resync] Abandon : un worker est actif (lock ' + LOCK_PATH + '). Arrêtez l\'application puis relancez.');
    process.exit(1);
  }
}

// 2) Sécurité : Supabase doit être joignable AVANT toute modification locale.
const client = getAdminClient();
const ping = await client.from('users').select('id', { count: 'exact', head: true }).limit(1);
if (ping.error) {
  console.error('[resync] Abandon : Supabase injoignable (' + ping.error.message + ') — aucune modification locale.');
  process.exit(1);
}

// 3) Sécurité : aucun changement déjà en attente pour ces tables (on ne
//    mélange pas des opérations métier réelles avec le ré-alignement).
const pending = db.prepare(
  `SELECT table_name, record_id, operation FROM sync_changelog WHERE pushed_to_supabase = 0 AND table_name IN (?, ?)`
).all(...TABLES) || [];
if (pending.length > 0) {
  console.error('[resync] Abandon : changements en attente pour users/roles — diagnostiquez d\'abord :');
  for (const p of pending) console.error('   -', p.table_name, p.record_id, p.operation);
  process.exit(1);
}

// 4) Lecture des versions PG actuelles (clé : table/id).
const pgInfo = {};
for (const table of TABLES) {
  const localIds = (db.prepare(`SELECT id FROM ${table}`).all() || []).map((r) => r.id);
  if (localIds.length === 0) {
    console.error(`[resync] Abandon : aucune ligne locale dans ${table}.`);
    process.exit(1);
  }
  const { data, error } = await client.from(table).select('legacy_id, version, updated_at').in('legacy_id', localIds);
  if (error) {
    console.error(`[resync] Abandon : lecture PG ${table} impossible (${error.message}).`);
    process.exit(1);
  }
  if (!data || data.length !== localIds.length) {
    const found = new Set((data || []).map((r) => r.legacy_id));
    const missing = localIds.filter((id) => !found.has(id));
    console.error(`[resync] Abandon : lignes locales absentes côté PG (${missing.join(', ')}) — cas local_only non géré par ce script.`);
    process.exit(1);
  }
  for (const r of data) pgInfo[`${table}/${r.legacy_id}`] = { version: r.version ?? 0, updatedAt: r.updated_at };
}

// 5) Normalisation locale : version = PG + 1, updatedAt = maintenant, puis
//    entrée changelog UPDATE (le push relit l'état local courant).
const now = new Date().toISOString();
const changelogCols = (db.prepare(`PRAGMA table_info(sync_changelog)`).all() || []).map((c) => c.name);
const changes = [];
const insertCols = ['id', 'table_name', 'record_id', 'operation', 'old_values', 'new_values', 'old_version', 'new_version', 'created_at'];
const insertValues = [];
const injectCols = ['pushed_to_supabase', 'retry_count', 'max_retries', 'status'];
for (const col of injectCols) {
  if (changelogCols.includes(col)) {
    insertCols.push(col);
    insertValues.push(col === 'pushed_to_supabase' || col === 'retry_count' ? 0 : col === 'max_retries' ? CHANGELOG_MAX_RETRIES : 'pending');
  }
}

for (const table of TABLES) {
  const localRows = db.prepare(`SELECT * FROM ${table}`).all() || [];
  for (const oldRow of localRows) {
    const key = `${table}/${oldRow.id}`;
    const pg = pgInfo[key];
    const targetVersion = pg.version + 1;
    db.prepare(`UPDATE ${table} SET version = ?, updatedAt = ? WHERE id = ?`).run(targetVersion, now, oldRow.id);
    const newRow = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(oldRow.id);
    const changeId = `chg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const placeholders = insertCols.map(() => '?').join(', ');
    const params = [
      changeId, table, oldRow.id, 'UPDATE',
      JSON.stringify(oldRow), JSON.stringify(newRow),
      oldRow.version ?? 0, targetVersion, now,
    ];
    for (const v of insertValues) params.push(v);
    db.prepare(`INSERT INTO sync_changelog (${insertCols.join(', ')}) VALUES (${placeholders})`).run(...params);
    changes.push({ table, id: oldRow.id });
    console.log(`[resync] ${key}: v${oldRow.version ?? 0} -> v${targetVersion} (PG v${pg.version} + 1)`);
  }
}

// 6) Push via le pipeline officiel (verrou pushLock, mêmes règles que le worker).
const result = await syncService.syncUpFromChangelog();
console.log(`[resync] push : ${result.pushed} poussé(s), ${result.failed} échec(s)`);
if (result.errors.length) {
  for (const e of result.errors) console.error('   -', e);
  process.exit(1);
}
if (result.pushed !== changes.length) {
  console.error(`[resync] Abandon : ${result.pushed} poussés pour ${changes.length} attendus — vérifiez le changelog.`);
  process.exit(1);
}

// 7) Alignement final : local.updatedAt = PG.updated_at post-push (tolérance
//    du contrôle = 1 s ; le trigger PG a forcé NOW() au moment de l'upsert).
for (const { table, id } of changes) {
  const { data, error } = await client.from(table).select('updated_at, version').eq('legacy_id', id).single();
  if (error) {
    console.warn(`[resync] ${table}/${id}: impossible de relire PG (${error.message}) — vérification cohérence suivra.`);
    continue;
  }
  db.prepare(`UPDATE ${table} SET updatedAt = ? WHERE id = ?`).run(data.updated_at, id);
  console.log(`[resync] ${table}/${id}: aligné updatedAt local = ${data.updated_at} (PG v${data.version})`);
}

// 8) Contrôle de cohérence complet (deep) pour valider.
const { runCoherenceCheck } = await import('../src/server/services/coherenceService.js');
const report = await runCoherenceCheck({ deep: true });
console.log(`\n[resync] Cohérence : ${report.summary.ok} OK, ${report.summary.pending} en attente, ${report.summary.incoherent} incohérents, ${report.summary.unknown} inconnus (sur ${report.summary.checked} tables)`);
for (const t of report.tables) {
  if (t.status !== 'ok') console.log(`   ${t.table}: ${t.status.toUpperCase()} — ${t.cause}`);
  else if (TABLES.includes(t.table)) console.log(`   ${t.table}: OK`);
}
process.exit(report.summary.incoherent > 0 ? 1 : 0);
