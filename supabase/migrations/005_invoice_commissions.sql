-- ============================================================================
-- 005 : Commissions sur Factures (miroir du flux vente sale_affiliates/)
-- Permet d'associer un rapporteur d'affaires (apporteur) à une facture et de
-- gérer sa commission côté vente (échéancier, paiement groupé, recherche).
-- ============================================================================

-- 4.8 Invoice Affiliates (V2)
CREATE TABLE IF NOT EXISTS public.invoice_affiliates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE RESTRICT,
  affiliate_name TEXT NOT NULL,
  total_commission NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance_due NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_schedule TEXT NOT NULL DEFAULT 'immediate',
  payment_due_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Audit
  company_id UUID,
  created_by UUID,
  updated_by UUID,
  deleted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT DEFAULT 'synced',
  device_id TEXT
);

DROP TRIGGER IF EXISTS set_invoice_affiliates_updated_at ON public.invoice_affiliates;
CREATE TRIGGER set_invoice_affiliates_updated_at BEFORE UPDATE ON public.invoice_affiliates
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_with_version();
DROP TRIGGER IF EXISTS set_invoice_affiliates_created_at ON public.invoice_affiliates;
CREATE TRIGGER set_invoice_affiliates_created_at BEFORE INSERT ON public.invoice_affiliates
  FOR EACH ROW EXECUTE FUNCTION trigger_set_created_at();

-- 4.9 Invoice Commission Items (V2)
CREATE TABLE IF NOT EXISTS public.invoice_commission_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE RESTRICT,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  sell_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_per_unit NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_commission NUMERIC(12,2) NOT NULL DEFAULT 0,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Audit
  company_id UUID,
  created_by UUID,
  updated_by UUID,
  deleted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT DEFAULT 'synced',
  device_id TEXT
);

DROP TRIGGER IF EXISTS set_invoice_commission_items_updated_at ON public.invoice_commission_items;
CREATE TRIGGER set_invoice_commission_items_updated_at BEFORE UPDATE ON public.invoice_commission_items
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_with_version();
DROP TRIGGER IF EXISTS set_invoice_commission_items_created_at ON public.invoice_commission_items;
CREATE TRIGGER set_invoice_commission_items_created_at BEFORE INSERT ON public.invoice_commission_items
  FOR EACH ROW EXECUTE FUNCTION trigger_set_created_at();

-- Référence croisée : commission_payments peut référencer une facture.
-- (ALTER IF NOT EXISTS : Postgres 9.6+ grâce à récurrence PostgreSQL 15.)
ALTER TABLE public.commission_payments ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_affiliates_invoice ON public.invoice_affiliates(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_affiliates_affiliate ON public.invoice_affiliates(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_invoice_affiliates_tenant ON public.invoice_affiliates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoice_commission_items_invoice ON public.invoice_commission_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_commission_items_affiliate ON public.invoice_commission_items(affiliate_id);