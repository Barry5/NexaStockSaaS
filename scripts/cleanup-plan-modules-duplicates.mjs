#!/usr/bin/env node
/**
 * scripts/cleanup-plan-modules-duplicates.mjs
 * Supprime les doublons orphelins de `plan_modules` côté Supabase : lignes dont
 * le plan_id n'existe pas dans pricing_plans (push dupliqué sans mapping UUID,
 * 01:57:58). Les lignes valides (mappées en local) sont conservées.
 *
 * Diagnostic d'abord (affichage sans modification), puis suppression si le
 * compte de lignes ciblées == compte attendu (33). Contrôle de cohérence deep
 * en fin de script.
 *
 * Usage : node --import tsx scripts/cleanup-plan-modules-duplicates.mjs
 */
import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

import db from '../src/server/database/db.js';
import { getAdminClient } from '../src/server/services/supabase/supabaseService.js';

const EXPECTED_ORPHANS = 33;
const client = getAdminClient();

const { data: planIds, error: plansError } = await client.from('pricing_plans').select('id');
if (plansError) { console.error('[cleanup] Abandon : pricing_plans illisible (' + plansError.message + ').'); process.exit(1); }
const validPlanIds = new Set(planIds.map(p => p.id));

const { data: rows, error: rowsError } = await client.from('plan_modules').select('id, plan_id, module_key, created_at').order('created_at');
if (rowsError) { console.error('[cleanup] Abandon : plan_modules illisible (' + rowsError.message + ').'); process.exit(1); }

const orphans = rows.filter(r => !validPlanIds.has(r.plan_id));
console.log(`[cleanup] plan_modules : ${rows.length} lignes PG, ${orphans.length} orphelines (plan_id inexistant).`);

// Sécurité 1 : aucune ligne orpheline ne doit être mappée en local (sinon on
// supprimerait une ligne référencée par le sync).
const mappedOrphans = orphans.filter(r => db.prepare('SELECT 1 FROM sync_uuid_map WHERE pg_uuid = ?').get(r.id));
if (mappedOrphans.length > 0) {
  console.error('[cleanup] Abandon : ' + mappedOrphans.length + ' ligne(s) orpheline(s) mappée(s) en local — cas non prévu.');
  process.exit(1);
}

// Sécurité 2 : le compte doit correspondre exactement au diagnostic (33).
if (orphans.length !== EXPECTED_ORPHANS) {
  console.error(`[cleanup] Abandon : ${orphans.length} orphelines attendues ${EXPECTED_ORPHANS} — vérifiez manuellement.`);
  process.exit(1);
}

// Sécurité 3 : chaque ligne restante (non orpheline) doit avoir une copie
// mappée : après suppression, PG doit contenir exactement les lignes locales.
const localCount = (db.prepare('SELECT COUNT(*) c FROM plan_modules').get()).c;
if (rows.length - orphans.length !== localCount) {
  console.error(`[cleanup] Abandon : après suppression PG=${rows.length - orphans.length} mais local=${localCount}.`);
  process.exit(1);
}

console.log('[cleanup] Suppression de ' + orphans.length + ' lignes orphelines...');
const ids = orphans.map(r => r.id);
const { error: delError } = await client.from('plan_modules').delete().in('id', ids);
if (delError) { console.error('[cleanup] Échec DELETE : ' + delError.message); process.exit(1); }

const { data: remaining } = await client.from('plan_modules').select('id');
console.log(`[cleanup] OK : ${remaining.length} lignes restantes côté PG (local: ${localCount}).`);

const { runCoherenceCheck } = await import('../src/server/services/coherenceService.js');
const report = await runCoherenceCheck({ deep: true });
console.log(`[cleanup] Cohérence : ${report.summary.ok} OK, ${report.summary.pending} en attente, ${report.summary.incoherent} incohérents, ${report.summary.unknown} inconnus (sur ${report.summary.checked} tables)`);
for (const t of report.tables) {
  if (t.status !== 'ok') console.log(`   ${t.table}: ${t.status.toUpperCase()} — ${t.cause}`);
}
process.exit(report.summary.incoherent > 0 ? 1 : 0);
