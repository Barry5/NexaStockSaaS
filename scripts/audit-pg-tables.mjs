import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

const { getAdminClient } = await import('../src/server/services/supabase/supabaseService.js');
const { syncEngine } = await import('../src/server/sync/syncEngine.js');

const client = getAdminClient();

const TABLES = ['tenants', 'users', 'products', 'customers', 'suppliers', 'warehouses', 'product_variants', 'sales', 'sale_items', 'expenses', 'loans', 'repayments', 'loan_installments', 'stock_transfers', 'invoices', 'invoice_items', 'delivery_orders', 'delivery_order_items', 'payments', 'returns', 'return_items', 'invoice_audit_log', 'affiliates', 'commission_rules', 'commission_ledger', 'commission_payments', 'commission_audit', 'sale_affiliates', 'sale_commission_items', 'invoice_affiliates', 'invoice_commission_items', 'audit_logs', 'delivery_note_audit', 'roles', 'permissions', 'role_permissions', 'user_roles', 'module_definitions', 'plan_modules', 'tenant_modules', 'pricing_plans', 'subscription_invoices', 'subscription_payments', 'global_saas_settings', 'gdrive_tokens'];

console.log('=== ÉTAT ACTUEL SUPABASE ===');
for (const t of TABLES) {
  const { count, error } = await client.from(t).select('*', { count: 'exact', head: true });
  console.log(`${error ? 'ERR' : 'ok '} ${t}=${error ? error.message : count}`);
}
process.exit(0);
