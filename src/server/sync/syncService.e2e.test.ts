import { describe, expect, it, beforeAll, afterAll, vi, vi as vitest } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tempDir: string;
let db: any;
let syncService: any;
let syncQueue: any;
let syncEngine: any;
let transform: any;
let tablesWithoutUpdatedAt: Set<string>;

// Mock l'ensemble du service Supabase : on ne touche pas au réseau en test.
const mockBatchUpsert = vitest.fn(async (_table: string, _records: any, _conflictColumn?: string) => ({ success: _records.length, errors: [] }));
const mockDelete = vitest.fn(async () => ({ error: null }));
const mockFrom = vitest.fn(() => ({ delete: () => ({ eq: mockDelete, neq: mockDelete, not: mockDelete }), upsert: mockBatchUpsert }));
const mockGetAdminClient = vitest.fn(() => ({ from: mockFrom }));
const mockCheckConnection = vitest.fn(async () => true);
const mockIsConfigured = vitest.fn(() => true);

vitest.mock('../services/supabase/supabaseService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  isSupabaseConfigured: mockIsConfigured,
  checkConnection: mockCheckConnection,
  batchUpsert: mockBatchUpsert,
  getAdminClient: mockGetAdminClient,
  getChangesSince: vitest.fn(),
  getChangesSinceByCreatedAt: vitest.fn(async () => ({ data: [], error: null })),
}));

describe('syncService E2E : coherence local <-> Supabase', () => {
  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexastock-sync-e2e-'));
    process.env.DB_PATH = path.join(tempDir, 'database.db');
    process.env.BACKUP_DIR = path.join(tempDir, 'backups');
    process.env.SNAPSHOT_PATH = path.join(tempDir, 'snapshot.json');

    const dbModule = await import('../database/db.js');
    db = dbModule.default;
    const init = await import('../database/init.js');
    init.initializeDatabase();

    ({ syncService } = await import('./syncService.js'));
    syncQueue = await import('./syncQueue.js');
    ({ syncEngine } = await import('./syncEngine.js'));
  ({ transformToPostgres: transform } = await import('../services/supabase/transform.js'));

    const syncTables = await import('./syncTables.js');
    ({ TABLES_WITHOUT_UPDATED_AT: tablesWithoutUpdatedAt } = syncTables);
  });

  afterAll(() => {
    try { db?.close(); } catch { /* ignore */ }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('propage un CREATE vers Supabase avec les bons champs (legacy_id, version exclu)', async () => {
    mockBatchUpsert.mockClear();
    syncQueue.enqueue('products', 'p-e2e-1', 'CREATE', { id: 'p-e2e-1', name: 'Produit E2E', tenantId: null });

    const result = await syncService.syncUp();

    expect(result.pushed).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockBatchUpsert).toHaveBeenCalledTimes(1);
    const [, records] = mockBatchUpsert.mock.calls[0];
    expect(records[0].legacy_id).toBe('p-e2e-1');
    expect(records[0].version).toBeUndefined();
  });

  it('fullPush propage les modifications de pricing_plans avec currency et legacy_id', async () => {
    mockBatchUpsert.mockClear();
    const now = new Date().toISOString();

    db.prepare(`INSERT INTO pricing_plans (id, name, description, price, currency, durationDays, features, limits, color, displayOrder, active, createdAt, updatedAt, version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run('plan-e2e', 'Pro', 'Pro plan', 49.99, 'USD', 30, JSON.stringify(['support']), JSON.stringify({ users: 20 }), '#00AEEF', 2, 1, now, now, 1);

    const result = await syncService.fullPush();

    expect(result.pushed).toBeGreaterThanOrEqual(1);
    expect(result.failed).toBe(0);

    const pricingCall = mockBatchUpsert.mock.calls.find(([, records]) => records.some((record: any) => record.legacy_id === 'plan-e2e'));
    expect(pricingCall).toBeDefined();
    const [, records] = pricingCall as [string, any[]];
    const pushedRecord = records.find((record: any) => record.legacy_id === 'plan-e2e');
    expect(pushedRecord).toBeDefined();
    expect(pushedRecord.currency).toBe('USD');
    expect(pushedRecord.legacy_id).toBe('plan-e2e');
    expect(pushedRecord.version).toBeUndefined();
  });

  it('propage un DELETE vers Supabase meme si la ligne n\'existe plus localement (fix #1 dans pushChanges)', async () => {
    mockBatchUpsert.mockClear();
    mockDelete.mockClear();
    mockFrom.mockClear();
    const now = new Date().toISOString();
    db.prepare(`INSERT OR IGNORE INTO tenants (id, name, plan, currency, createdAt) VALUES (?, ?, ?, ?, ?)`).run('t-e2e', 'Test', 'Free', 'EUR', now);
    // Insertion puis suppression locale -> le record n'existe plus au moment du push
    db.prepare(`INSERT INTO products (id, name, sku, category, buyPrice, sellPrice, quantity, tenantId, createdAt) VALUES (?,?,?,?,?,?,?,?,?)`).run(
      'p-e2e-del', 'Ghost', 'GHOST', 'cat', 0, 0, 0, 't-e2e', now,
    );
    db.prepare(`DELETE FROM products WHERE id = ?`).run('p-e2e-del');

    // pushChanges = voie client (POST /api/sync/push) : le DELETE doit etre enfile meme si le record est absent
    const pushResult = syncEngine.pushChanges([{
      table: 'products', recordId: 'p-e2e-del', operation: 'DELETE',
      data: { id: 'p-e2e-del', name: 'Ghost', tenantId: 't-e2e' }, version: 1,
    }]);
    expect(pushResult.applied).toBe(1);
    expect(pushResult.errors.length).toBe(0);

    // Le changelog DELETE doit etre cree -> le worker le poussera vers PG
    const chg = db.prepare(`SELECT * FROM sync_changelog WHERE table_name = ? AND record_id = ? AND operation = 'DELETE'`).get('products', 'p-e2e-del') as any;
    expect(chg).toBeDefined();
    expect(chg.pushed_to_supabase).toBe(0);

    const delLog = db.prepare(`SELECT * FROM sync_deletions WHERE table_name = ? AND record_id = ?`).get('products', 'p-e2e-del') as any;
    expect(delLog).toBeDefined();

    // Le worker (processChangelog) pousse le changelog vers PG
    const logResult = await syncService.syncUpFromChangelog();
    expect(logResult.failed).toBe(0);
    expect(mockFrom).toHaveBeenCalledWith('products');
    expect(mockDelete).toHaveBeenCalled();
    const [column, value] = mockDelete.mock.calls[0];
    expect(column).toBe('legacy_id');
    expect(value).toBe('p-e2e-del');
  });

  it('cleanupPushedRecords supprime le changelog deja pousse vers PG', async () => {
    db.prepare(`INSERT INTO sync_changelog (id, table_name, record_id, operation, new_values, old_version, new_version, created_at, pushed_to_supabase) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run('chg-test', 'products', 'p-x', 'CREATE', '{}', 0, 1, new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), 1);
 
    const removed = syncEngine.cleanupPushedRecords();
 
    expect(removed).toBe(1);
    expect(db.prepare(`SELECT COUNT(*) as c FROM sync_changelog WHERE id = ?`).get('chg-test').c).toBe(0);
  });
 
  it('getSummary retourne un sommaire des operations de synchronisation par table', () => {
    syncQueue.enqueue('products', 'p-summary-1', 'CREATE', { id: 'p-summary-1', name: 'Summary Product' });
    syncQueue.enqueue('products', 'p-summary-2', 'UPDATE', { id: 'p-summary-2', name: 'Updated Product' });
    syncQueue.enqueue('customers', 'c-summary-1', 'DELETE', { id: 'c-summary-1' });
 
    const summary = syncQueue.getSummary();
 
    expect(summary.total).toBeGreaterThanOrEqual(3);
    expect(summary.pending).toBeGreaterThanOrEqual(3);
    expect(summary.perTable.some(t => t.table_name === 'products')).toBe(true);
    const productSummary = summary.perTable.find(t => t.table_name === 'products');
    expect(productSummary?.create).toBeGreaterThanOrEqual(1);
    expect(productSummary?.update).toBeGreaterThanOrEqual(1);
  });
 
  it('getPendingChangesSummary retourne les changements et suppressions non pushes', () => {
    db.prepare(`INSERT INTO sync_changelog (id, table_name, record_id, operation, new_values, old_version, new_version, created_at, pushed_to_supabase) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run('chg-summary', 'products', 'p-sum-1', 'UPDATE', '{}', 1, 2, new Date().toISOString(), 0);
    db.prepare(`INSERT INTO sync_deletions (id, table_name, record_id, deleted_at, pushed_to_supabase) VALUES (?,?,?,?,?)`)
      .run('del-summary', 'customers', 'c-sum-1', new Date().toISOString(), 0);
 
    const pending = syncEngine.getPendingChangesSummary();
    expect(pending.changelogCount).toBeGreaterThanOrEqual(1);
    expect(pending.deletionCount).toBeGreaterThanOrEqual(1);
    expect(pending.changelogByTable.some(t => t.table_name === 'products')).toBe(true);
    expect(pending.deletionsByTable.some(t => t.table_name === 'customers')).toBe(true);
  });
 
  it('plan_modules est dans TABLES_WITHOUT_UPDATED_AT (PG n\'a pas updated_at -> fallback created_at)', () => {
    expect(tablesWithoutUpdatedAt.has('plan_modules')).toBe(true);
    expect(tablesWithoutUpdatedAt.has('tenant_modules')).toBe(true);
  });

  it('dequeue ordonne les tables par dépendance (parent avant enfant) indépendamment de created_at', () => {
    db.prepare('DELETE FROM sync_queue').run();

    // L'enfant (invoice_audit_log) est enfilé AVANT le parent (invoices), et avec
    // un created_at plus ancien pour prouver que la priorité l'emporte.
    const earlier = new Date(Date.now() - 60000).toISOString();
    db.prepare(`INSERT INTO sync_queue (id, table_name, record_id, operation, payload, created_at, status) VALUES (?,?,?,?,?,?,?)`)
      .run('q-child', 'invoice_audit_log', 'a-1', 'CREATE', '{}', earlier, 'pending');
    db.prepare(`INSERT INTO sync_queue (id, table_name, record_id, operation, payload, created_at, status) VALUES (?,?,?,?,?,?,?)`)
      .run('q-parent', 'invoices', 'inv-1', 'CREATE', '{}', new Date().toISOString(), 'pending');

    const items = syncQueue.dequeue(50);
    const order = items.map((i: any) => i.table_name);

    // Le parent (invoices, priorité 1) doit précéder l'enfant (invoice_audit_log, priorité 2)
    expect(order).toEqual(['invoices', 'invoice_audit_log']);
    expect(order.indexOf('invoices')).toBeLessThan(order.indexOf('invoice_audit_log'));
  });
});
