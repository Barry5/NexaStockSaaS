export const TABLE_MAPPINGS = [
  { sqliteName: 'tenants', pgName: 'tenants' },
  { sqliteName: 'users', pgName: 'users' },
  { sqliteName: 'products', pgName: 'products' },
  { sqliteName: 'customers', pgName: 'customers' },
  { sqliteName: 'suppliers', pgName: 'suppliers' },
  { sqliteName: 'warehouses', pgName: 'warehouses' },
  { sqliteName: 'product_variants', pgName: 'product_variants' },
  { sqliteName: 'sales', pgName: 'sales' },
  { sqliteName: 'sale_items', pgName: 'sale_items' },
  { sqliteName: 'expenses', pgName: 'expenses' },
  { sqliteName: 'loans', pgName: 'loans' },
  { sqliteName: 'repayments', pgName: 'repayments' },
  { sqliteName: 'loan_installments', pgName: 'loan_installments' },
  { sqliteName: 'stock_transfers', pgName: 'stock_transfers' },
  { sqliteName: 'invoices', pgName: 'invoices' },
  { sqliteName: 'invoice_items', pgName: 'invoice_items' },
  { sqliteName: 'delivery_orders', pgName: 'delivery_orders' },
  { sqliteName: 'delivery_order_items', pgName: 'delivery_order_items' },
  { sqliteName: 'payments', pgName: 'payments' },
  { sqliteName: 'returns', pgName: 'returns' },
  { sqliteName: 'return_items', pgName: 'return_items' },
  { sqliteName: 'invoice_audit_log', pgName: 'invoice_audit_log' },
  { sqliteName: 'affiliates', pgName: 'affiliates' },
  { sqliteName: 'commission_rules', pgName: 'commission_rules' },
  { sqliteName: 'commission_ledger', pgName: 'commission_ledger' },
  { sqliteName: 'commission_payments', pgName: 'commission_payments' },
  { sqliteName: 'commission_audit', pgName: 'commission_audit' },
  { sqliteName: 'sale_affiliates', pgName: 'sale_affiliates' },
  { sqliteName: 'sale_commission_items', pgName: 'sale_commission_items' },
  { sqliteName: 'audit_logs', pgName: 'audit_logs' },
  { sqliteName: 'delivery_note_audit', pgName: 'delivery_note_audit' },
  { sqliteName: 'roles', pgName: 'roles' },
  { sqliteName: 'permissions', pgName: 'permissions' },
  { sqliteName: 'role_permissions', pgName: 'role_permissions' },
  { sqliteName: 'user_roles', pgName: 'user_roles' },
  { sqliteName: 'module_definitions', pgName: 'module_definitions' },
  { sqliteName: 'plan_modules', pgName: 'plan_modules' },
  { sqliteName: 'tenant_modules', pgName: 'tenant_modules' },
  { sqliteName: 'pricing_plans', pgName: 'pricing_plans' },
  { sqliteName: 'subscription_invoices', pgName: 'subscription_invoices' },
  { sqliteName: 'subscription_payments', pgName: 'subscription_payments' },
  { sqliteName: 'global_saas_settings', pgName: 'global_saas_settings' },
  { sqliteName: 'gdrive_tokens', pgName: 'gdrive_tokens' },
];

// Tables qui n'ont PAS de colonne `updated_at` dans le schéma PostgreSQL.
// La synchronisation descendante (down-sync) se basera sur `created_at` pour celles-ci.
export const TABLES_WITHOUT_UPDATED_AT = new Set([
  'permissions', 'role_permissions', 'user_roles',
  'module_definitions', 'plan_modules', 'tenant_modules',
  'invoice_audit_log', 'commission_audit', 'audit_logs', 'delivery_note_audit'
]);

export const SYNC_TABLES = TABLE_MAPPINGS.map(m => m.sqliteName);
export const SYNC_TABLE_SET = new Set(SYNC_TABLES);