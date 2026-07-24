import { Database } from 'better-sqlite3';

export function up(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sale_affiliates (
      id TEXT PRIMARY KEY,
      saleId TEXT NOT NULL,
      affiliateId TEXT NOT NULL,
      affiliateName TEXT NOT NULL,
      totalCommission REAL NOT NULL DEFAULT 0,
      amountPaid REAL NOT NULL DEFAULT 0,
      balanceDue REAL NOT NULL DEFAULT 0,
      paymentSchedule TEXT NOT NULL DEFAULT 'immediate',
      paymentDueDate TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      notes TEXT,
      tenantId TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (saleId) REFERENCES sales(id) ON DELETE CASCADE,
      FOREIGN KEY (affiliateId) REFERENCES affiliates(id) ON DELETE RESTRICT,
      FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sale_commission_items (
      id TEXT PRIMARY KEY,
      saleId TEXT NOT NULL,
      affiliateId TEXT NOT NULL,
      productId TEXT,
      productName TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      sellPrice REAL NOT NULL DEFAULT 0,
      commissionPerUnit REAL NOT NULL DEFAULT 0,
      totalCommission REAL NOT NULL DEFAULT 0,
      tenantId TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (saleId) REFERENCES sales(id) ON DELETE CASCADE,
      FOREIGN KEY (productId) REFERENCES products(id) ON DELETE SET NULL,
      FOREIGN KEY (affiliateId) REFERENCES affiliates(id) ON DELETE RESTRICT,
      FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_sale_affiliates_sale ON sale_affiliates(saleId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sale_affiliates_affiliate ON sale_affiliates(affiliateId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sale_affiliates_tenant ON sale_affiliates(tenantId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sale_commission_items_sale ON sale_commission_items(saleId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sale_commission_items_affiliate ON sale_commission_items(affiliateId)`);

  try { db.exec("ALTER TABLE sale_items ADD COLUMN commissionPerUnit REAL DEFAULT 0"); } catch (e) {}
  try { db.exec("ALTER TABLE sale_items ADD COLUMN totalCommission REAL DEFAULT 0"); } catch (e) {}

  try { db.exec("ALTER TABLE sync_tracking ADD COLUMN sale_affiliates_last_sync TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE sync_tracking ADD COLUMN sale_commission_items_last_sync TEXT"); } catch (e) {}

  try { db.exec("ALTER TABLE commission_payments ADD COLUMN saleId TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE commission_payments ADD COLUMN paymentDate TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE commission_payments ADD COLUMN schedule TEXT DEFAULT 'immediate'"); } catch (e) {}
}

export function down(db: Database) {
  db.exec(`DROP TABLE IF EXISTS sale_commission_items`);
  db.exec(`DROP TABLE IF EXISTS sale_affiliates`);
}
