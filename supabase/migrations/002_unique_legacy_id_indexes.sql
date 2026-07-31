-- ============================================================================
-- NexaStock SaaS - Unique legacy_id indexes for SQLite/Supabase sync
-- Date: 2026-07-29 (corrigé 2026-07-31, v3)
-- Purpose: Required by upsert(..., onConflict: 'legacy_id') in the sync service.
-- NB1: Un index UNIQUE simple suffit : PostgreSQL autorise plusieurs NULL dans
--      une colonne avec index unique, pas besoin de WHERE legacy_id IS NOT NULL.
-- NB2: Un index PARTIEL (WHERE ...) ne peut PAS servir d'arbitre ON CONFLICT
--      (le WHERE de l'INSERT devrait impliquer le prédicat) => erreur 42P10.
-- NB3: Les tables suivantes n'ont PAS de colonne legacy_id dans PostgreSQL et
--      sont donc exclues (elles utilisent leur clé naturelle):
--      global_saas_settings (id), gdrive_tokens (tenant_id),
--      module_definitions (key), tenant_modules (id)
-- NB4: Idempotent : supprime puis recrée les index (utile si la version avec
--      WHERE a déjà été exécutée).
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
    'pricing_plans', 'roles', 'permissions', 'role_permissions', 'user_roles'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'legacy_id'
    ) THEN
      EXECUTE format('DROP INDEX IF EXISTS %I', 'idx_' || tbl || '_legacy_id_unique');
      EXECUTE format(
        'CREATE UNIQUE INDEX %I ON public.%I (legacy_id)',
        'idx_' || tbl || '_legacy_id_unique',
        tbl
      );
    END IF;
  END LOOP;
END $$;
