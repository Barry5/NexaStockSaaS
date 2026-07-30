-- ============================================================================
-- NexaStock SaaS - Unique legacy_id indexes for SQLite/Supabase sync
-- Date: 2026-07-29
-- Purpose: Required by upsert(..., onConflict: 'legacy_id') in the sync service.
-- ============================================================================

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'tenants', 'users', 'products', 'product_variants', 'customers', 'suppliers',
    'sales', 'sale_items', 'expenses', 'loans', 'repayments', 'loan_installments',
    'warehouses', 'stock_transfers', 'invoices', 'invoice_items',
    'delivery_orders', 'delivery_order_items', 'payments', 'returns', 'return_items',
    'invoice_audit_log', 'affiliates', 'commission_rules', 'commission_ledger',
    'commission_payments', 'commission_audit', 'sale_affiliates', 'sale_commission_items',
    'audit_logs', 'delivery_note_audit', 'subscription_invoices', 'subscription_payments',
    'pricing_plans', 'global_saas_settings', 'gdrive_tokens', 'roles', 'permissions',
    'role_permissions', 'user_roles', 'module_definitions', 'tenant_modules'
  ]
  LOOP
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (legacy_id) WHERE legacy_id IS NOT NULL',
      'idx_' || tbl || '_legacy_id_unique',
      tbl
    );
  END LOOP;
END $$;