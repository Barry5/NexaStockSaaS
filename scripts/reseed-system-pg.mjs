#!/usr/bin/env node
/**
 * scripts/reseed-system-pg.mjs
 * Vide les tables système côté Supabase (rôles, permissions, forfaits, modules,
 * paramètres) puis les repousse via fullPush() pour un état cohérent.
 * Usage : node --import tsx scripts/reseed-system-pg.mjs
 */
import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

const { syncService } = await import('../src/server/sync/syncService.js');
const { getAdminClient } = await import('../src/server/services/supabase/supabaseService.js');
const { default: db } = await import('../src/server/database/db.js');

const admin = getAdminClient();

// Ordre enfants -> parents (FK-safe). Tables SANS legacy_id vidées par colonne naturelle.
const SYSTEM_TABLES = [
  { pg: 'role_permissions', wipe: 'legacy_id' },
  { pg: 'user_roles', wipe: 'legacy_id' },
  { pg: 'plan_modules', wipe: 'not-id' },
  { pg: 'tenant_modules', wipe: 'not-id' },
  { pg: 'module_definitions', wipe: 'not-key' },
  { pg: 'pricing_plans', wipe: 'legacy_id' },
  { pg: 'permissions', wipe: 'legacy_id' },
  { pg: 'roles', wipe: 'legacy_id' },
  { pg: 'global_saas_settings', wipe: 'gte-id' },
];

console.log('[reseed] Vidage tables système PG...');
for (const { pg, wipe } of SYSTEM_TABLES) {
  try {
    let query;
    if (wipe === 'legacy_id') query = admin.from(pg).delete().neq('legacy_id', '__never__');
    else if (wipe === 'not-id') query = admin.from(pg).delete().not('id', 'is', null);
    else if (wipe === 'not-key') query = admin.from(pg).delete().neq('key', '');
    else if (wipe === 'gte-id') query = admin.from(pg).delete().gte('id', 0);
    const { error } = await query;
    if (error) console.log(`  ⚠ ${pg}: ${error.message}`);
    else console.log(`  ok ${pg}`);
  } catch (e) {
    console.log(`  ⚠ ${pg}: ${e.message}`);
  }
}

console.log('\n[reseed] fullPush()...');
const push = await syncService.fullPush();
console.log(`[reseed] fullPush: ${push.pushed} poussées, ${push.failed} échecs${push.errors.length ? ':\n  - ' + push.errors.join('\n  - ') : ''}`);

console.log('\n[reseed] Vérification:');
const checkTables = ['users', 'user_roles', 'roles', 'permissions', 'role_permissions', 'plan_modules', 'module_definitions', 'pricing_plans', 'global_saas_settings'];
for (const t of checkTables) {
  let local;
  try { local = db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c; } catch { local = -1; }
  const { count, error } = await admin.from(t).select('*', { count: 'exact', head: true });
  console.log(`  ${t.padEnd(22)} | SQLite=${local} | PG=${error ? 'ERR ' + error.message : count}`);
}
process.exit(0);
