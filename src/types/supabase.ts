export interface AuditColumns {
  company_id?: string;
  created_by?: string;
  updated_by?: string;
  deleted_by?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  version: number;
  sync_status: 'pending' | 'synced' | 'conflict' | 'failed';
  device_id?: string;
}

export interface LegacyCompatible {
  legacy_id?: string;
}

export type BaseEntity = AuditColumns & LegacyCompatible;

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

export interface TableMapping {
  sqliteName: string;
  pgName: string;
  columns: {
    sqlite: string;
    pg: string;
    type: 'uuid' | 'text' | 'numeric' | 'boolean' | 'jsonb' | 'timestamptz' | 'integer';
  }[];
}

export const SYNC_TABLE_MAPPINGS: Record<string, string> = {
  tenants: 'tenants',
  users: 'users',
  products: 'products',
  product_variants: 'product_variants',
  customers: 'customers',
  suppliers: 'suppliers',
  sales: 'sales',
  sale_items: 'sale_items',
  expenses: 'expenses',
  loans: 'loans',
  repayments: 'repayments',
  loan_installments: 'loan_installments',
  warehouses: 'warehouses',
  stock_transfers: 'stock_transfers',
  invoices: 'invoices',
  invoice_items: 'invoice_items',
  delivery_orders: 'delivery_orders',
  delivery_order_items: 'delivery_order_items',
  payments: 'payments',
  returns: 'returns',
  return_items: 'return_items',
  invoice_audit_log: 'invoice_audit_log',
  affiliates: 'affiliates',
  commission_rules: 'commission_rules',
  commission_ledger: 'commission_ledger',
  commission_payments: 'commission_payments',
  commission_audit: 'commission_audit',
  sale_affiliates: 'sale_affiliates',
  sale_commission_items: 'sale_commission_items',
  audit_logs: 'audit_logs',
  delivery_note_audit: 'delivery_note_audit',
  subscription_invoices: 'subscription_invoices',
  subscription_payments: 'subscription_payments',
  pricing_plans: 'pricing_plans',
  global_saas_settings: 'global_saas_settings',
  gdrive_tokens: 'gdrive_tokens',
  roles: 'roles',
  permissions: 'permissions',
  role_permissions: 'role_permissions',
  user_roles: 'user_roles',
  module_definitions: 'module_definitions',
};
