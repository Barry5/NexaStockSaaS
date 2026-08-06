// Source de vérité UNIQUE des mappings client <-> serveur (audit P1/P2) :
// - CLIENT_FIELD_TO_TABLE : champ du DBState client (camelCase) -> table SQLite.
//   Utilisé par extractChanges (client) détectent les changements à pousser.
// - EMBEDDED_CHILDREN : enfants embarqués dans un parent (sales.items ->
//   sale_items, loan.repayments -> repayments, …) ; le serveur les éclate pour
//   journaliser les lignes enfants dans le changelog (sans quoi la vente part
//   au trésor mais JAMAIS ses articles/remboursements).
//
// Règle : toute table synchronisée vers Supabase (TABLE_MAPPINGS côté serveur)
// doit avoir SON champ client ici si elle est portée par le DBState client,
// sinon elle n'est poussée ni par le delta client (/api/sync/push) ni par le
// full-state (POST /api/sync).

export const CLIENT_FIELD_TO_TABLE: Record<string, string> = {
  tenants: 'tenants', users: 'users', products: 'products', customers: 'customers',
  suppliers: 'suppliers', expenses: 'expenses', loans: 'loans',
  warehouses: 'warehouses', transfers: 'stock_transfers',
  auditLogs: 'audit_logs', subscriptionInvoices: 'subscription_invoices',
  variants: 'product_variants', subscriptionPayments: 'subscription_payments',
  pricingPlans: 'pricing_plans',
  invoices: 'invoices', deliveryOrders: 'delivery_orders',
  payments: 'payments', returns: 'returns',
  affiliates: 'affiliates', commissionRules: 'commission_rules',
  commissionLedger: 'commission_ledger', commissionPayments: 'commission_payments',
  commissionAudit: 'commission_audit', invoiceAuditLogs: 'invoice_audit_log',
  deliveryNoteAudit: 'delivery_note_audit',
  gdriveTokens: 'gdrive_tokens',
  // ✔ P1 : les ventes POS sont portées par le client (DBState.sales) et
  // devaient être poussées — elles étaient TOTALEMENT absentes du mapping.
  sales: 'sales',
  // ✔ P2 : modules SaaS + audit BL (champs présents dans DBState).
  moduleDefinitions: 'module_definitions',
  planModules: 'plan_modules',
  tenantModules: 'tenant_modules',
};

export const TABLE_TO_CLIENT_FIELD: Record<string, string> = Object.fromEntries(
  Object.entries(CLIENT_FIELD_TO_TABLE).map(([field, table]) => [table, field]),
);

// Champs tableaux du DBState à diffuser dans extractChanges (delta client).
export const CLIENT_ARRAY_FIELDS = Object.keys(CLIENT_FIELD_TO_TABLE);

export interface EmbeddedChildDef {
  childTable: string;
  field: string;
  parentColumn: string;
  idKey?: string;
}

// Enfants embarqués dans le record parent côté client. Le serveur éclate ces
// enfants en changes séparés (CREATE/UPDATE) pour alimenter les tables children
// (sinon sales.items serait perdu : sales n'a pas de colonne `items`).
export const EMBEDDED_CHILDREN: Record<string, EmbeddedChildDef[]> = {
  products: [{ childTable: 'product_variants', field: 'variants', parentColumn: 'productId' }],
  loans: [
    { childTable: 'repayments', field: 'repayments', parentColumn: 'loanId' },
    { childTable: 'loan_installments', field: 'installments', parentColumn: 'loanId' },
  ],
  sales: [{ childTable: 'sale_items', field: 'items', parentColumn: 'saleId' }],
  invoices: [{ childTable: 'invoice_items', field: 'items', parentColumn: 'invoiceId' }],
  delivery_orders: [{ childTable: 'delivery_order_items', field: 'items', parentColumn: 'deliveryOrderId' }],
  returns: [{ childTable: 'return_items', field: 'items', parentColumn: 'returnId' }],
};

// Retourne l'ID stable d'un enfant : préfère l'id existant du client (items
// re-pullés), sinon un id déterministe (`parentId-item-<index>`) — stable entre
// retries tant que l'ordre des enfants ne change pas.
export function resolveChildId(parentId: string, childRow: any, index: number): string {
  return childRow?.id || `${parentId}-item-${index}`;
}