import { Database } from 'better-sqlite3';

/**
 * Migration 008: Relax FK constraints on sales and sale_items.
 *
 * Problem: `sales.employeeId` had `ON DELETE RESTRICT` referencing `users(id)`,
 * causing SQLITE_CONSTRAINT_FOREIGNKEY when the authenticated user's ID doesn't
 * exist in the users table (e.g. after a DB restore or seed reset).
 * Same issue on `sale_items.productId` referencing `products(id) ON DELETE RESTRICT`.
 *
 * Fix: Rebuild both tables with `ON DELETE SET NULL` so sales history is preserved
 * even when the referenced user or product is removed.
 */
export function up(db: Database) {
  db.transaction(() => {
    // --- Rebuild sales table ---
    db.exec(`
      CREATE TABLE IF NOT EXISTS sales_new (
        id TEXT PRIMARY KEY,
        invoiceNumber TEXT NOT NULL,
        date TEXT NOT NULL,
        subtotal REAL NOT NULL,
        tax REAL NOT NULL,
        taxRate REAL DEFAULT 20.0,
        discount REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL,
        paymentMethod TEXT NOT NULL,
        customerId TEXT,
        customerName TEXT,
        tenantId TEXT NOT NULL,
        employeeId TEXT,
        employeeName TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Payée',
        creditDueDate TEXT,
        creditPaidAmount REAL DEFAULT 0,
        creditInstallments TEXT,
        extraFees REAL DEFAULT 0,
        deliveryFee REAL DEFAULT 0,
        taxStamp REAL DEFAULT 0,
        changeReturned REAL DEFAULT 0,
        saleType TEXT DEFAULT 'standard',
        isReturned INTEGER DEFAULT 0,
        customFeeLabel TEXT,
        deliveryStatus TEXT DEFAULT 'livré',
        abandonReason TEXT,
        invoiceStatus TEXT DEFAULT 'Validée',
        paymentStatus TEXT DEFAULT 'Payé',
        creditStatus TEXT DEFAULT 'Pas de crédit',
        payments TEXT DEFAULT '[]',
        returns TEXT DEFAULT '[]',
        creditComments TEXT DEFAULT '[]',
        creditRelances INTEGER DEFAULT 0,
        FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (customerId) REFERENCES customers(id) ON DELETE SET NULL,
        FOREIGN KEY (employeeId) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    db.exec(`INSERT INTO sales_new SELECT * FROM sales`);
    db.exec(`DROP TABLE sales`);
    db.exec(`ALTER TABLE sales_new RENAME TO sales`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_sales_tenant ON sales(tenantId)`);

    // --- Rebuild sale_items table ---
    db.exec(`
      CREATE TABLE IF NOT EXISTS sale_items_new (
        id TEXT PRIMARY KEY,
        saleId TEXT NOT NULL,
        productId TEXT,
        productName TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        price REAL NOT NULL,
        total REAL NOT NULL,
        qtyDelivered INTEGER DEFAULT 0,
        qtyReturned INTEGER DEFAULT 0,
        commissionPerUnit REAL DEFAULT 0,
        totalCommission REAL DEFAULT 0,
        FOREIGN KEY (saleId) REFERENCES sales(id) ON DELETE CASCADE,
        FOREIGN KEY (productId) REFERENCES products(id) ON DELETE SET NULL
      )
    `);
    db.exec(`INSERT INTO sale_items_new SELECT * FROM sale_items`);
    db.exec(`DROP TABLE sale_items`);
    db.exec(`ALTER TABLE sale_items_new RENAME TO sale_items`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(saleId)`);
  })();

  console.log('Migration 008_fix_sales_fk applied: sales.employeeId and sale_items.productId now use ON DELETE SET NULL.');
}
