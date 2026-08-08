#!/usr/bin/env node
/**
 * scripts/sync-invoices.mjs
 *
 * Synchronise locale -> Supabase :
 *  1. Vérifie que le schéma PG contient bien les tables clés (invoice_affiliates,
 *     invoice_commission_items, ...). Si manquantes -> arrête et indique quelle
 *     migration SQL appliquer (via `supabase db push`).
 *  2. Lance migrationService.migrateAll({ fullReupload: true }) pour pousser TOUTES
 *     les données (factures, articles, ventes, apporteur commissions, ...) vers PG.
 *  3. Relance syncDown pour rattraper d'éventuelles tables déjà présentes côté supabase.
 *
 * Usage :  node scripts/sync-invoices.mjs
 * Env    : .env / .env.local (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
 */
import dotenv from 'dotenv';
import { spawnSync } from 'child_process';

dotenv.config();
dotenv.config({ path: '.env.local', override: true });

const REQUIRED_TABLES = [
  'tenants',
  'products',
  'invoices',
  'invoice_items',
  'invoice_affiliates',
  'invoice_commission_items',
  'affiliates',
];

const MISSING_HINT = {
  invoice_affiliates: 'supabase/migrations/005_invoice_commissions.sql',
  invoice_commission_items: 'supabase/migrations/005_invoice_commissions.sql',
};

function fail(msg) {
  console.error('\n[sync-invoices] X ' + msg);
  process.exit(1);
}

function checkSupabaseConfigured() {
  if (!process.env.SUPABASE_URL) fail('SUPABASE_URL absent de .env / .env.local');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) fail('SUPABASE_SERVICE_ROLE_KEY absent');
}

async function probeSchema() {
  const { getAdminClient } = await import('../src/server/services/supabase/supabaseService.js');
  const client = getAdminClient();
  const missing = [];
  for (const t of REQUIRED_TABLES) {
    const { error } = await client.from(t).select('id').limit(1);
    // PostgREST renvoie 48001 / "relation does not exist" OU le message
    // 'Could not find the table ... in the schema cache' → table absente
    if (error && /relation .* does not exist|could not find the table|PGRST116|not found|schema cache/i.test(error.message || '')) {
      missing.push(t);
    }
  }
  return missing;
}

function runSupabaseDbPush() {
  console.log('[sync-invoices] -> supabase db push (applique les migrations PG)');
  const res = spawnSync('npx', ['supabase', 'db', 'push', '--confirm'], {
    stdio: 'inherit',
    shell: true,
  });
  if (res.status !== 0) fail('supabase db push a échoué (voir logs ci-dessus)');
}

async function migrateData() {
  console.log('[sync-invoices] -> migrationService.migrateAll (upload données)');
  const { migrationService } = await import('../src/server/services/migrationService.js');
  const result = await migrationService.migrateAll((progress) => {
    const done = progress.filter((p) => p.status === 'completed' || p.status === 'failed').length;
    process.stdout.write(`\r     progression: ${done}/${progress.length}`);
  }, true);

  process.stdout.write('\r');
  for (const r of result.results) {
    if (r.status !== 'completed') {
      console.log(`  ${r.status === 'failed' ? 'X' : '?'} ${r.table}: ${r.migrated}/${r.total} (${r.status}) ${r.error || ''}`);
    }
  }
  console.log(`[sync-invoices] ${result.totalMigrated} lignes poussées, ${result.totalErrors} erreurs`);
  if (result.totalErrors > 0) fail('Des tables n\'ont pas pu être synchronisées (schéma PG incomplet)');
}

async function main() {
  checkSupabaseConfigured();
  console.log('[sync-invoices] Configuration Supabase OK');

  const missing = await probeSchema();
  if (missing.length > 0) {
    console.log('[sync-invoices] Tables manquantes côté PG :');
    for (const t of missing) {
      const hint = MISSING_HINT[t] || 'supabase/migrations/001_full_schema.sql puis 002..005';
      console.log(`   - ${t}  → applique ${hint}`);
    }
    console.log('[sync-invoices] Correction : les migrations PG ne sont pas poussées.');
    // Propose d'appliquer automatiquement si le CLI est dispo
    const ls = spawnSync('npx', ['supabase', 'version'], { shell: true });
    if (ls.status === 0) {
      console.log('[sync-invoices] Le CLI `supabase` est disponible → application automatique.');
      runSupabaseDbPush();
    } else {
      fail('Installez le CLI Supabase (`npm i -g supabase` ou `npx supabase`) puis lancez `supabase db push`.');
    }
  } else {
    console.log('[sync-invoices] Schéma PG validé (tables présentes).');
  }

  await migrateData();
  console.log('[sync-invoices] OK — les factures/ventes/commissions apporteur sont synchronisées.');
}

main().catch((e) => fail(e?.message || String(e)));
