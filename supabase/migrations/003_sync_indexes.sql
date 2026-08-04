-- ============================================================================
-- NexaStock SaaS - Index composés pour la pagination par curseur du pull sync
-- Date: 2026-08-04
-- Purpose: La pagination descendante (Supabase -> SQLite) utilise un curseur
--          keyset (updated_at, id) afin de ne JAMAIS sauter de records quand
--          plusieurs lignes partagent le même updated_at (trigger NOW()).
--          Ces index composés rendent le ORDER BY updated_at, id indexé.
-- NB: Guards information_schema : idempotent et sûr même si une table ne
--     possède pas la colonne concernée.
-- ============================================================================

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'tenants', 'users', 'products', 'customers', 'suppliers', 'warehouses',
    'product_variants', 'sales', 'sale_items', 'expenses', 'loans',
    'repayments', 'loan_installments', 'stock_transfers', 'invoices',
    'invoice_items', 'delivery_orders', 'delivery_order_items', 'payments',
    'returns', 'return_items', 'affiliates', 'commission_rules',
    'commission_ledger', 'commission_payments', 'sale_affiliates',
    'sale_commission_items', 'delivery_note_audit', 'subscription_invoices',
    'subscription_payments', 'pricing_plans', 'roles', 'plan_modules',
    'tenant_modules', 'gdrive_tokens', 'global_saas_settings'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'updated_at'
    ) THEN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON public.%I (updated_at, id)',
        'idx_' || tbl || '_updated_id', tbl
      );
    END IF;
  END LOOP;

  FOREACH tbl IN ARRAY ARRAY[
    'permissions', 'role_permissions', 'user_roles', 'module_definitions',
    'invoice_audit_log', 'commission_audit', 'audit_logs'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'created_at'
    ) THEN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON public.%I (created_at, id)',
        'idx_' || tbl || '_created_id', tbl
      );
    END IF;
  END LOOP;
END $$;
