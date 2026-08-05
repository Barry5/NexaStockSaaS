-- ============================================================================
-- NexaStock SaaS - Contraintes UNIQUE sur les numéros comptables (audit §2.5)
-- Date: 2026-08-05
-- Purpose: Les numéros de facture / BL / retour sont des références légales.
--          Aucune contrainte UNIQUE n'existait côté PG : deux documents du
--          même tenant pouvaient partager un numéro (COUNT+1 avec suppression
--          ou course multi-instance). Garantit l'unicité par tenant.
-- NB: Guards information_schema : idempotent, échoue proprement si la colonne
--     est absente (le numéroteur serveur local reste la source de vérité).
-- ============================================================================

DO $$
DECLARE
  tbl TEXT;
  col TEXT;
  idx TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['invoices', 'delivery_orders', 'returns']
  LOOP
    CASE tbl
      WHEN 'invoices' THEN col := 'invoice_number'; idx := 'idx_invoices_tenant_number';
      WHEN 'delivery_orders' THEN col := 'delivery_number'; idx := 'idx_delivery_orders_tenant_number';
      WHEN 'returns' THEN col := 'return_number'; idx := 'idx_returns_tenant_number';
    END CASE;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = col
    ) THEN
      EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (tenant_id, %I)', idx, tbl, col);
    END IF;
  END LOOP;
END $$;
