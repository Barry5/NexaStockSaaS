import { Database } from 'better-sqlite3';

export function up(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      invoiceNumber TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'sale',
      date TEXT NOT NULL,
      dueDate TEXT,
      customerId TEXT,
      customerName TEXT,
      customerPhone TEXT,
      customerEmail TEXT,
      customerAddress TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      taxRate REAL NOT NULL DEFAULT 0,
      tax REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      discountType TEXT NOT NULL DEFAULT 'percentage',
      shipping REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      paidAmount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft',
      deliveryStatus TEXT NOT NULL DEFAULT 'not_delivered',
      paymentStatus TEXT NOT NULL DEFAULT 'unpaid',
      notes TEXT,
      termsConditions TEXT,
      tenantId TEXT NOT NULL,
      employeeId TEXT,
      employeeName TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenantId);
    CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customerId);
    CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

    CREATE TABLE IF NOT EXISTS invoice_items (
      id TEXT PRIMARY KEY,
      invoiceId TEXT NOT NULL,
      productId TEXT,
      productName TEXT NOT NULL,
      productSku TEXT,
      quantity REAL NOT NULL DEFAULT 1,
      price REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      qtyDelivered REAL NOT NULL DEFAULT 0,
      qtyReturned REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (invoiceId) REFERENCES invoices(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoiceId);

    CREATE TABLE IF NOT EXISTS delivery_orders (
      id TEXT PRIMARY KEY,
      deliveryNumber TEXT NOT NULL,
      invoiceId TEXT NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      notes TEXT,
      createdBy TEXT,
      createdByName TEXT,
      tenantId TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      validatedAt TEXT,
      cancelledAt TEXT,
      FOREIGN KEY (invoiceId) REFERENCES invoices(id) ON DELETE CASCADE,
      FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_delivery_orders_invoice ON delivery_orders(invoiceId);
    CREATE INDEX IF NOT EXISTS idx_delivery_orders_tenant ON delivery_orders(tenantId);

    CREATE TABLE IF NOT EXISTS delivery_order_items (
      id TEXT PRIMARY KEY,
      deliveryOrderId TEXT NOT NULL,
      invoiceItemId TEXT NOT NULL,
      productId TEXT,
      productName TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      price REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (deliveryOrderId) REFERENCES delivery_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (invoiceItemId) REFERENCES invoice_items(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_doi_delivery ON delivery_order_items(deliveryOrderId);

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      invoiceId TEXT NOT NULL,
      date TEXT NOT NULL,
      amount REAL NOT NULL,
      method TEXT NOT NULL,
      reference TEXT,
      notes TEXT,
      tenantId TEXT NOT NULL,
      createdBy TEXT,
      createdByName TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (invoiceId) REFERENCES invoices(id) ON DELETE CASCADE,
      FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoiceId);

    CREATE TABLE IF NOT EXISTS returns (
      id TEXT PRIMARY KEY,
      returnNumber TEXT NOT NULL,
      invoiceId TEXT NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      reason TEXT,
      tenantId TEXT NOT NULL,
      createdBy TEXT,
      createdByName TEXT,
      createdAt TEXT NOT NULL,
      validatedAt TEXT,
      FOREIGN KEY (invoiceId) REFERENCES invoices(id) ON DELETE CASCADE,
      FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_returns_invoice ON returns(invoiceId);

    CREATE TABLE IF NOT EXISTS return_items (
      id TEXT PRIMARY KEY,
      returnId TEXT NOT NULL,
      invoiceItemId TEXT NOT NULL,
      productId TEXT,
      productName TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      price REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      reason TEXT,
      FOREIGN KEY (returnId) REFERENCES returns(id) ON DELETE CASCADE,
      FOREIGN KEY (invoiceItemId) REFERENCES invoice_items(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_return_items_return ON return_items(returnId);

    CREATE TABLE IF NOT EXISTS invoice_audit_log (
      id TEXT PRIMARY KEY,
      invoiceId TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      userId TEXT,
      userName TEXT,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (invoiceId) REFERENCES invoices(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_audit_invoice ON invoice_audit_log(invoiceId);
  `);

  // Add invoices, delivery_orders, payments, returns to sync tracking if table exists
  try {
    db.exec(`ALTER TABLE sync_tracking ADD COLUMN invoices_last_sync TEXT`);
  } catch {}
  try {
    db.exec(`ALTER TABLE sync_tracking ADD COLUMN delivery_orders_last_sync TEXT`);
  } catch {}
  try {
    db.exec(`ALTER TABLE sync_tracking ADD COLUMN payments_last_sync TEXT`);
  } catch {}
  try {
    db.exec(`ALTER TABLE sync_tracking ADD COLUMN returns_last_sync TEXT`);
  } catch {}

  console.log('Migration 002_invoicing applied: invoices, delivery_orders, payments, returns, audit_log tables created.');
}
