import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let db: any;
let invoiceService: any;
let tempDir: string;

const TENANT_ID = 'tenant-invtest';

describe('InvoiceService.create — commission apporteur intégrée', () => {
  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexastock-invoice-comm-'));
    process.env.DB_PATH = path.join(tempDir, 'database.db');
    process.env.BACKUP_DIR = path.join(tempDir, 'backups');
    process.env.SNAPSHOT_PATH = path.join(tempDir, 'snapshot.json');

    const dbModule = await import('../../database/db.js');
    db = dbModule.default;
    const init = await import('../../database/init.js');
    init.initializeDatabase();

    db.prepare(`INSERT OR IGNORE INTO tenants (id, name, currency, createdAt) VALUES (?,?,?,?)`)
      .run(TENANT_ID, 'Tenant Factures', 'GNF', new Date().toISOString());

    const t = new Date().toISOString();
    db.prepare(`
      INSERT INTO affiliates (id, code, firstName, lastName, phone, email, address, city, country, company, idNumber, status, notes, tenantId, createdAt, updatedAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run('aff-inv-1', 'APP-1001', 'Binta', 'Sow', '+224 000 00 00 00', 'binta@test.gn', null, 'Conakry', 'Guinée', null, null, 'active', null, TENANT_ID, t, t);

    ({ invoiceService } = await import('./invoiceService.js'));
  });

  afterAll(() => {
    try { db?.close(); } catch { /* ignore */ }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('crée la facture et enregistre la commission dans la même transaction', () => {
    const result: any = invoiceService.create(
      {
        customerName: 'Client Apporteur',
        items: [
          { productId: null, productName: 'Lait 1L', quantity: 2, price: 2000 },
          { productId: null, productName: 'Sucre 1kg', quantity: 3, price: 1000 },
        ],
        taxRate: 20,
        discount: 0,
        discountType: 'percentage',
        shipping: 0,
        commission: {
          affiliateId: 'aff-inv-1',
          rate: 5, // 5% de chaque ligne
          paymentSchedule: 'later',
          immediatePayment: 0,
        },
      },
      TENANT_ID,
      'u-test',
      'Comptable Test'
    );

    // Facture créée
    expect(result.id).toBeTruthy();
    expect(result.invoiceNumber).toMatch(/^FAC/);

    // Commission attachée (montants retournés via attachCommission)
    expect(result.invoiceAffiliate).toBeTruthy();
    expect(result.invoiceAffiliate.affiliateName).toBe('Binta Sow');
    // 5% de (2*2000 + 3*1000) = 5% de 7000 HT = 350
    expect(result.invoiceAffiliate.totalCommission).toBe(350);

    // Lignes de commission par article
    expect(result.commissionItems.length).toBe(2);
    const lait = result.commissionItems.find((c: any) => c.productName === 'Lait 1L');
    expect(lait.totalCommission).toBe(200); // 2 * (5% de 2000 = 100)
    expect(lait.commissionPerUnit).toBe(100);

    // Ledger : crédits référence 'invoice'
    const ledger = db.prepare("SELECT * FROM commission_ledger WHERE affiliateId = 'aff-inv-1' AND referenceType = 'invoice'").all() as any[];
    expect(ledger.length).toBe(2);
    expect(ledger.reduce((s, e) => s + e.credit, 0)).toBe(350);

    // Champ changelog journalisé (pipeline sync unique)
    const changelog = db.prepare("SELECT COUNT(*) as c FROM sync_changelog WHERE table_name = 'invoice_affiliates'").get() as any;
    expect(changelog.c).toBeGreaterThanOrEqual(1);
  });
});