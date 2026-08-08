#!/usr/bin/env node
/**
 * scripts/push-migrated.mjs
 * Pousse le sync_changelog (données fusionnées depuis le backup) vers Supabase
 * via le pipeline officiel syncUpFromChangelog, puis vérifie les comptages.
 *
 * Usage : node --import tsx scripts/push-migrated.mjs
 */
import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

const { syncService } = await import('../src/server/sync/syncService.js');
const { syncEngine } = await import('../src/server/sync/syncEngine.js');
const { getAdminClient } = await import('../src/server/services/supabase/supabaseService.js');

const TABLES = ['tenants', 'users', 'user_roles', 'customers', 'suppliers', 'products', 'warehouses', 'expenses', 'loans', 'repayments', 'loan_installments', 'affiliates', 'commission_rules', 'invoices', 'invoice_items', 'delivery_orders', 'delivery_order_items', 'payments', 'sales'];

const pendingBefore = syncEngine.getPendingChangesSummary();
console.log('[push] changelog en attente:', pendingBefore.changelogCount);

if (pendingBefore.changelogCount > 0) {
  const result = await syncService.syncUpFromChangelog();
  console.log(`[push] poussé: ${result.pushed}, échecs: ${result.failed}`);
  if (result.errors.length) {
    console.log('  Erreurs:');
    for (const e of result.errors) console.log('   -', e);
  }
}

const after = syncEngine.getPendingChangesSummary();
console.log('[push] changelog restant:', after.changelogCount, '(dead:', after.deadChangeCount, ')');

const client = getAdminClient();
console.log('\n[push] Vérification comptages PG vs SQLite:');
for (const t of TABLES) {
  const { count, error } = await client.from(t).select('*', { count: 'exact', head: true });
  if (error) { console.log(`  ${t}: ERREUR ${error.message}`); continue; }
  console.log(`  ${t}: PG=${count}`);
}
