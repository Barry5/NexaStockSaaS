export const SYNC_TABLES = [
  'tenants', 'users', 'products', 'product_variants', 'customers', 'suppliers',
  'sales', 'sale_items', 'expenses', 'loans', 'repayments', 'loan_installments',
  'warehouses', 'stock_transfers', 'invoices', 'invoice_items',
  'delivery_orders', 'delivery_order_items', 'payments', 'returns', 'return_items',
  'affiliates', 'commission_rules', 'commission_ledger', 'commission_payments',
  'commission_audit', 'sale_affiliates', 'sale_commission_items',
  'subscription_invoices', 'subscription_payments', 'pricing_plans',
  'global_saas_settings', 'audit_logs', 'invoice_audit_log',
  'delivery_note_audit', 'gdrive_tokens', 'roles', 'permissions',
  'role_permissions', 'user_roles', 'module_definitions', 'tenant_modules',
] as const;

export type SyncTableName = (typeof SYNC_TABLES)[number];

export interface TableMapping {
  sqliteName: string;
  pgName: string;
}

export const TABLE_MAPPINGS: TableMapping[] = SYNC_TABLES.map(t => ({ sqliteName: t, pgName: t }));

export const SYNC_TABLE_SET: ReadonlySet<string> = new Set(SYNC_TABLES);

// Tables dont le schéma PostgreSQL n'a PAS de colonne updated_at (le pull incrémental
// via getChangesSince ne peut pas les interroger) — elles sont poussées uniquement.
export const TABLES_WITHOUT_UPDATED_AT: ReadonlySet<string> = new Set([
  'module_definitions', 'tenant_modules', 'audit_logs', 'invoice_audit_log',
  'commission_audit', 'permissions', 'role_permissions', 'user_roles',
  'delivery_note_audit',
]);
