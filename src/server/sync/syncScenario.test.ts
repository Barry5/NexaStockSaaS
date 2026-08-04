import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tempDir: string;
let db: any;
let syncService: any;
let pricingPlanService: any;
let saleService: any; // On utilisera db directement si le service n'est pas là
let customerService: any;
let productService: any;

// Mock partiel de Supabase : on intercepte juste les écritures
const mockBatchUpsert = vi.fn(async (_table, records) => ({ success: records.length, errors: [] }));
vi.mock('../services/supabase/supabaseService.js', async (importOriginal) => {
  const original: any = await importOriginal();
  return {
    ...original,
    batchUpsert: mockBatchUpsert,
    checkConnection: vi.fn(async () => true),
    isSupabaseConfigured: vi.fn(() => true),
    getChangesSince: vi.fn(async () => ({ data: [], error: null })),
    getChangesSinceByCreatedAt: vi.fn(async () => ({ data: [], error: null })),
  };
});

describe('Analyse de scénarios de synchronisation', () => {
  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexastock-sync-scenario-'));
    process.env.DB_PATH = path.join(tempDir, 'database.db');

    const dbModule = await import('../database/db.js');
    db = dbModule.default;
    const init = await import('../database/init.js');
    init.initializeDatabase();

    ({ syncService } = await import('./syncService.js'));
    await syncService.initialize();

    // Importer les services de domaine pour simuler des actions utilisateur
    ({ pricingPlanService } = await import('../services/domain/pricingPlanService.js'));
    ({ customerService } = await import('../services/domain/customerService.js'));
    ({ productService } = await import('../services/domain/productService.js'));
    ({ saleService } = await import('../services/domain/saleService.js'));
  });

  afterAll(() => {
    try { db?.close(); } catch { /* ignore */ }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('une mise à jour de forfait (pricing_plans) doit être correctement transformée et poussée', async () => {
    // 1. Setup: Créer un forfait de test
    const plan = pricingPlanService.create({
      name: 'Plan Sync Test', price: 50, currency: 'EUR', durationDays: 30,
      features: [], limits: {}, color: 'red', displayOrder: 99, active: true,
    });

    // Laisser le push immédiat du CREATE (fire-and-forget) se terminer
    await new Promise(r => setTimeout(r, 100));

    // Vider le changelog de synchro pour isoler notre test
    db.prepare('DELETE FROM sync_changelog').run();
    mockBatchUpsert.mockClear();

    // 2. Action: Mettre à jour le prix du forfait
    pricingPlanService.update(plan.id, { price: 99.99 });

    // Le service déclenche un push immédiat (fire-and-forget, Phase 1) :
    // attendre qu'il se termine puis vérifier ce qui est parti.
    await new Promise(r => setTimeout(r, 100));

    // 3. Analyse: Vérifier que l'action est bien journalisée dans le changelog
    const changeItem = db.prepare(`SELECT * FROM sync_changelog WHERE record_id = ?`).get(plan.id);
    expect(changeItem).toBeDefined();
    expect(changeItem.operation).toBe('UPDATE');

    // 4. Vérification: Analyser les données envoyées à Supabase par le push immédiat
    expect(mockBatchUpsert).toHaveBeenCalledOnce();
    const [table, records] = mockBatchUpsert.mock.calls[0];
    expect(table).toBe('pricing_plans');
    expect(records[0].price).toBe(99.99);
    expect(records[0].legacy_id).toBe(plan.id);
    expect(records[0].version).toBeUndefined(); // Crucial: la colonne 'version' ne doit pas être envoyée
  });

  it('une nouvelle vente et ses articles doivent être correctement transformés avec les bonnes clés étrangères', async () => {
    // 1. Setup: Créer un client et un produit
    const tenantId = 't-main';
    db.prepare(`INSERT INTO tenants (id, name, plan, currency, createdAt) VALUES (?, ?, ?, ?, ?)`).run(tenantId, 'Main', 'Free', 'EUR', new Date().toISOString());
    const customer = customerService.create({ name: 'Client Test Sync' }, tenantId);
    const product = productService.create({ name: 'Produit Test Sync', sku: 'SYNC-001', category: 'Test', buyPrice: 5, sellPrice: 10, quantity: 100 }, tenantId);

    // Vider le changelog et les mocks
    db.prepare('DELETE FROM sync_changelog').run();
    mockBatchUpsert.mockClear();

    // 2. Action: Créer une vente complexe
    const saleInput = {
      invoiceNumber: 'S-TEST-001',
      date: new Date().toISOString(),
      customerId: customer.id,
      employeeName: 'Test User',
      items: [{ productId: product.id, productName: product.name, quantity: 2, price: 10, total: 20 }],
      subtotal: 20, tax: 0, total: 20, paymentMethod: 'cash', status: 'Payée', tenantId,
    };
    const existingUser = db.prepare('SELECT id, name FROM users WHERE role = ? LIMIT 1').get('superadmin') as any;
    const sale = saleService.create(saleInput, tenantId, existingUser.id, existingUser.name);

    // 3. Action: Laisser le push immédiat (fire-and-forget, Phase 1) se terminer
    await new Promise(r => setTimeout(r, 300));

    // 4. Analyse: Vérifier les appels à Supabase (toutes tables confondues)
    expect(mockBatchUpsert.mock.calls.some(call => call[0] === 'sales')).toBe(true);
    expect(mockBatchUpsert.mock.calls.some(call => call[0] === 'sale_items')).toBe(true);
    expect(mockBatchUpsert.mock.calls.some(call => call[0] === 'audit_logs')).toBe(true);

    const saleCall = mockBatchUpsert.mock.calls.find(call => call[0] === 'sales');
    const saleItemCall = mockBatchUpsert.mock.calls.find(call => call[0] === 'sale_items');

    expect(saleCall).toBeDefined();
    expect(saleItemCall).toBeDefined();

    const pgSale = saleCall[1][0];
    const pgSaleItem = saleItemCall[1][0];

    // Vérification des clés étrangères: elles doivent être des UUID
    expect(pgSale.customer_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(pgSaleItem.sale_id).toBe(pgSale.id); // La clé de la vente doit correspondre
    expect(pgSaleItem.product_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

    // Tout le changelog de la vente doit être marqué poussé (plus rien en attente)
    const pending = db.prepare(`SELECT COUNT(*) as c FROM sync_changelog WHERE table_name IN ('sales', 'sale_items', 'audit_logs') AND pushed_to_supabase = 0`).get() as { c: number };
    expect(pending.c).toBe(0);
  });
});