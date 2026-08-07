import { Database } from 'better-sqlite3';

// Miroir côté factures du flux commissions vente (006_commissions_v2) :
// `invoice_affiliates` (une ligne par facture+apporteur) et
// `invoice_commission_items` (lignes de commission par article). La gestion
// des commissions (échéancier, paiement groupé, recherche) est mutualisée avec
// le côté vente via commissionV2Service (union sale_affiliates/invoice_affiliates).
export function up(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoice_affiliates (
      id TEXT PRIMARY KEY,
      invoiceId TEXT NOT NULL,
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
      FOREIGN KEY (invoiceId) REFERENCES invoices(id) ON DELETE CASCADE,
      FOREIGN KEY (affiliateId) REFERENCES affiliates(id) ON DELETE RESTRICT,
      FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS invoice_commission_items (
      id TEXT PRIMARY KEY,
      invoiceId TEXT NOT NULL,
      affiliateId TEXT NOT NULL,
      productId TEXT,
      productName TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      sellPrice REAL NOT NULL DEFAULT 0,
      commissionPerUnit REAL NOT NULL DEFAULT 0,
      totalCommission REAL NOT NULL DEFAULT 0,
      tenantId TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (invoiceId) REFERENCES invoices(id) ON DELETE CASCADE,
      FOREIGN KEY (productId) REFERENCES products(id) ON DELETE SET NULL,
      FOREIGN KEY (affiliateId) REFERENCES affiliates(id) ON DELETE RESTRICT,
      FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_invoice_affiliates_invoice ON invoice_affiliates(invoiceId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_invoice_affiliates_affiliate ON invoice_affiliates(affiliateId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_invoice_affiliates_tenant ON invoice_affiliates(tenantId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_invoice_commission_items_invoice ON invoice_commission_items(invoiceId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_invoice_commission_items_affiliate ON invoice_commission_items(affiliateId)`);

  // Référence croisée pour commission_payments : permet de payer une commission
  // de facture sans passer par l'id du tableau (same colonne que saleId pour les ventes).
  try { db.exec("ALTER TABLE commission_payments ADD COLUMN invoiceId TEXT"); } catch (e) {}
}

export function down(db: Database) {
  db.exec(`DROP TABLE IF EXISTS invoice_commission_items`);
  db.exec(`DROP TABLE IF EXISTS invoice_affiliates`);
}