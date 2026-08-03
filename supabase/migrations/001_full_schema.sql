-- ============================================================================
-- NexaStock SaaS - Migration Complète vers PostgreSQL / Supabase
-- Version: 1.0.0
-- Date: 2026-07-27
-- Description: Schema complet avec UUID, audit columns, RLS, triggers
-- ============================================================================

-- ============================================================================
-- PARTIE 0 : EXTENSIONS ET FONCTIONS UTILITAIRES
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Met à jour automatiquement updated_at
CREATE OR REPLACE FUNCTION trigger_set_updated_at_with_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Met à jour automatiquement updated_at pour les tables SANS colonne version
CREATE OR REPLACE FUNCTION trigger_set_updated_at_without_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Met updated_at et version sur INSERT
CREATE OR REPLACE FUNCTION trigger_set_created_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.created_at = COALESCE(NEW.created_at, NOW());
  NEW.updated_at = NOW();
  NEW.version = 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Soft delete : met deleted_at au lieu de supprimer
CREATE OR REPLACE FUNCTION trigger_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
  NEW.deleted_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Vérifie que l'utilisateur a accès au company_id
CREATE OR REPLACE FUNCTION current_company_id()
RETURNS UUID AS $$
BEGIN
  RETURN NULLIF(current_setting('app.company_id', TRUE), '')::UUID;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- PARTIE 1 : TABLES PRINCIPALES (Core)
-- ============================================================================

-- 1.1 Tenants (entreprises/client)
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  plan TEXT NOT NULL DEFAULT 'Free',
  logo TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  city TEXT,
  country TEXT,
  currency TEXT NOT NULL DEFAULT 'EUR',
  tax_rate NUMERIC(10,2) DEFAULT 20.0,
  custom_categories JSONB DEFAULT '[]'::JSONB,
  invoice_prefix TEXT DEFAULT 'FAC-',
  invoice_footer_msg TEXT DEFAULT 'MERCI DE VOTRE CONFIANCE !',
  invoice_sub_footer_msg TEXT DEFAULT 'NexaStock ERP Multi-tenant - Document officiel au format PDF',
  default_extra_fee_label TEXT DEFAULT 'Frais de transport',
  subscription_plan_id TEXT,
  subscription_status TEXT DEFAULT 'TRIAL',
  subscription_start_date TIMESTAMPTZ,
  subscription_end_date TIMESTAMPTZ,
  subscription_renewal_date TIMESTAMPTZ,
  trial_start_date TIMESTAMPTZ,
  trial_end_date TIMESTAMPTZ,
  grace_period_end_date TIMESTAMPTZ,
  last_reminder_sent_date TIMESTAMPTZ,
  trial_days_configured INTEGER DEFAULT 14,
  -- Audit columns
  company_id UUID,
  created_by UUID,
  updated_by UUID,
  deleted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT DEFAULT 'synced' CHECK (sync_status IN ('pending', 'synced', 'conflict', 'failed')),
  device_id TEXT
);

COMMENT ON TABLE public.tenants IS 'Entreprises/client abonnées à la plateforme NexaStock';
COMMENT ON COLUMN public.tenants.legacy_id IS 'Ancien ID TEXT de la base SQLite pour compatibilité';

-- Trigger
DROP TRIGGER IF EXISTS set_tenants_updated_at ON public.tenants;
CREATE TRIGGER set_tenants_updated_at BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_with_version();
DROP TRIGGER IF EXISTS set_tenants_created_at ON public.tenants;
CREATE TRIGGER set_tenants_created_at BEFORE INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION trigger_set_created_at();


-- 1.2 Users
CREATE TABLE IF NOT EXISTS public.users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'vendeur',
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  avatar TEXT,
  password TEXT,
  first_login_reset BOOLEAN DEFAULT FALSE,
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
  device_id TEXT,
  -- Contraintes,
  UNIQUE(email)
);

DROP TRIGGER IF EXISTS set_users_updated_at ON public.users;
CREATE TRIGGER set_users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_with_version();
DROP TRIGGER IF EXISTS set_users_created_at ON public.users;
CREATE TRIGGER set_users_created_at BEFORE INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION trigger_set_created_at();


-- 1.3 Products
CREATE TABLE IF NOT EXISTS public.products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  barcode TEXT,
  description TEXT,
  category TEXT NOT NULL,
  buy_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  sell_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  min_price NUMERIC(12,2) DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 0,
  alert_threshold INTEGER NOT NULL DEFAULT 5,
  image TEXT,
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

DROP TRIGGER IF EXISTS set_products_updated_at ON public.products;
CREATE TRIGGER set_products_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_with_version();
DROP TRIGGER IF EXISTS set_products_created_at ON public.products;
CREATE TRIGGER set_products_created_at BEFORE INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION trigger_set_created_at();


-- 1.4 Customers
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  loyalty_points INTEGER NOT NULL DEFAULT 0,
  outstanding_debt NUMERIC(12,2) NOT NULL DEFAULT 0.0,
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

DROP TRIGGER IF EXISTS set_customers_updated_at ON public.customers;
CREATE TRIGGER set_customers_updated_at BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_with_version();
DROP TRIGGER IF EXISTS set_customers_created_at ON public.customers;
CREATE TRIGGER set_customers_created_at BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION trigger_set_created_at();


-- 1.5 Suppliers
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
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

DROP TRIGGER IF EXISTS set_suppliers_updated_at ON public.suppliers;
CREATE TRIGGER set_suppliers_updated_at BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_with_version();
DROP TRIGGER IF EXISTS set_suppliers_created_at ON public.suppliers;
CREATE TRIGGER set_suppliers_created_at BEFORE INSERT ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION trigger_set_created_at();


-- 1.6 Warehouses
CREATE TABLE IF NOT EXISTS public.warehouses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  name TEXT NOT NULL,
  location TEXT,
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

DROP TRIGGER IF EXISTS set_warehouses_updated_at ON public.warehouses;
CREATE TRIGGER set_warehouses_updated_at BEFORE UPDATE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_with_version();
DROP TRIGGER IF EXISTS set_warehouses_created_at ON public.warehouses;
CREATE TRIGGER set_warehouses_created_at BEFORE INSERT ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION trigger_set_created_at();


-- 1.7 Product Variants
CREATE TABLE IF NOT EXISTS public.product_variants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  price_delta NUMERIC(12,2) NOT NULL DEFAULT 0.0,
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

DROP TRIGGER IF EXISTS set_product_variants_updated_at ON public.product_variants;
CREATE TRIGGER set_product_variants_updated_at BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_with_version();
DROP TRIGGER IF EXISTS set_product_variants_created_at ON public.product_variants;
CREATE TRIGGER set_product_variants_created_at BEFORE INSERT ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION trigger_set_created_at();


-- ============================================================================
-- PARTIE 2 : VENTES ET TRANSACTIONS
-- ============================================================================

-- 2.1 Sales
CREATE TABLE IF NOT EXISTS public.sales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  invoice_number TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  subtotal NUMERIC(12,2) NOT NULL,
  tax NUMERIC(12,2) NOT NULL,
  tax_rate NUMERIC(5,2) DEFAULT 20.0,
  discount NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) NOT NULL,
  payment_method TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id TEXT,
  employee_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Payée',
  credit_due_date TIMESTAMPTZ,
  credit_paid_amount NUMERIC(12,2) DEFAULT 0,
  credit_installments JSONB DEFAULT '{}'::JSONB,
  extra_fees NUMERIC(12,2) DEFAULT 0,
  delivery_fee NUMERIC(12,2) DEFAULT 0,
  tax_stamp NUMERIC(12,2) DEFAULT 0,
  change_returned NUMERIC(12,2) DEFAULT 0,
  sale_type TEXT DEFAULT 'standard',
  is_returned BOOLEAN DEFAULT FALSE,
  custom_fee_label TEXT,
  delivery_status TEXT DEFAULT 'livré',
  abandon_reason TEXT,
  invoice_status TEXT DEFAULT 'Validée',
  payment_status TEXT DEFAULT 'Payé',
  credit_status TEXT DEFAULT 'Pas de crédit',
  payments JSONB DEFAULT '[]'::JSONB,
  returns_json JSONB DEFAULT '[]'::JSONB,
  credit_comments JSONB DEFAULT '[]'::JSONB,
  credit_relances INTEGER DEFAULT 0,
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

DROP TRIGGER IF EXISTS set_sales_updated_at ON public.sales;
CREATE TRIGGER set_sales_updated_at BEFORE UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_with_version();
DROP TRIGGER IF EXISTS set_sales_created_at ON public.sales;
CREATE TRIGGER set_sales_created_at BEFORE INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION trigger_set_created_at();


-- 2.2 Sale Items
CREATE TABLE IF NOT EXISTS public.sale_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price NUMERIC(12,2) NOT NULL,
  total NUMERIC(12,2) NOT NULL,
  qty_delivered INTEGER DEFAULT 0,
  qty_returned INTEGER DEFAULT 0,
  commission_per_unit NUMERIC(12,2) DEFAULT 0,
  total_commission NUMERIC(12,2) DEFAULT 0,
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

DROP TRIGGER IF EXISTS set_sale_items_updated_at ON public.sale_items;
CREATE TRIGGER set_sale_items_updated_at BEFORE UPDATE ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_with_version();
DROP TRIGGER IF EXISTS set_sale_items_created_at ON public.sale_items;
CREATE TRIGGER set_sale_items_created_at BEFORE INSERT ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION trigger_set_created_at();


-- 2.3 Expenses
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  title TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  category TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  description TEXT,
  recipient TEXT,
  payment_method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'en_attente',
  attachment TEXT,
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

DROP TRIGGER IF EXISTS set_expenses_updated_at ON public.expenses;
CREATE TRIGGER set_expenses_updated_at BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_with_version();
DROP TRIGGER IF EXISTS set_expenses_created_at ON public.expenses;
CREATE TRIGGER set_expenses_created_at BEFORE INSERT ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION trigger_set_created_at();


-- 2.4 Loans
CREATE TABLE IF NOT EXISTS public.loans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('entrant', 'sortant')),
  partner_name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  description TEXT,
  remaining_balance NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'actif',
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

DROP TRIGGER IF EXISTS set_loans_updated_at ON public.loans;
CREATE TRIGGER set_loans_updated_at BEFORE UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_with_version();
DROP TRIGGER IF EXISTS set_loans_created_at ON public.loans;
CREATE TRIGGER set_loans_created_at BEFORE INSERT ON public.loans
  FOR EACH ROW EXECUTE FUNCTION trigger_set_created_at();


-- 2.5 Repayments
CREATE TABLE IF NOT EXISTS public.repayments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  note TEXT,
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

DROP TRIGGER IF EXISTS set_repayments_updated_at ON public.repayments;
CREATE TRIGGER set_repayments_updated_at BEFORE UPDATE ON public.repayments
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_with_version();
DROP TRIGGER IF EXISTS set_repayments_created_at ON public.repayments;
CREATE TRIGGER set_repayments_created_at BEFORE INSERT ON public.repayments
  FOR EACH ROW EXECUTE FUNCTION trigger_set_created_at();


-- 2.6 Loan Installments
CREATE TABLE IF NOT EXISTS public.loan_installments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  due_date TIMESTAMPTZ NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'en_attente' CHECK (status IN ('en_attente', 'paye')),
  paid_date TIMESTAMPTZ,
  note TEXT,
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

DROP TRIGGER IF EXISTS set_loan_installments_updated_at ON public.loan_installments;
CREATE TRIGGER set_loan_installments_updated_at BEFORE UPDATE ON public.loan_installments
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_with_version();
DROP TRIGGER IF EXISTS set_loan_installments_created_at ON public.loan_installments;
CREATE TRIGGER set_loan_installments_created_at BEFORE INSERT ON public.loan_installments
  FOR EACH ROW EXECUTE FUNCTION trigger_set_created_at();


-- 2.7 Stock Transfers
CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  from_warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  to_warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'en_cours',
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

DROP TRIGGER IF EXISTS set_stock_transfers_updated_at ON public.stock_transfers;
CREATE TRIGGER set_stock_transfers_updated_at BEFORE UPDATE ON public.stock_transfers
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_with_version();
DROP TRIGGER IF EXISTS set_stock_transfers_created_at ON public.stock_transfers;
CREATE TRIGGER set_stock_transfers_created_at BEFORE INSERT ON public.stock_transfers
  FOR EACH ROW EXECUTE FUNCTION trigger_set_created_at();


-- ============================================================================
-- PARTIE 3 : FACTURATION (ERP)
-- ============================================================================

-- 3.1 Invoices
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  invoice_number TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'sale' CHECK (type IN ('sale', 'purchase', 'credit_note', 'debit_note')),
  date TIMESTAMPTZ NOT NULL,
  due_date TIMESTAMPTZ,
  customer_id TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  customer_address TEXT,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_type TEXT NOT NULL DEFAULT 'percentage',
  shipping NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  delivery_status TEXT NOT NULL DEFAULT 'not_delivered',
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  notes TEXT,
  terms_conditions TEXT,
  employee_id TEXT,
  employee_name TEXT,
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

DROP TRIGGER IF EXISTS set_invoices_updated_at ON public.invoices;
CREATE TRIGGER set_invoices_updated_at BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_with_version();
DROP TRIGGER IF EXISTS set_invoices_created_at ON public.invoices;
CREATE TRIGGER set_invoices_created_at BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION trigger_set_created_at();


-- 3.2 Invoice Items
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  product_id TEXT,
  product_name TEXT NOT NULL,
  product_sku TEXT,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  qty_delivered NUMERIC(12,2) NOT NULL DEFAULT 0,
  qty_returned NUMERIC(12,2) NOT NULL DEFAULT 0,
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

DROP TRIGGER IF EXISTS set_invoice_items_updated_at ON public.invoice_items;
CREATE TRIGGER set_invoice_items_updated_at BEFORE UPDATE ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_with_version();
DROP TRIGGER IF EXISTS set_invoice_items_created_at ON public.invoice_items;
CREATE TRIGGER set_invoice_items_created_at BEFORE INSERT ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION trigger_set_created_at();


-- 3.3 Delivery Orders
CREATE TABLE IF NOT EXISTS public.delivery_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  delivery_number TEXT NOT NULL,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE,
  date TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_by TEXT,
  created_by_name TEXT,
  validated_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  driver_name TEXT,
  vehicle_info TEXT,
  warehouse_origin TEXT,
  delivery_address TEXT,
  delivery_phone TEXT,
  delivery_date TIMESTAMPTZ,
  delivery_time TEXT,
  customer_signature TEXT,
  driver_signature TEXT,
  company_stamp TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT,
  updated_by_name TEXT,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Audit
  company_id UUID,
  deleted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'synced',
  device_id TEXT,
  version INTEGER NOT NULL DEFAULT 1
);

DROP TRIGGER IF EXISTS set_delivery_orders_created_at ON public.delivery_orders;
CREATE TRIGGER set_delivery_orders_created_at BEFORE INSERT ON public.delivery_orders
  FOR EACH ROW EXECUTE FUNCTION trigger_set_created_at();

DROP TRIGGER IF EXISTS set_delivery_orders_updated_at ON public.delivery_orders;
CREATE TRIGGER set_delivery_orders_updated_at BEFORE UPDATE ON public.delivery_orders
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_with_version();

-- 3.4 Delivery Order Items
CREATE TABLE IF NOT EXISTS public.delivery_order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  delivery_order_id UUID NOT NULL REFERENCES public.delivery_orders(id) ON DELETE CASCADE,
  invoice_item_id UUID NOT NULL REFERENCES public.invoice_items(id) ON DELETE CASCADE,
  product_id TEXT,
  product_name TEXT NOT NULL,
  product_sku TEXT,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
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

DROP TRIGGER IF EXISTS set_delivery_order_items_updated_at ON public.delivery_order_items;
CREATE TRIGGER set_delivery_order_items_updated_at BEFORE UPDATE ON public.delivery_order_items
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_with_version();
DROP TRIGGER IF EXISTS set_delivery_order_items_created_at ON public.delivery_order_items;
CREATE TRIGGER set_delivery_order_items_created_at BEFORE INSERT ON public.delivery_order_items
  FOR EACH ROW EXECUTE FUNCTION trigger_set_created_at();


-- 3.5 Payments
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  date TIMESTAMPTZ NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  method TEXT NOT NULL,
  reference TEXT,
  notes TEXT,
  created_by TEXT,
  created_by_name TEXT,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Audit
  company_id UUID,
  deleted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT DEFAULT 'synced',
  device_id TEXT
);

DROP TRIGGER IF EXISTS set_payments_updated_at ON public.payments;
CREATE TRIGGER set_payments_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_with_version();
DROP TRIGGER IF EXISTS set_payments_created_at ON public.payments;
CREATE TRIGGER set_payments_created_at BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION trigger_set_created_at();


-- 3.6 Returns
CREATE TABLE IF NOT EXISTS public.returns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  return_number TEXT NOT NULL,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  date TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  reason TEXT,
  created_by TEXT,
  created_by_name TEXT,
  validated_at TIMESTAMPTZ,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Audit
  company_id UUID,
  deleted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT DEFAULT 'synced',
  device_id TEXT
);

DROP TRIGGER IF EXISTS set_returns_updated_at ON public.returns;
CREATE TRIGGER set_returns_updated_at BEFORE UPDATE ON public.returns
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_with_version();
DROP TRIGGER IF EXISTS set_returns_created_at ON public.returns;
CREATE TRIGGER set_returns_created_at BEFORE INSERT ON public.returns
  FOR EACH ROW EXECUTE FUNCTION trigger_set_created_at();


-- 3.7 Return Items
CREATE TABLE IF NOT EXISTS public.return_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  return_id UUID NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
  invoice_item_id UUID NOT NULL REFERENCES public.invoice_items(id) ON DELETE CASCADE,
  product_id TEXT,
  product_name TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  reason TEXT,
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

DROP TRIGGER IF EXISTS set_return_items_updated_at ON public.return_items;
CREATE TRIGGER set_return_items_updated_at BEFORE UPDATE ON public.return_items
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_with_version();
DROP TRIGGER IF EXISTS set_return_items_created_at ON public.return_items;
CREATE TRIGGER set_return_items_created_at BEFORE INSERT ON public.return_items
  FOR EACH ROW EXECUTE FUNCTION trigger_set_created_at();


-- 3.8 Invoice Audit Log
CREATE TABLE IF NOT EXISTS public.invoice_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details TEXT,
  user_id TEXT,
  user_name TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Audit
  company_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- PARTIE 4 : COMMISSIONS
-- ============================================================================

-- 4.1 Affiliates
CREATE TABLE IF NOT EXISTS public.affiliates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  code TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  photo TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  country TEXT DEFAULT 'Guinée',
  company TEXT,
  id_number TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  commission_rules JSONB DEFAULT '{}'::JSONB,
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

DROP TRIGGER IF EXISTS set_affiliates_updated_at ON public.affiliates;
CREATE TRIGGER set_affiliates_updated_at BEFORE UPDATE ON public.affiliates
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_with_version();
DROP TRIGGER IF EXISTS set_affiliates_created_at ON public.affiliates;
CREATE TRIGGER set_affiliates_created_at BEFORE INSERT ON public.affiliates
  FOR EACH ROW EXECUTE FUNCTION trigger_set_created_at();


-- 4.2 Commission Rules
CREATE TABLE IF NOT EXISTS public.commission_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  value NUMERIC(12,2) NOT NULL DEFAULT 0,
  min_value NUMERIC(12,2),
  max_value NUMERIC(12,2),
  product_id TEXT,
  category TEXT,
  client_id TEXT,
  affiliate_id UUID REFERENCES public.affiliates(id) ON DELETE CASCADE,
  campaign TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
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

DROP TRIGGER IF EXISTS set_commission_rules_updated_at ON public.commission_rules;
CREATE TRIGGER set_commission_rules_updated_at BEFORE UPDATE ON public.commission_rules
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_with_version();
DROP TRIGGER IF EXISTS set_commission_rules_created_at ON public.commission_rules;
CREATE TRIGGER set_commission_rules_created_at BEFORE INSERT ON public.commission_rules
  FOR EACH ROW EXECUTE FUNCTION trigger_set_created_at();


-- 4.3 Commission Ledger
CREATE TABLE IF NOT EXISTS public.commission_ledger (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  reference TEXT,
  reference_type TEXT,
  description TEXT,
  credit NUMERIC(12,2) NOT NULL DEFAULT 0,
  debit NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  invoice_id TEXT,
  invoice_number TEXT,
  customer_name TEXT,
  product_name TEXT,
  quantity NUMERIC(12,2),
  sell_price NUMERIC(12,2),
  min_price NUMERIC(12,2),
  commission_amount NUMERIC(12,2),
  payment_id TEXT,
  user_id TEXT,
  user_name TEXT,
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

DROP TRIGGER IF EXISTS set_commission_ledger_updated_at ON public.commission_ledger;
CREATE TRIGGER set_commission_ledger_updated_at BEFORE UPDATE ON public.commission_ledger
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_with_version();
DROP TRIGGER IF EXISTS set_commission_ledger_created_at ON public.commission_ledger;
CREATE TRIGGER set_commission_ledger_created_at BEFORE INSERT ON public.commission_ledger
  FOR EACH ROW EXECUTE FUNCTION trigger_set_created_at();


-- 4.4 Commission Payments
CREATE TABLE IF NOT EXISTS public.commission_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  reference TEXT NOT NULL,
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  affiliate_name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  method TEXT NOT NULL DEFAULT 'cash',
  currency TEXT DEFAULT 'GNF',
  notes TEXT,
  ledger_ids JSONB DEFAULT '[]'::JSONB,
  user_id TEXT,
  user_name TEXT,
  sale_id TEXT,
  payment_date TIMESTAMPTZ,
  schedule TEXT DEFAULT 'immediate',
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

DROP TRIGGER IF EXISTS set_commission_payments_updated_at ON public.commission_payments;
CREATE TRIGGER set_commission_payments_updated_at BEFORE UPDATE ON public.commission_payments
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_with_version();
DROP TRIGGER IF EXISTS set_commission_payments_created_at ON public.commission_payments;
CREATE TRIGGER set_commission_payments_created_at BEFORE INSERT ON public.commission_payments
  FOR EACH ROW EXECUTE FUNCTION trigger_set_created_at();


-- 4.5 Commission Audit
CREATE TABLE IF NOT EXISTS public.commission_audit (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details TEXT,
  old_value TEXT,
  new_value TEXT,
  user_id TEXT,
  user_name TEXT,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Audit
  company_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- 4.6 Sale Affiliates (V2)
CREATE TABLE IF NOT EXISTS public.sale_affiliates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
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

DROP TRIGGER IF EXISTS set_sale_affiliates_updated_at ON public.sale_affiliates;
CREATE TRIGGER set_sale_affiliates_updated_at BEFORE UPDATE ON public.sale_affiliates
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_with_version();
DROP TRIGGER IF EXISTS set_sale_affiliates_created_at ON public.sale_affiliates;
CREATE TRIGGER set_sale_affiliates_created_at BEFORE INSERT ON public.sale_affiliates
  FOR EACH ROW EXECUTE FUNCTION trigger_set_created_at();


-- 4.7 Sale Commission Items (V2)
CREATE TABLE IF NOT EXISTS public.sale_commission_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
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

DROP TRIGGER IF EXISTS set_sale_commission_items_updated_at ON public.sale_commission_items;
CREATE TRIGGER set_sale_commission_items_updated_at BEFORE UPDATE ON public.sale_commission_items
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_with_version();
DROP TRIGGER IF EXISTS set_sale_commission_items_created_at ON public.sale_commission_items;
CREATE TRIGGER set_sale_commission_items_created_at BEFORE INSERT ON public.sale_commission_items
  FOR EACH ROW EXECUTE FUNCTION trigger_set_created_at();


-- ============================================================================
-- PARTIE 5 : AUDIT ET SÉCURITÉ
-- ============================================================================

-- 5.1 Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  ip_address TEXT,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Audit
  company_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5.2 Delivery Note Audit
CREATE TABLE IF NOT EXISTS public.delivery_note_audit (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  delivery_note_id UUID NOT NULL REFERENCES public.delivery_orders(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  description TEXT,
  user_id TEXT,
  user_name TEXT,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Audit
  company_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- PARTIE 6 : RBAC (Rôles et Permissions)
-- ============================================================================

-- 6.1 Roles
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
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
  device_id TEXT,
  UNIQUE(name, tenant_id)
);

DROP TRIGGER IF EXISTS set_roles_updated_at ON public.roles;
CREATE TRIGGER set_roles_updated_at BEFORE UPDATE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_with_version();
DROP TRIGGER IF EXISTS set_roles_created_at ON public.roles;
CREATE TRIGGER set_roles_created_at BEFORE INSERT ON public.roles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_created_at();


-- 6.2 Permissions
CREATE TABLE IF NOT EXISTS public.permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  key TEXT NOT NULL UNIQUE,
  module TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  -- Audit
  company_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- 6.3 Role Permissions
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  allowed BOOLEAN NOT NULL DEFAULT TRUE,
  -- Audit
  company_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(role_id, permission_id)
);


-- 6.4 User Roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  user_id TEXT NOT NULL,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  -- Audit
  company_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, role_id)
);


-- ============================================================================
-- PARTIE 7 : SAAS / MULTI-TENANT
-- ============================================================================

-- 7.1 Module Definitions
CREATE TABLE IF NOT EXISTS public.module_definitions (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  icon TEXT NOT NULL DEFAULT 'Package',
  is_core BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- 7.2 Plan Modules
CREATE TABLE IF NOT EXISTS public.plan_modules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id TEXT NOT NULL,
  module_key TEXT NOT NULL REFERENCES public.module_definitions(key),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(plan_id, module_key)
);


-- 7.3 Tenant Modules
CREATE TABLE IF NOT EXISTS public.tenant_modules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL REFERENCES public.module_definitions(key),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, module_key)
);


-- ============================================================================
-- PARTIE 8 : SAAS SETTINGS
-- ============================================================================

-- 8.1 Pricing Plans
CREATE TABLE IF NOT EXISTS public.pricing_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  duration_days INTEGER NOT NULL DEFAULT 30,
  features JSONB DEFAULT '[]'::JSONB,
  limits JSONB DEFAULT '{}'::JSONB,
  color TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_pricing_plans_updated_at ON public.pricing_plans;
CREATE TRIGGER set_pricing_plans_updated_at BEFORE UPDATE ON public.pricing_plans
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_without_version();


-- 8.2 Subscription Invoices
CREATE TABLE IF NOT EXISTS public.subscription_invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  invoice_number TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  plan TEXT NOT NULL,
  status TEXT NOT NULL,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Audit
  company_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_subscription_invoices_updated_at ON public.subscription_invoices;
CREATE TRIGGER set_subscription_invoices_updated_at BEFORE UPDATE ON public.subscription_invoices
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_without_version();


-- 8.3 Subscription Payments
CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  legacy_id TEXT,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_name TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  payment_method TEXT NOT NULL,
  reference TEXT NOT NULL,
  transaction_number TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  comment TEXT,
  receipt_image TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  admin_comment TEXT,
  -- Audit
  company_id UUID,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_subscription_payments_updated_at ON public.subscription_payments;
CREATE TRIGGER set_subscription_payments_updated_at BEFORE UPDATE ON public.subscription_payments
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_without_version();


-- 8.4 Global SaaS Settings (single row)
CREATE TABLE IF NOT EXISTS public.global_saas_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  trial_days INTEGER NOT NULL DEFAULT 14,
  grace_period_days INTEGER NOT NULL DEFAULT 5,
  revert_to_plan_on_expiry TEXT NOT NULL DEFAULT 'Free',
  orange_money_number TEXT,
  orange_money_name TEXT,
  mobile_money_number TEXT,
  mobile_money_name TEXT,
  bank_details TEXT,
  payment_instructions TEXT,
  automatic_activation BOOLEAN NOT NULL DEFAULT FALSE,
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);

DROP TRIGGER IF EXISTS set_global_saas_settings_updated_at ON public.global_saas_settings;
CREATE TRIGGER set_global_saas_settings_updated_at BEFORE UPDATE ON public.global_saas_settings
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_without_version();


-- 8.5 Google Drive Tokens
CREATE TABLE IF NOT EXISTS public.gdrive_tokens (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  tokens TEXT NOT NULL,
  email TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Audit
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_gdrive_tokens_updated_at ON public.gdrive_tokens;
CREATE TRIGGER set_gdrive_tokens_updated_at BEFORE UPDATE ON public.gdrive_tokens
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_without_version();


-- ============================================================================
-- PARTIE 9 : SYNCHRONISATION
-- ============================================================================

-- 9.1 Sync Queue (file de synchronisation)
CREATE TABLE IF NOT EXISTS public.sync_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('CREATE', 'UPDATE', 'DELETE')),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 5,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  device_id TEXT,
  company_id TEXT,
  last_error TEXT
);

COMMENT ON TABLE public.sync_queue IS 'File de synchronisation pour les opérations offline';


-- 9.2 Sync Tracking (suivi des dernières synchronisations)
CREATE TABLE IF NOT EXISTS public.sync_tracking (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name TEXT NOT NULL UNIQUE,
  last_sync_at TIMESTAMPTZ,
  last_sync_version INTEGER DEFAULT 0,
  device_id TEXT,
  company_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS set_sync_tracking_updated_at ON public.sync_tracking;
CREATE TRIGGER set_sync_tracking_updated_at BEFORE UPDATE ON public.sync_tracking
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at_without_version();


-- ============================================================================
-- PARTIE 10 : INDEX
-- ============================================================================

-- Index pour les clés étrangères et recherches fréquentes
CREATE INDEX IF NOT EXISTS idx_users_tenant ON public.users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_products_tenant ON public.products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_sales_tenant ON public.sales(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON public.sales(date);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_number ON public.sales(invoice_number);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON public.customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON public.suppliers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant ON public.expenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(date);
CREATE INDEX IF NOT EXISTS idx_loans_tenant ON public.loans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_warehouses_tenant ON public.warehouses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_tenant ON public.stock_transfers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_product ON public.stock_transfers(product_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON public.audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON public.invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_invoice ON public.delivery_orders(invoice_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_tenant ON public.delivery_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_delivery_order_items_delivery ON public.delivery_order_items(delivery_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_returns_invoice ON public.returns(invoice_id);
CREATE INDEX IF NOT EXISTS idx_return_items_return ON public.return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_invoice_audit_log_invoice ON public.invoice_audit_log(invoice_id);
CREATE INDEX IF NOT EXISTS idx_affiliates_tenant ON public.affiliates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_affiliates_code ON public.affiliates(code);
CREATE INDEX IF NOT EXISTS idx_commission_rules_tenant ON public.commission_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_affiliate ON public.commission_ledger(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_tenant ON public.commission_ledger(tenant_id);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_status ON public.commission_ledger(status);
CREATE INDEX IF NOT EXISTS idx_commission_payments_affiliate ON public.commission_payments(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_commission_payments_tenant ON public.commission_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_commission_audit_affiliate ON public.commission_audit(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_sale_affiliates_sale ON public.sale_affiliates(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_affiliates_affiliate ON public.sale_affiliates(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_sale_affiliates_tenant ON public.sale_affiliates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sale_commission_items_sale ON public.sale_commission_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_commission_items_affiliate ON public.sale_commission_items(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON public.role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission ON public.role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_permissions_module ON public.permissions(module);
CREATE INDEX IF NOT EXISTS idx_roles_tenant ON public.roles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_plan_modules_plan ON public.plan_modules(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_modules_module ON public.plan_modules(module_key);
CREATE INDEX IF NOT EXISTS idx_tenant_modules_tenant ON public.tenant_modules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_delivery_note_audit_note ON public.delivery_note_audit(delivery_note_id);
CREATE INDEX IF NOT EXISTS idx_delivery_note_audit_tenant ON public.delivery_note_audit(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON public.sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_sync_queue_table ON public.sync_queue(table_name);
CREATE INDEX IF NOT EXISTS idx_sync_queue_created ON public.sync_queue(created_at);

-- Index full-text search pour produits
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON public.products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm ON public.customers USING gin (name gin_trgm_ops);


-- ============================================================================
-- PARTIE 11 : ROW LEVEL SECURITY
-- ============================================================================

-- Active RLS sur toutes les tables métier
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_commission_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gdrive_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_note_audit ENABLE ROW LEVEL SECURITY;

-- Policies génériques pour l'isolation multi-tenant
-- Chaque utilisateur ne voit que les données de son entreprise

CREATE OR REPLACE FUNCTION public.authorize_tenant_access(record_tenant_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Super admin voit tout
  IF current_setting('app.user_role', TRUE) = 'superadmin' THEN
    RETURN TRUE;
  END IF;
  -- Utilisateur normal ne voit que son tenant
  RETURN record_tenant_id = current_company_id();
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Policy template pour les tables avec tenant_id
DO $$ DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'products', 'customers', 'suppliers', 'sales',
      'expenses', 'loans',
      'warehouses', 'stock_transfers', 'audit_logs',
      'invoices', 'delivery_orders',
      'payments', 'returns',
      'affiliates', 'commission_rules', 'commission_ledger', 'commission_payments',
      'commission_audit', 'sale_affiliates', 'sale_commission_items',
      'subscription_invoices', 'subscription_payments', 'gdrive_tokens',
      'delivery_note_audit', 'tenant_modules'
    ])
  LOOP
    EXECUTE format('
      DROP POLICY IF EXISTS tenant_isolation ON public.%I;
      CREATE POLICY tenant_isolation ON public.%I
        FOR ALL
        USING (public.authorize_tenant_access(tenant_id))
        WITH CHECK (public.authorize_tenant_access(tenant_id));
    ', tbl, tbl);
  END LOOP;
END $$;

-- Policies spéciales pour tenants (auto-reference)
DROP POLICY IF EXISTS tenant_isolation ON public.tenants;
CREATE POLICY tenant_isolation ON public.tenants
  FOR ALL
  USING (id = current_company_id() OR current_setting('app.user_role', TRUE) = 'superadmin');

-- Policies pour users (basé sur tenant_id)
DROP POLICY IF EXISTS tenant_isolation ON public.users;
CREATE POLICY tenant_isolation ON public.users
  FOR ALL
  USING (tenant_id = current_company_id() OR current_setting('app.user_role', TRUE) = 'superadmin');

-- Policies pour roles (basé sur tenant_id, null = global)
DROP POLICY IF EXISTS tenant_isolation ON public.roles;
CREATE POLICY tenant_isolation ON public.roles
  FOR ALL
  USING (tenant_id = current_company_id() OR tenant_id IS NULL OR current_setting('app.user_role', TRUE) = 'superadmin');


-- ============================================================================
-- PARTIE 12 : DONNÉES INITIALES (SEEDS)
-- ============================================================================

-- Insérer les paramètres SaaS par défaut
INSERT INTO public.global_saas_settings (id, trial_days, grace_period_days, revert_to_plan_on_expiry, automatic_activation)
VALUES (1, 14, 5, 'Free', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Insérer les modules
INSERT INTO public.module_definitions (key, label, description, icon, is_core, display_order) VALUES
  ('dashboard', 'Tableau de bord', 'Vue d''ensemble et indicateurs clés', 'LayoutDashboard', TRUE, 1),
  ('products', 'Produits & Stocks', 'Gestion du catalogue et des inventaires', 'Package', FALSE, 2),
  ('sales', 'Ventes & POS', 'Point de vente et encaissements', 'ShoppingBag', TRUE, 3),
  ('customers', 'Clients & Grossistes', 'Carnet d''adresses et relation client', 'Users', FALSE, 4),
  ('suppliers', 'Fournisseurs', 'Gestion des fournisseurs et approvisionnements', 'Truck', FALSE, 5),
  ('expenses', 'Dépenses & Prêts', 'Comptabilité et financements', 'Coins', FALSE, 6),
  ('loans', 'Prêts', 'Gestion des emprunts et prêts', 'ArrowRightLeft', FALSE, 7),
  ('invoices', 'Facturation ERP', 'Facturation et documents comptables', 'FileText', FALSE, 8),
  ('commissions', 'Commissions', 'Commissions des affiliés', 'Award', FALSE, 9),
  ('users', 'Gestion d''Équipe', 'Utilisateurs et permissions', 'Shield', FALSE, 10),
  ('settings', 'Paramètres', 'Configuration de la boutique', 'Settings', FALSE, 11),
  ('warehouses', 'Entrepôts', 'Gestion des dépôts et stockages', 'Building', FALSE, 12),
  ('reports', 'Rapports', 'Analyses et états financiers', 'BarChart3', FALSE, 13),
  ('ai', 'Réapprovisionnement IA', 'Prédictions et suggestions intelligentes', 'Sparkles', FALSE, 14),
  ('transfer', 'Transferts', 'Mouvements de stock entre entrepôts', 'ArrowUpDown', FALSE, 15)
ON CONFLICT (key) DO NOTHING;

-- Insérer les permissions (47 permissions)
INSERT INTO public.permissions (key, module, label, description) VALUES
  ('dashboard.view', 'dashboard', 'Voir le tableau de bord', 'Accès à la page d''accueil et aux indicateurs clés'),
  ('products.view', 'products', 'Voir les produits', 'Consulter le catalogue et les stocks'),
  ('products.create', 'products', 'Créer des produits', 'Ajouter de nouveaux articles au catalogue'),
  ('products.edit', 'products', 'Modifier des produits', 'Éditer les fiches produits existantes'),
  ('products.delete', 'products', 'Supprimer des produits', 'Retirer des articles du catalogue'),
  ('sales.view', 'sales', 'Voir les ventes', 'Consulter l''historique des ventes'),
  ('sales.create', 'sales', 'Créer des ventes (POS)', 'Effectuer des encaissements au point de vente'),
  ('sales.edit', 'sales', 'Modifier des ventes', 'Éditer les transactions existantes'),
  ('sales.delete', 'sales', 'Annuler des ventes', 'Supprimer ou annuler des transactions'),
  ('sales.refund', 'sales', 'Rembourser des ventes', 'Effectuer des remboursements et retours'),
  ('customers.view', 'customers', 'Voir les clients', 'Consulter le carnet d''adresses clients'),
  ('customers.create', 'customers', 'Créer des clients', 'Ajouter de nouveaux contacts'),
  ('customers.edit', 'customers', 'Modifier des clients', 'Éditer les fiches clients'),
  ('customers.delete', 'customers', 'Supprimer des clients', 'Retirer des fiches clients'),
  ('suppliers.view', 'suppliers', 'Voir les fournisseurs', 'Consulter la liste des fournisseurs'),
  ('suppliers.create', 'suppliers', 'Créer des fournisseurs', 'Ajouter de nouveaux fournisseurs'),
  ('suppliers.edit', 'suppliers', 'Modifier des fournisseurs', 'Éditer les fiches fournisseurs'),
  ('suppliers.delete', 'suppliers', 'Supprimer des fournisseurs', 'Retirer des fournisseurs'),
  ('expenses.view', 'expenses', 'Voir les dépenses', 'Consulter le registre des dépenses'),
  ('expenses.create', 'expenses', 'Créer des dépenses', 'Enregistrer des sorties d''argent'),
  ('expenses.edit', 'expenses', 'Modifier des dépenses', 'Éditer des écritures comptables'),
  ('expenses.delete', 'expenses', 'Supprimer des dépenses', 'Annuler des écritures de dépenses'),
  ('loans.view', 'loans', 'Voir les prêts', 'Consulter les dossiers de financement'),
  ('loans.create', 'loans', 'Créer des prêts', 'Enregistrer des emprunts ou prêts'),
  ('loans.edit', 'loans', 'Modifier des prêts', 'Éditer les dossiers de prêt'),
  ('loans.delete', 'loans', 'Supprimer des prêts', 'Clôturer des dossiers de financement'),
  ('invoices.view', 'invoices', 'Voir les factures', 'Consulter les documents comptables'),
  ('invoices.create', 'invoices', 'Créer des factures', 'Émettre des factures et devis'),
  ('invoices.edit', 'invoices', 'Modifier des factures', 'Éditer les documents existants'),
  ('invoices.delete', 'invoices', 'Supprimer des factures', 'Annuler des documents'),
  ('invoices.credit_note', 'invoices', 'Avoirs et notes de crédit', 'Émettre des avoirs et rectificatifs'),
  ('commissions.view', 'commissions', 'Voir les commissions', 'Consulter les rapports de commissions'),
  ('commissions.manage', 'commissions', 'Gérer les commissions', 'Configurer et valider les commissions'),
  ('users.view', 'users', 'Voir les utilisateurs', 'Consulter la liste de l''équipe'),
  ('users.create', 'users', 'Créer des utilisateurs', 'Ajouter des collaborateurs'),
  ('users.edit', 'users', 'Modifier des utilisateurs', 'Éditer les profils et rôles'),
  ('users.delete', 'users', 'Supprimer des utilisateurs', 'Révoquer des accès'),
  ('users.permissions', 'users', 'Gérer les permissions', 'Configurer les droits d''accès par rôle'),
  ('settings.view', 'settings', 'Voir les paramètres', 'Accéder à la page de configuration'),
  ('settings.edit', 'settings', 'Modifier les paramètres', 'Changer la configuration de la boutique'),
  ('warehouses.view', 'warehouses', 'Voir les entrepôts', 'Consulter la liste des dépôts'),
  ('warehouses.create', 'warehouses', 'Créer des entrepôts', 'Ajouter des lieux de stockage'),
  ('warehouses.edit', 'warehouses', 'Modifier des entrepôts', 'Éditer les fiches d''entrepôt'),
  ('warehouses.delete', 'warehouses', 'Supprimer des entrepôts', 'Retirer des lieux de stockage'),
  ('reports.view', 'reports', 'Voir les rapports', 'Accéder aux analyses et états financiers'),
  ('ai.view', 'ai', 'Voir l''IA', 'Accéder au module de réapprovisionnement IA'),
  ('ai.use', 'ai', 'Utiliser l''IA', 'Exécuter des prédictions et suggestions IA'),
  ('transfer.view', 'transfer', 'Voir les transferts', 'Consulter les mouvements de stock'),
  ('transfer.create', 'transfer', 'Créer des transferts', 'Déclencher des transferts entre entrepôts')
ON CONFLICT (key) DO NOTHING;

-- Insérer les rôles système
INSERT INTO public.roles (id, name, label, description, is_system, tenant_id) VALUES
  ('00000000-0000-0000-0000-000000000001', 'owner', 'Owner / Propriétaire', 'Accès complet absolu', TRUE, NULL),
  ('00000000-0000-0000-0000-000000000002', 'admin', 'Admin / Administrateur', 'Accès total à la boutique', TRUE, NULL),
  ('00000000-0000-0000-0000-000000000003', 'gerant', 'Gérant de Boutique', 'Accès opérationnel complet', TRUE, NULL),
  ('00000000-0000-0000-0000-000000000004', 'vendeur', 'Vendeur de Caisse', 'Limité au POS', TRUE, NULL),
  ('00000000-0000-0000-0000-000000000005', 'comptable', 'Comptable', 'Dédié aux finances', TRUE, NULL),
  ('00000000-0000-0000-0000-000000000006', 'stock_manager', 'Gestionnaire de Stock', 'Dédié à la logistique', TRUE, NULL),
  ('00000000-0000-0000-0000-000000000007', 'lecture_seule', 'Lecture Seule / Auditeur', 'Accès en visualisation pure', TRUE, NULL)
ON CONFLICT (id) DO NOTHING;

-- Assigner les permissions aux rôles (à faire dans une migration séparée ou via l'application)

-- ============================================================================
-- PARTIE 13 : FONCTIONS UTILITAIRES
-- ============================================================================

-- Fonction de synchronisation : récupère les enregistrements modifiés depuis une date
CREATE OR REPLACE FUNCTION public.get_changes_since(
  p_table_name TEXT,
  p_since TIMESTAMPTZ,
  p_limit INTEGER DEFAULT 100
)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  EXECUTE format('
    SELECT jsonb_agg(to_jsonb(t))
    FROM (SELECT * FROM %I WHERE updated_at > $1 ORDER BY updated_at LIMIT $2) t
  ', p_table_name) INTO result USING p_since, p_limit;
  RETURN COALESCE(result, '[]'::JSONB);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- Fonction pour insérer ou mettre à jour avec gestion de version
CREATE OR REPLACE FUNCTION public.upsert_with_version(
  p_table_name TEXT,
  p_data JSONB,
  p_id_field TEXT DEFAULT 'id'
)
RETURNS JSONB AS $$
DECLARE
  record_id TEXT;
  current_version INTEGER;
  new_version INTEGER;
BEGIN
  record_id := p_data->>p_id_field;

  EXECUTE format('SELECT version FROM %I WHERE id = $1::UUID FOR UPDATE', p_table_name)
    INTO current_version USING record_id;

  IF current_version IS NULL THEN
    new_version := 1;
  ELSE
    new_version := current_version + 1;
  END IF;

  p_data := jsonb_set(p_data, '{version}', to_jsonb(new_version));

  EXECUTE format('
    INSERT INTO %I SELECT * FROM jsonb_to_record($1) AS t(
      id UUID, legacy_id TEXT, name TEXT, sku TEXT, description TEXT,
      category TEXT, buy_price NUMERIC, sell_price NUMERIC, quantity INTEGER,
      tenant_id UUID, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
      version INTEGER, sync_status TEXT
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      sku = EXCLUDED.sku,
      updated_at = NOW(),
      version = EXCLUDED.version,
      sync_status = ''synced''
  ', p_table_name) USING p_data;

  RETURN p_data;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ============================================================================
-- FIN DU SCRIPT DE MIGRATION
-- ============================================================================
