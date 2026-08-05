// Scope tenant des routes /api/sync (audit SEC-1/2/3/10, §2.4) : centralise
// les règles de filtrage/validation pour éviter toute duplication entre les
// routes (routes/sync.ts) et le moteur (syncEngine.pullChanges).

// Tables dont les lignes appartiennent à un tenant (colonne tenantId directe).
export const TENANT_SCOPED_TABLES = new Set([
  'users', 'products', 'customers', 'suppliers', 'expenses', 'loans', 'sales',
  'warehouses', 'stock_transfers', 'audit_logs', 'subscription_invoices',
  'subscription_payments', 'invoices', 'delivery_orders', 'payments', 'returns',
  'affiliates', 'commission_rules', 'commission_ledger', 'commission_payments',
  'commission_audit', 'sale_affiliates', 'sale_commission_items',
  'delivery_note_audit', 'tenant_modules', 'gdrive_tokens',
]);

// Tables enfants (pas de colonne tenantId) : le tenant se résout via le parent.
export const CHILD_TENANT_PARENT: Record<string, { parent: string; column: string }> = {
  product_variants: { parent: 'products', column: 'productId' },
  sale_items: { parent: 'sales', column: 'saleId' },
  repayments: { parent: 'loans', column: 'loanId' },
  loan_installments: { parent: 'loans', column: 'loanId' },
  invoice_items: { parent: 'invoices', column: 'invoiceId' },
  delivery_order_items: { parent: 'delivery_orders', column: 'deliveryOrderId' },
  return_items: { parent: 'returns', column: 'returnId' },
  invoice_audit_log: { parent: 'invoices', column: 'invoiceId' },
  role_permissions: { parent: 'roles', column: 'roleId' },
  user_roles: { parent: 'users', column: 'userId' },
};

// Tables globales/système : lecture partagée (config SaaS), écriture réservée
// au superadmin (un tenant ne peut ni lire les données des autres ni modifier
// la configuration globale / RBAC via /api/sync).
export const GLOBAL_TABLES = new Set([
  'tenants', 'pricing_plans', 'global_saas_settings', 'permissions',
  'module_definitions', 'plan_modules', 'roles', 'role_permissions', 'user_roles',
]);

// Conditions SQL de scope tenant pour le pull client (pullChanges).
// Retourne { clause, params } ; clause vide = table globale (tous les tenants).
export function tenantWhereClause(table: string, tenantId: string): { clause: string; params: unknown[] } {
  if (TENANT_SCOPED_TABLES.has(table)) {
    return { clause: 'tenantId = ?', params: [tenantId] };
  }
  const child = CHILD_TENANT_PARENT[table];
  if (child) {
    if (table === 'role_permissions') {
      return { clause: 'roleId IN (SELECT id FROM roles WHERE tenantId = ? OR tenantId IS NULL)', params: [tenantId] };
    }
    if (table === 'user_roles') {
      return { clause: 'userId IN (SELECT id FROM users WHERE tenantId = ?)', params: [tenantId] };
    }
    return { clause: `${child.column} IN (SELECT id FROM ${child.parent} WHERE tenantId = ?)`, params: [tenantId] };
  }
  return { clause: '', params: [] };
}
