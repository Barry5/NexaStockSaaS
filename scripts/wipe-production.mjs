#!/usr/bin/env node
/**
 * scripts/wipe-production.mjs
 * Wipe complet pour démarrage production :
 *  1. Sauvegarde SQLite pré-wipe
 *  2. Vide Supabase (tables métier, enfants -> parents)
 *  3. Vide SQLite (tables métier + sync), conserve u-1
 *  4. Corrections : purge rôles id:null, user_roles hors u-1, re-seed RBAC (004) + plan_modules (005)
 *  5. fullPush() du seed système vers Supabase
 *  6. Vérification des comptages
 *
 * Usage : node --import tsx scripts/wipe-production.mjs
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DB_PATH = path.join(ROOT, 'data', 'database.db');

const { syncService } = await import('../src/server/sync/syncService.js');
const { getAdminClient } = await import('../src/server/services/supabase/supabaseService.js');
const { default: db } = await import('../src/server/database/db.js');

// 1. Backup pré-wipe
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(ROOT, 'data', `database.db.pre-wipe-production-${ts}.bak`);
if (fs.existsSync(DB_PATH)) {
  fs.copyFileSync(DB_PATH, backupPath);
  console.log(`[1] Backup pré-wipe: ${backupPath}`);
}
try { fs.copyFileSync(DB_PATH + '-wal', backupPath + '-wal'); } catch { /* pas de WAL */ }

// Tables métier à vider (même liste/ordre que /api/sync/wipe-all : enfants -> parents)
const WIPE_TABLES = [
  'sale_affiliates', 'sale_commission_items', 'sale_items', 'return_items',
  'delivery_order_items', 'invoice_items', 'invoice_audit_log',
  'commission_ledger', 'commission_payments', 'commission_audit',
  'repayments', 'loan_installments', 'product_variants', 'delivery_note_audit',
  'audit_logs', 'returns', 'delivery_orders', 'invoices', 'payments',
  'sales', 'expenses', 'loans', 'customers', 'suppliers', 'products',
  'warehouses', 'stock_transfers', 'affiliates', 'commission_rules',
  'subscription_payments', 'subscription_invoices', 'tenant_modules',
  'gdrive_tokens', 'users', 'tenants',
];

// 2. Wipe Supabase
console.log('\n[2] Wipe Supabase (tables métier)...');
const admin = getAdminClient();
const errors = [];
let tablesClearedRemote = 0;
for (const table of WIPE_TABLES) {
  try {
    let query;
    if (table === 'gdrive_tokens') {
      query = admin.from(table).delete().not('tenant_id', 'is', null);
    } else if (table === 'tenant_modules') {
      query = admin.from(table).delete().neq('id', '00000000-0000-0000-0000-0000-000000000000');
    } else {
      query = admin.from(table).delete().neq('legacy_id', '__never__');
    }
    const { error } = await query;
    if (error) { errors.push(`${table}: ${error.message}`); console.log(`  ⚠ ${table}: ${error.message}`); }
    else { tablesClearedRemote++; }
  } catch (e) {
    errors.push(`${table}: ${e.message}`);
  }
}
console.log(`[2] Supabase: ${tablesClearedRemote}/${WIPE_TABLES.length} tables vidées${errors.length ? ' (' + errors.length + ' erreurs)' : ''}`);

// 3. Wipe SQLite + corrections
console.log('\n[3] Wipe SQLite + corrections...');
const wipe = db.transaction(() => {
  let cleared = 0;
  for (const table of WIPE_TABLES) {
    if (table === 'users') {
      db.prepare(`DELETE FROM users WHERE id != 'u-1'`).run();
    } else {
      db.prepare(`DELETE FROM ${table}`).run();
    }
    cleared++;
  }
  // sync (uuid_map conservé : UUID des tables système)
  for (const t of ['sync_queue', 'sync_changelog', 'sync_deletions', 'sync_tracking']) {
    try { db.prepare(`DELETE FROM ${t}`).run(); } catch { /* absente */ }
  }
  // Doublons rôles cassés (id NULL, issus de la restauration du 01/08)
  const orphanRoles = db.prepare(`DELETE FROM roles WHERE id IS NULL`).run().changes;
  // user_roles vers des users supprimés (on ne garde que u-1)
  const orphanUrs = db.prepare(`DELETE FROM user_roles WHERE userId != 'u-1'`).run().changes;
  return { cleared, orphanRoles, orphanUrs };
})();
console.log(`[3] Tables métier vidées: ${wipe.cleared}, rôles id:null purgés: ${wipe.orphanRoles}, user_roles orphelins purgés: ${wipe.orphanUrs}`);

// 4. Re-seed RBAC (rôles/permissions/role_permissions/user_roles) + plan_modules (idempotent)
console.log('\n[4] Re-seed RBAC + plan_modules...');
const { up: up004 } = await import('../src/server/database/migrations/004_rbac.js');
const { up: up005 } = await import('../src/server/database/migrations/005_multi_tenant_rbac.js');
up004(db);
up005(db);
console.log(`[4] role_permissions=${db.prepare('SELECT COUNT(*) c FROM role_permissions').get().c}, user_roles=${db.prepare('SELECT COUNT(*) c FROM user_roles').get().c}, plan_modules=${db.prepare('SELECT COUNT(*) c FROM plan_modules').get().c}`);

// 5. Plan_modules PG : vider les lignes polluées (1058) puis repousser le seed propre
console.log('\n[5] Nettoyage plan_modules PG (pollution seed) + fullPush...');
const { error: pmDelErr } = await admin.from('plan_modules').delete().neq('id', '00000000-0000-0000-0000-0000-000000000000');
if (pmDelErr) console.log('  ⚠ plan_modules PG:', pmDelErr.message);
const push = await syncService.fullPush();
console.log(`[5] fullPush: ${push.pushed} lignes poussées, ${push.failed} échecs${push.errors.length ? ':\n  - ' + push.errors.join('\n  - ') : ''}`);

// 6. Vérification FK locale + comptages
console.log('\n[6] Vérification finale...');
const fk = db.prepare('PRAGMA foreign_key_check').all();
console.log(`  FK SQLite: ${fk.length === 0 ? 'OK (aucune violation)' : JSON.stringify(fk)}`);

const checkTables = ['tenants', 'users', 'user_roles', 'roles', 'permissions', 'role_permissions', 'products', 'customers', 'suppliers', 'warehouses', 'sales', 'invoices', 'invoice_items', 'delivery_orders', 'payments', 'expenses', 'loans', 'affiliates', 'commission_rules', 'plan_modules', 'module_definitions', 'pricing_plans', 'global_saas_settings'];
console.log('  Table                 | SQLite | PG');
for (const t of checkTables) {
  let local;
  try { local = db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c; } catch { local = -1; }
  const { count, error } = await admin.from(t).select('*', { count: 'exact', head: true });
  console.log(`  ${t.padEnd(20)} | ${String(local).padEnd(6)} | ${error ? 'ERR ' + error.message : count}`);
}
process.exit(0);
