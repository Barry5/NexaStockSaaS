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
  { sqliteName: 'invoice_affiliates', pgName: 'invoice_affiliates' },
  { sqliteName: 'invoice_commission_items', pgName: 'invoice_commission_items' },
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

// Priorité de synchronisation ascendante (push SQLite -> Supabase).
// Une priorité plus PETTE est traitée en priorité. Les tables "parentes"
// (sans FK vers d'autres tables de sync, ou dépendant seulement de tenants)
// sont traitées avant leurs "enfants" afin de satisfaire les contraintes de
// clé étrangère PostgreSQL au moment de l'upsert (ex: invoices avant
// invoice_audit_log / invoice_items, sales avant sale_items, loans avant
// repayments). L'order est dérivé du graphe de dépendances FK de 001_full_schema.sql.
export const TABLE_SYNC_PRIORITY: Record<string, number> = {
  // 0 — racines (aucune FK ou FK interne entre racines)
  tenants: 0, roles: 0, permissions: 0,
  module_definitions: 0, pricing_plans: 0, global_saas_settings: 0,
  // 1 — dépendent uniquement de tenants / racines
  users: 1, warehouses: 1, suppliers: 1, customers: 1, products: 1,
  gdrive_tokens: 1, affiliates: 1,
  subscription_invoices: 1, subscription_payments: 1,
  expenses: 1, audit_logs: 1,
  invoices: 1, loans: 1,
  role_permissions: 1, tenant_modules: 1, plan_modules: 1,
  // 2 — dépendent de tables de profondeur 1
  sales: 2, commission_ledger: 2, commission_payments: 2, commission_audit: 2,
  product_variants: 2, stock_transfers: 2, commission_rules: 2,
  repayments: 2, loan_installments: 2,
  invoice_items: 2, delivery_orders: 2, payments: 2, returns: 2, invoice_audit_log: 2,
  // 3 — dépendent de tables de profondeur 2
  sale_items: 3, sale_affiliates: 3, sale_commission_items: 3,
  invoice_affiliates: 3, invoice_commission_items: 3,
  delivery_order_items: 3, return_items: 3, delivery_note_audit: 3,
};

const DEFAULT_SYNC_PRIORITY = 50;

let priorityCaseBody: string | null = null;
// Génère une expression SQL `CASE <column> WHEN ... THEN n ... ELSE 50 END`
// utilisable dans un ORDER BY pour traiter les tables parentes avant leurs
// enfant (clé primaire résolue via sync_uuid_map -> FK valide en amont).
export function tablePriorityCase(column = 'table_name'): string {
  if (!priorityCaseBody) {
    priorityCaseBody = (Object.keys(TABLE_SYNC_PRIORITY) as string[])
      .map(t => `WHEN '${t}' THEN ${TABLE_SYNC_PRIORITY[t]}`)
      .join(' ');
  }
  return `CASE ${column} ${priorityCaseBody} ELSE ${DEFAULT_SYNC_PRIORITY} END`;
}

export function tablePriority(tableName: string): number {
  return TABLE_SYNC_PRIORITY[tableName] ?? DEFAULT_SYNC_PRIORITY;
}