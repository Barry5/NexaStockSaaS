import { Database } from 'better-sqlite3';

const MAIN_TABLES = [
  'tenants', 'users', 'products', 'customers', 'suppliers', 'sales',
  'sale_items', 'expenses', 'loans', 'repayments', 'loan_installments',
  'warehouses', 'stock_transfers', 'audit_logs', 'subscription_invoices',
  'product_variants', 'subscription_payments', 'pricing_plans',
  'global_saas_settings', 'invoices', 'invoice_items', 'delivery_orders',
  'delivery_order_items', 'payments', 'returns', 'return_items',
  'invoice_audit_log', 'affiliates', 'commission_rules', 'commission_ledger',
  'commission_payments', 'commission_audit', 'sale_affiliates',
  'sale_commission_items', 'delivery_note_audit', 'gdrive_tokens',
  'roles', 'permissions', 'role_permissions', 'user_roles',
  'module_definitions', 'tenant_modules',
];

export function up(db: Database) {
  for (const table of MAIN_TABLES) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    const colNames = new Set(cols.map(c => c.name));

    if (!colNames.has('version')) {
      try { db.exec(`ALTER TABLE ${table} ADD COLUMN version INTEGER DEFAULT 1`); } catch {}
    }
    if (!colNames.has('updatedAt')) {
      try { db.exec(`ALTER TABLE ${table} ADD COLUMN updatedAt TEXT`); } catch {}
    }
    if (!colNames.has('createdAt')) {
      try { db.exec(`ALTER TABLE ${table} ADD COLUMN createdAt TEXT`); } catch {}
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_changelog (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      operation TEXT NOT NULL CHECK(operation IN ('CREATE','UPDATE','DELETE')),
      old_values TEXT,
      new_values TEXT,
      old_version INTEGER,
      new_version INTEGER,
      created_at TEXT NOT NULL,
      device_id TEXT,
      company_id TEXT,
      conflict_resolved INTEGER DEFAULT 0,
      pushed_to_supabase INTEGER DEFAULT 0
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_deletions (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      deleted_at TEXT NOT NULL,
      company_id TEXT,
      pushed_to_supabase INTEGER DEFAULT 0
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_changelog_table ON sync_changelog(table_name)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_changelog_created ON sync_changelog(created_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_changelog_pushed ON sync_changelog(pushed_to_supabase)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_changelog_record ON sync_changelog(table_name, record_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_deletions_table ON sync_deletions(table_name)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_deletions_deleted ON sync_deletions(deleted_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_deletions_pushed ON sync_deletions(pushed_to_supabase)`);

  console.log('Migration 010_sync_upgrade applied: version, updatedAt, sync_changelog, sync_deletions');
}
