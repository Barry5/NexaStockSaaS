import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let db: any;
let commissionV2Service: any;
let commissionService: any;
let tempDir: string;

const TENANT_ID = 'tenant-v2test';

function insertAffiliate() {
  const t = new Date().toISOString();
  db.prepare(`
    INSERT INTO affiliates (id, code, firstName, lastName, phone, email, address, city, country, company, idNumber, status, notes, tenantId, createdAt, updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run('aff-v2-1', 'APP-000001', 'Alpha', 'Testeur', '+224 600 00 00 00', 'alpha@test.gn', null, 'Conakry', 'Guinée', null, null, 'active', null, TENANT_ID, t, t);
}

describe('CommissionV2Service.recordSaleCommission — auto-création de la vente', () => {
  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexastock-commission-v2-'));
    process.env.DB_PATH = path.join(tempDir, 'database.db');
    process.env.BACKUP_DIR = path.join(tempDir, 'backups');
    process.env.SNAPSHOT_PATH = path.join(tempDir, 'snapshot.json');

    const dbModule = await import('../../database/db.js');
    db = dbModule.default;
    const init = await import('../../database/init.js');
    init.initializeDatabase();

    // Ensure the tenant exists (the FK sale_affiliates.tenantId -> tenants(id))
    db.prepare(`INSERT OR IGNORE INTO tenants (id, name, currency, createdAt) VALUES (?,?,?,?)`)
      .run(TENANT_ID, 'Tenant V2', 'GNF', new Date().toISOString());

    ({ commissionV2Service } = await import('./commissionV2Service.js'));
    ({ commissionService } = await import('./commissionService.js'));
  });

  afterAll(() => {
    try { db?.close(); } catch { /* ignore */ }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('enregistre une commission pour une vente ABSENTE côté serveur (cas POS local)', () => {
    insertAffiliate();

    const localSaleId = `sa-${Date.now()}`; // ex: id local Dexie jamais poussé au serveur

    const result: any = commissionV2Service.recordSaleCommission(
      {
        saleId: localSaleId,
        affiliateId: 'aff-v2-1',
        invoiceNumber: 'FAC-2026-000001',
        customerName: 'Client Test',
        saleDate: new Date().toISOString(),
        saleTotal: 5000,
        items: [
          { productId: null, productName: 'Lait 1L', quantity: 2, sellPrice: 2000, commissionPerUnit: 100 },
          { productId: null, productName: 'Sucre 1kg', quantity: 3, sellPrice: 1000, commissionPerUnit: 50 },
        ],
        paymentSchedule: 'later',
        immediatePayment: 0,
      },
      TENANT_ID,
      'u-test',
      'Caissier Test'
    );

    // La commission doit être calculée : (100*2) + (50*3) = 350
    expect(result.totalCommission).toBe(350);
    expect(result.balanceDue).toBe(350);
    expect(result.saleAffiliateId).toBeTruthy();

    // La vente minimale a bien été créée côté serveur (FK satisfaite)
    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(localSaleId);
    expect(sale).toBeTruthy();
    expect(sale.invoiceNumber).toBe('FAC-2026-000001');

    // Le lien vente-apporteur existe avec les bons agrégats
    const sa = db.prepare('SELECT * FROM sale_affiliates WHERE saleId = ?').get(localSaleId);
    expect(sa).toBeTruthy();
    expect(sa.affiliateName).toBe('Alpha Testeur');
    expect(sa.totalCommission).toBe(350);

    // Les lignes de commission produit ont été écrites
    const items = db.prepare('SELECT * FROM sale_commission_items WHERE saleId = ?').all(localSaleId);
    expect(items.length).toBe(2);

    // Le ledger de l'apporteur affiche les crédits (visible dans la page Commissions)
    const ledger = db.prepare("SELECT * FROM commission_ledger WHERE affiliateId = 'aff-v2-1' AND type = 'commission'").all() as any[];
    expect(ledger.length).toBe(2);
    expect(ledger.reduce((s, e) => s + e.credit, 0)).toBe(350);

    // Visible aussi via le ledger v1 de la page
    const statement = commissionService.getAffiliateStatement('aff-v2-1');
    expect(statement.balance).toBe(350);
  });

  it('ne duplique pas la vente minimale quand la vente existe déjà', () => {
    const localSaleId = `sa-${Date.now()}-existing`;
    const nowIso = new Date().toISOString();
    db.prepare(`
      INSERT INTO sales (id, invoiceNumber, date, subtotal, tax, discount, total, paymentMethod, customerId, customerName, tenantId, employeeId, employeeName, status, invoiceStatus, paymentStatus, creditStatus, payments, returns, creditComments)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(localSaleId, 'FAC-2026-EXIST-1', nowIso, 1000, 0, 0, 1000, 'cash', null, 'Utilisateur existant', TENANT_ID, null, 'Caissier', 'Payée', 'Validée', 'Payé', 'Pas de crédit', '[]', '[]', '[]');

    commissionV2Service.recordSaleCommission(
      {
        saleId: localSaleId,
        affiliateId: 'aff-v2-1',
        invoiceNumber: 'FAC-2026-EXIST-1',
        customerName: 'Utilisateur existant',
        items: [{ productId: null, productName: 'Café 250g', quantity: 1, sellPrice: 3000, commissionPerUnit: 60 }],
        paymentSchedule: 'immediate',
        immediatePayment: 60,
      },
      TENANT_ID,
      'u-test',
      'Caissier Test'
    );

    const sales = db.prepare('SELECT * FROM sales WHERE id = ?').all(localSaleId);
    expect(sales.length).toBe(1);
    // Le libellé de la facture d'origine est conservé
    expect(sales[0].invoiceNumber).toBe('FAC-2026-EXIST-1');

    // Paiement immédiat : statut paid, balanceDue à 0
    const sa = db.prepare('SELECT * FROM sale_affiliates WHERE saleId = ?').get(localSaleId);
    expect(sa.status).toBe('paid');
    expect(sa.balanceDue).toBe(0);
  });

  function insertInvoice(invoiceId: string, invoiceNumber: string) {
    const t = new Date().toISOString();
    db.prepare(`
      INSERT INTO invoices (id, invoiceNumber, type, date, dueDate, customerId, customerName, subtotal, taxRate, tax, discount, discountType, shipping, total, paidAmount, status, deliveryStatus, paymentStatus, notes, termsConditions, tenantId, employeeId, employeeName, createdAt, updatedAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(invoiceId, invoiceNumber, 'sale', t, null, null, 'Client Facture', 0, 20, 0, 0, 'fixed', 0, 10000, 0, 'draft', 'not_delivered', 'unpaid', null, null, TENANT_ID, null, 'Comptable', t, t);
  }

  it('rejette une commission quand la facture nexiste pas', () => {
    expect(() => commissionV2Service.recordInvoiceCommission(
      { invoiceId: 'inv-inconnue', affiliateId: 'aff-v2-1', items: [{ productName: 'X', quantity: 1, sellPrice: 100, commissionPerUnit: 10 }] },
      TENANT_ID
    )).toThrow('Facture introuvable');
  });

  it('écrit les tables miroir et le ledger quand la facture existe', () => {
    const invoiceId = `inv-${Date.now()}-full`;
    insertInvoice(invoiceId, 'FAC-2026-INV-FULL');

    const result: any = commissionV2Service.recordInvoiceCommission(
      {
        invoiceId,
        affiliateId: 'aff-v2-1',
        invoiceNumber: 'FAC-2026-INV-FULL',
        customerName: 'Client Facture',
        items: [
          { productId: null, productName: 'Lait 1L', quantity: 2, sellPrice: 2000, commissionPerUnit: 100 },
          { productId: null, productName: 'Sucre 1kg', quantity: 3, sellPrice: 1000, commissionPerUnit: 50 },
        ],
        paymentSchedule: 'later',
        immediatePayment: 0,
      },
      TENANT_ID,
      'u-test',
      'Comptable Test'
    );

    expect(result.totalCommission).toBe(350);
    expect(result.invoiceAffiliateId).toBeTruthy();

    const ia = db.prepare('SELECT * FROM invoice_affiliates WHERE invoiceId = ?').get(invoiceId);
    expect(ia).toBeTruthy();
    expect(ia.affiliateName).toBe('Alpha Testeur');
    expect(ia.paymentDueDate).toBeTruthy(); // schedule 'later' -> +30j

    const items = db.prepare('SELECT * FROM invoice_commission_items WHERE invoiceId = ?').all(invoiceId);
    expect(items.length).toBe(2);

    const ledger = db.prepare("SELECT * FROM commission_ledger WHERE affiliateId = 'aff-v2-1' AND referenceType = 'invoice'").all() as any[];
    expect(ledger.length).toBe(2);
    expect(ledger.reduce((s, e) => s + e.credit, 0)).toBe(350);

    // La commission de facture apparaît dans les commissions en attente (union)
    const pending = commissionV2Service.getPending(TENANT_ID);
    const invPending = pending.filter((p: any) => p.docType === 'invoice' && p.invoiceId === invoiceId);
    expect(invPending.length).toBe(1);

    // getInvoiceCommission renvoie la paire
    const fetched: any = commissionV2Service.getInvoiceCommission(invoiceId, TENANT_ID);
    expect(fetched.invoiceAffiliate.invoiceId).toBe(invoiceId);
    expect(fetched.commissionItems.length).toBe(2);
  });

  it("soude une commission de facture via le paiement groupé (batchPay)", () => {
    const invoiceId = `inv-${Date.now()}-pay`;
    insertInvoice(invoiceId, 'FAC-2026-INV-PAY');

    commissionV2Service.recordInvoiceCommission(
      {
        invoiceId,
        affiliateId: 'aff-v2-1',
        invoiceNumber: 'FAC-2026-INV-PAY',
        customerName: 'Client Facture',
        items: [{ productId: null, productName: 'Café 250g', quantity: 1, sellPrice: 3000, commissionPerUnit: 100 }],
        paymentSchedule: 'later',
        immediatePayment: 0,
      },
      TENANT_ID,
      'u-test',
      'Comptable Test'
    );

    const pending = commissionV2Service.getPending(TENANT_ID);
    const entry = pending.find((p: any) => p.docType === 'invoice' && p.invoiceId === invoiceId);
    expect(entry).toBeTruthy();

    const before = db.prepare('SELECT balanceDue FROM invoice_affiliates WHERE invoiceId = ?').get(invoiceId);
    expect(before.balanceDue).toBe(100);

    const payResult = commissionV2Service.batchPay([entry.id], 'cash', undefined, TENANT_ID, 'u-test', 'Comptable Test');
    expect(payResult.count).toBe(1);
    expect(payResult.totalPaid).toBe(100);

    const after = db.prepare('SELECT status, balanceDue FROM invoice_affiliates WHERE invoiceId = ?').get(invoiceId);
    expect(after.status).toBe('paid');
    expect(after.balanceDue).toBe(0);
  });
});