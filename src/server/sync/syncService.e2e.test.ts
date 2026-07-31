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

// Mock l'ensemble du service Supabase : on ne touche pas au réseau en test.
const mockBatchUpsert = vitest.fn(async (_table: string, _records: any, _conflictColumn?: string) => ({ success: _records.length, errors: [] }));
const mockDelete = vitest.fn(async () => ({ error: null }));
const mockFrom = vitest.fn(() => ({ delete: () => ({ eq: mockDelete, neq: mockDelete, not: mockDelete }), upsert: mockBatchUpsert }));
const mockGetAdminClient = vitest.fn(() => ({ from: mockFrom }));
const mockCheckConnection = vitest.fn(async () => true);
const mockIsConfigured = vitest.fn(() => true);

vitest.mock('../services/supabase/supabaseService.js', () => ({
  isSupabaseConfigured: mockIsConfigured,
  checkConnection: mockCheckConnection,
  batchUpsert: mockBatchUpsert,
  getAdminClient: mockGetAdminClient,
  getChangesSince: vitest.fn(),
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
});
