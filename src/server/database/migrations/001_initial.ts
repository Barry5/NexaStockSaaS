import { Database } from 'better-sqlite3';

export function up(db: Database) {
  // 1. Tenants Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
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
      taxRate REAL DEFAULT 20.0,
      customCategories TEXT, -- JSON array of strings
      createdAt TEXT NOT NULL,
      updatedAt TEXT,
      subscriptionPlanId TEXT,
      subscriptionStatus TEXT DEFAULT 'TRIAL',
      subscriptionStartDate TEXT,
      subscriptionEndDate TEXT,
      subscriptionRenewalDate TEXT,
      trialStartDate TEXT,
      trialEndDate TEXT,
      gracePeriodEndDate TEXT,
      lastReminderSentDate TEXT,
      trialDaysConfigured INTEGER DEFAULT 14,
      invoicePrefix TEXT DEFAULT 'FAC-',
      invoiceFooterMsg TEXT DEFAULT 'MERCI DE VOTRE CONFIANCE !',
      invoiceSubFooterMsg TEXT DEFAULT 'NexaStock ERP Multi-tenant - Document officiel au format PDF',
      defaultExtraFeeLabel TEXT DEFAULT 'Frais de transport'
    )
  `);

  // 2. Users Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'vendeur',
      tenantId TEXT,
      active INTEGER NOT NULL DEFAULT 1, -- 0 = false, 1 = true
      avatar TEXT,
      password TEXT,
      firstLoginReset INTEGER DEFAULT 0, -- 0 = false, 1 = true
      FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  // 3. Products Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sku TEXT NOT NULL,
      barcode TEXT,
      description TEXT,
      category TEXT NOT NULL,
      buyPrice REAL NOT NULL DEFAULT 0,
      sellPrice REAL NOT NULL DEFAULT 0,
      minPrice REAL DEFAULT 0,
      quantity INTEGER NOT NULL DEFAULT 0,
      alertThreshold INTEGER NOT NULL DEFAULT 5,
      image TEXT,
      tenantId TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  // 4. Customers Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      loyaltyPoints INTEGER NOT NULL DEFAULT 0,
      outstandingDebt REAL NOT NULL DEFAULT 0.0,
      tenantId TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  // 5. Suppliers Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contactName TEXT,
      phone TEXT,
      email TEXT,
      tenantId TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  // 6. Sales Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sales (
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
      employeeId TEXT NOT NULL,
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
      FOREIGN KEY (employeeId) REFERENCES users(id) ON DELETE RESTRICT
    )
  `);

  // Dynamically apply missing columns to existing databases (for backward compatibility)
  try { db.exec("ALTER TABLE tenants ADD COLUMN email TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE tenants ADD COLUMN city TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE tenants ADD COLUMN country TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE tenants ADD COLUMN updatedAt TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE tenants ADD COLUMN invoicePrefix TEXT DEFAULT 'FAC-'"); } catch (e) {}
  try { db.exec("ALTER TABLE tenants ADD COLUMN invoiceFooterMsg TEXT DEFAULT 'MERCI DE VOTRE CONFIANCE !'"); } catch (e) {}
  try { db.exec("ALTER TABLE tenants ADD COLUMN invoiceSubFooterMsg TEXT DEFAULT 'NexaStock ERP Multi-tenant - Document officiel au format PDF'"); } catch (e) {}
  try { db.exec("ALTER TABLE tenants ADD COLUMN defaultExtraFeeLabel TEXT DEFAULT 'Frais de transport'"); } catch (e) {}

  try { db.exec("ALTER TABLE sales ADD COLUMN customFeeLabel TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE sales ADD COLUMN deliveryStatus TEXT DEFAULT 'livré'"); } catch (e) {}
  try { db.exec("ALTER TABLE sales ADD COLUMN abandonReason TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE sales ADD COLUMN invoiceStatus TEXT DEFAULT 'Validée'"); } catch (e) {}
  try { db.exec("ALTER TABLE sales ADD COLUMN paymentStatus TEXT DEFAULT 'Payé'"); } catch (e) {}
  try { db.exec("ALTER TABLE sales ADD COLUMN creditStatus TEXT DEFAULT 'Pas de crédit'"); } catch (e) {}
  try { db.exec("ALTER TABLE sales ADD COLUMN payments TEXT DEFAULT '[]'"); } catch (e) {}
  try { db.exec("ALTER TABLE sales ADD COLUMN returns TEXT DEFAULT '[]'"); } catch (e) {}
  try { db.exec("ALTER TABLE sales ADD COLUMN creditComments TEXT DEFAULT '[]'"); } catch (e) {}
  try { db.exec("ALTER TABLE sales ADD COLUMN creditRelances INTEGER DEFAULT 0"); } catch (e) {}

  // 7. Sale Items Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY,
      saleId TEXT NOT NULL,
      productId TEXT NOT NULL,
      productName TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      total REAL NOT NULL,
      qtyDelivered INTEGER DEFAULT 0,
      qtyReturned INTEGER DEFAULT 0,
      FOREIGN KEY (saleId) REFERENCES sales(id) ON DELETE CASCADE,
      FOREIGN KEY (productId) REFERENCES products(id) ON DELETE RESTRICT
    )
  `);

  try { db.exec("ALTER TABLE sale_items ADD COLUMN qtyDelivered INTEGER DEFAULT 0"); } catch (e) {}
  try { db.exec("ALTER TABLE sale_items ADD COLUMN qtyReturned INTEGER DEFAULT 0"); } catch (e) {}

  // 8. Expenses Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      date TEXT NOT NULL,
      description TEXT,
      recipient TEXT,
      paymentMethod TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'en_attente', -- 'paye' or 'en_attente'
      attachment TEXT,
      tenantId TEXT NOT NULL,
      FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  // 9. Loans Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS loans (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL, -- 'entrant' or 'sortant'
      partnerName TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      description TEXT,
      remainingBalance REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'actif', -- 'actif' or 'rembourse'
      tenantId TEXT NOT NULL,
      FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  // 10. Repayments Table (for loans)
  db.exec(`
    CREATE TABLE IF NOT EXISTS repayments (
      id TEXT PRIMARY KEY,
      loanId TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      note TEXT,
      FOREIGN KEY (loanId) REFERENCES loans(id) ON DELETE CASCADE
    )
  `);

  // 11. Loan Installments Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS loan_installments (
      id TEXT PRIMARY KEY,
      loanId TEXT NOT NULL,
      dueDate TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'en_attente', -- 'en_attente' or 'paye'
      paidDate TEXT,
      note TEXT,
      FOREIGN KEY (loanId) REFERENCES loans(id) ON DELETE CASCADE
    )
  `);

  // 12. Warehouses Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS warehouses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT,
      tenantId TEXT NOT NULL,
      FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  // 13. Stock Transfers Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS stock_transfers (
      id TEXT PRIMARY KEY,
      productId TEXT NOT NULL,
      productName TEXT NOT NULL,
      fromWarehouseId TEXT NOT NULL,
      toWarehouseId TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'en_cours', -- 'termine' or 'en_cours'
      tenantId TEXT NOT NULL,
      FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (fromWarehouseId) REFERENCES warehouses(id) ON DELETE RESTRICT,
      FOREIGN KEY (toWarehouseId) REFERENCES warehouses(id) ON DELETE RESTRICT
    )
  `);

  // 14. Audit Logs Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      userId TEXT NOT NULL,
      userName TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      ipAddress TEXT,
      tenantId TEXT NOT NULL,
      FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  // 15. Subscription Invoices Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscription_invoices (
      id TEXT PRIMARY KEY,
      invoiceNumber TEXT NOT NULL,
      date TEXT NOT NULL,
      amount REAL NOT NULL,
      plan TEXT NOT NULL,
      status TEXT NOT NULL, -- 'paye', 'impaye', 'suspendu'
      tenantId TEXT NOT NULL,
      FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  // 16. Product Variants Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_variants (
      id TEXT PRIMARY KEY,
      productId TEXT NOT NULL,
      name TEXT NOT NULL,
      sku TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      priceDelta REAL NOT NULL DEFAULT 0.0,
      FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
    )
  `);

  // 17. Subscription Payments Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscription_payments (
      id TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL,
      tenantName TEXT NOT NULL,
      planId TEXT NOT NULL,
      planName TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'EUR',
      paymentMethod TEXT NOT NULL,
      reference TEXT NOT NULL,
      transactionNumber TEXT NOT NULL,
      date TEXT NOT NULL,
      comment TEXT,
      receiptImage TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED'
      adminComment TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  // 18. Pricing Plans Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS pricing_plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'EUR',
      durationDays INTEGER NOT NULL DEFAULT 30,
      features TEXT, -- JSON array of strings
      limits TEXT, -- JSON object of limits
      color TEXT NOT NULL,
      displayOrder INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1
    )
  `);

  // 19. Global SaaS Settings Table (1-row config table)
  db.exec(`
    CREATE TABLE IF NOT EXISTS global_saas_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trialDays INTEGER NOT NULL DEFAULT 14,
      gracePeriodDays INTEGER NOT NULL DEFAULT 5,
      revertToPlanOnExpiry TEXT NOT NULL DEFAULT 'Free',
      orangeMoneyNumber TEXT,
      orangeMoneyName TEXT,
      mobileMoneyNumber TEXT,
      mobileMoneyName TEXT,
      bankDetails TEXT,
      paymentInstructions TEXT,
      automaticActivation INTEGER NOT NULL DEFAULT 0 -- 0 = false, 1 = true
    )
  `);

  // Indexes for optimal lookup performance
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenantId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenantId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sales_tenant ON sales(tenantId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(saleId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenantId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON suppliers(tenantId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_expenses_tenant ON expenses(tenantId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_loans_tenant ON loans(tenantId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_warehouses_tenant ON warehouses(tenantId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenantId)`);
}
