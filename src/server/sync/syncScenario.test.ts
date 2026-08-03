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

    // Vider la file de synchro pour isoler notre test
    db.prepare('DELETE FROM sync_queue').run();
    mockBatchUpsert.mockClear();

    // 2. Action: Mettre à jour le prix du forfait
    pricingPlanService.update(plan.id, { price: 99.99 });

    // 3. Analyse: Vérifier que l'action est bien dans la file d'attente
    const queueItem = db.prepare(`SELECT * FROM sync_queue WHERE record_id = ?`).get(plan.id);
    expect(queueItem).toBeDefined();
    expect(queueItem.operation).toBe('UPDATE');

    // 4. Action: Lancer la synchronisation montante
    await syncService.syncUp();

    // 5. Vérification: Analyser les données envoyées à Supabase
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
    const customer = customerService.create({ name: 'Client Test Sync', tenantId });
    const product = productService.create({ name: 'Produit Test Sync', sku: 'SYNC-001', category: 'Test', buyPrice: 5, sellPrice: 10, quantity: 100, tenantId });

    // Vider la file et les mocks
    db.prepare('DELETE FROM sync_queue').run();
    mockBatchUpsert.mockClear();

    // 2. Action: Créer une vente complexe
    const saleInput = {
      date: new Date().toISOString(),
      customerId: customer.id,
      employeeName: 'Test User',
      items: [{ productId: product.id, quantity: 2, price: 10, total: 20 }],
      subtotal: 20, tax: 0, total: 20, paymentMethod: 'cash', status: 'Payée', tenantId,
    };
    const sale = saleService.createSale(saleInput);

    // 3. Action: Lancer la synchronisation
    await syncService.syncUp();

    // 4. Analyse: Vérifier les appels à Supabase
    expect(mockBatchUpsert).toHaveBeenCalledTimes(2); // Un appel pour 'sales', un pour 'sale_items'

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
  });
});