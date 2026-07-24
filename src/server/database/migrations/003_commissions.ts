import { Database } from 'better-sqlite3';

export function up(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS affiliates (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      firstName TEXT NOT NULL,
      lastName TEXT NOT NULL,
      photo TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      city TEXT,
      country TEXT DEFAULT 'Guinée',
      company TEXT,
      idNumber TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      commissionRules JSON,
      notes TEXT,
      tenantId TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_affiliates_tenant ON affiliates(tenantId);

    CREATE TABLE IF NOT EXISTS commission_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      value REAL NOT NULL DEFAULT 0,
      minValue REAL,
      maxValue REAL,
      productId TEXT,
      category TEXT,
      clientId TEXT,
      affiliateId TEXT,
      campaign TEXT,
      priority INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      tenantId TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_commission_rules_tenant ON commission_rules(tenantId);

    CREATE TABLE IF NOT EXISTS commission_ledger (
      id TEXT PRIMARY KEY,
      affiliateId TEXT NOT NULL,
      type TEXT NOT NULL,
      reference TEXT,
      referenceType TEXT,
      description TEXT,
      credit REAL NOT NULL DEFAULT 0,
      debit REAL NOT NULL DEFAULT 0,
      balance REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      invoiceId TEXT,
      invoiceNumber TEXT,
      customerName TEXT,
      productName TEXT,
      quantity REAL,
      sellPrice REAL,
      minPrice REAL,
      commissionAmount REAL,
      paymentId TEXT,
      userId TEXT,
      userName TEXT,
      tenantId TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (affiliateId) REFERENCES affiliates(id) ON DELETE CASCADE,
      FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_commission_ledger_affiliate ON commission_ledger(affiliateId);
    CREATE INDEX IF NOT EXISTS idx_commission_ledger_tenant ON commission_ledger(tenantId);
    CREATE INDEX IF NOT EXISTS idx_commission_ledger_status ON commission_ledger(status);

    CREATE TABLE IF NOT EXISTS commission_payments (
      id TEXT PRIMARY KEY,
      reference TEXT NOT NULL,
      affiliateId TEXT NOT NULL,
      affiliateName TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      method TEXT NOT NULL DEFAULT 'cash',
      currency TEXT DEFAULT 'GNF',
      notes TEXT,
      ledgerIds TEXT NOT NULL DEFAULT '[]',
      userId TEXT,
      userName TEXT,
      tenantId TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (affiliateId) REFERENCES affiliates(id) ON DELETE CASCADE,
      FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_commission_payments_affiliate ON commission_payments(affiliateId);
    CREATE INDEX IF NOT EXISTS idx_commission_payments_tenant ON commission_payments(tenantId);

    CREATE TABLE IF NOT EXISTS commission_audit (
      id TEXT PRIMARY KEY,
      affiliateId TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      oldValue TEXT,
      newValue TEXT,
      userId TEXT,
      userName TEXT,
      tenantId TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (affiliateId) REFERENCES affiliates(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_commission_audit_affiliate ON commission_audit(affiliateId);
  `);

  try { db.exec(`ALTER TABLE sync_tracking ADD COLUMN affiliates_last_sync TEXT`); } catch {}
  try { db.exec(`ALTER TABLE sync_tracking ADD COLUMN commission_rules_last_sync TEXT`); } catch {}
  try { db.exec(`ALTER TABLE sync_tracking ADD COLUMN commission_ledger_last_sync TEXT`); } catch {}
  try { db.exec(`ALTER TABLE sync_tracking ADD COLUMN commission_payments_last_sync TEXT`); } catch {}

  console.log('Migration 003_commissions applied: affiliates, commission_rules, commission_ledger, commission_payments, commission_audit tables created.');
}
