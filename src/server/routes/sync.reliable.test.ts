import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tempDir: string;
let db: any;
let syncEngine: any;
let buildStateChanges: any;
let SupabaseWorker: any;
let syncEngineModule: any;

// Mock de Supabase : aucun réseau en test.
vi.mock('../services/supabase/supabaseService.js', () => ({
  isSupabaseConfigured: vi.fn(() => false),
  checkConnection: vi.fn(async () => false),
  batchUpsert: vi.fn(async () => ({ success: 0, errors: [] })),
  getAdminClient: vi.fn(() => ({ from: () => ({}) })),
  getChangesSince: vi.fn(),
  getChangesSinceByCreatedAt: vi.fn(async () => ({ data: [], error: null })),
}));

describe('Fiabilisation Phase 3/4 : full-state versionné, LWW, lock worker', () => {
  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexastock-reliable-'));
    process.env.DB_PATH = path.join(tempDir, 'database.db');
    process.env.BACKUP_DIR = path.join(tempDir, 'backups');
    process.env.SNAPSHOT_PATH = path.join(tempDir, 'snapshot.json');

    const dbModule = await import('../database/db.js');
    db = dbModule.default;
    const init = await import('../database/init.js');
    init.initializeDatabase();

    const now = new Date().toISOString();
    db.prepare(`INSERT OR IGNORE INTO tenants (id, name, plan, currency, createdAt) VALUES (?, ?, ?, ?, ?)`).run('t-1', 'Test', 'Free', 'EUR', now);

    ({ syncEngine } = await import('../sync/syncEngine.js'));
    syncEngineModule = await import('../sync/syncEngine.js');
    ({ buildStateChanges } = await import('./sync.js'));
    ({ SupabaseWorker } = await import('../sync/supabaseWorker.js'));
  });

  afterAll(() => {
    try { db?.close(); } catch { /* ignore */ }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('C1 corrigé : un full-state partiel ne génère AUCUN DELETE inféré (fin de la suppression de masse)', () => {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO products (id, name, sku, category, buyPrice, sellPrice, quantity, tenantId, createdAt, version) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run('p-keep', 'Gardé', 'K1', 'Cat', 1, 2, 3, 't-1', now, 1);
    db.prepare(`INSERT INTO products (id, name, sku, category, buyPrice, sellPrice, quantity, tenantId, createdAt, version) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run('p-ghost', 'Fantôme', 'G1', 'Cat', 1, 2, 3, 't-1', now, 1);

    // Le client n'envoie QUE p-keep : le serveur ne doit PAS en déduire la
    // suppression de p-ghost (ancien comportement enqueueStateDeletions).
    const changes = buildStateChanges({ products: [{ id: 'p-keep', name: 'Gardé', version: 1 }] });

    const deleteOps = changes.filter((c: any) => c.operation === 'DELETE');
    expect(deleteOps.length).toBe(0);

    syncEngine.pushChanges(changes);
    const ghost = db.prepare(`SELECT COUNT(*) as c FROM products WHERE id = 'p-ghost'`).get() as { c: number };
    expect(ghost.c).toBe(1);
  });

  it('LWW par version : un snapshot client périmé ne peut pas régresser l\'état local', () => {
    const now = new Date().toISOString();
    // État local récent : version 5
    db.prepare(`INSERT INTO customers (id, name, email, phone, loyaltyPoints, outstandingDebt, tenantId, createdAt, updatedAt, version) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run('c-lww', 'Local Récent', 'l@l.com', null, 0, 0, 't-1', now, now, 5);

    // Snapshot périmé (version 2) : ne doit PAS écraser
    const stale = syncEngine.pushChanges([{
      table: 'customers', recordId: 'c-lww', operation: 'UPDATE',
      data: { id: 'c-lww', name: 'Nom PÉRIMÉ', version: 2 }, version: 2,
    }]);
    expect(stale.conflicts.some((c: any) => c.strategy === 'server_wins')).toBe(true);

    const afterStale = db.prepare(`SELECT name, version FROM customers WHERE id = 'c-lww'`).get() as any;
    expect(afterStale.name).toBe('Local Récent');
    expect(afterStale.version).toBe(5);

    // Snapshot plus récent (version 7) : doit s'appliquer
    const fresh = syncEngine.pushChanges([{
      table: 'customers', recordId: 'c-lww', operation: 'UPDATE',
      data: { id: 'c-lww', name: 'Nom RÉCENT', version: 7 }, version: 7,
    }]);
    expect(fresh.conflicts.length).toBe(0);

    const afterFresh = db.prepare(`SELECT name, version FROM customers WHERE id = 'c-lww'`).get() as any;
    expect(afterFresh.name).toBe('Nom RÉCENT');
    expect(afterFresh.version).toBe(8);
  });

  it('suppressions EXPLICITES du client : propagées localement et journalisées (tombstone)', () => {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO suppliers (id, name, contactName, phone, email, tenantId, createdAt, version) VALUES (?,?,?,?,?,?,?,?)`)
      .run('s-exp', 'Fournisseur', null, null, null, 't-1', now, 1);

    const result = syncEngine.pushChanges([{ table: 'suppliers', recordId: 's-exp', operation: 'DELETE', data: { id: 's-exp' }, version: 1 }]);

    expect(result.applied).toBe(1);
    expect(db.prepare(`SELECT COUNT(*) as c FROM suppliers WHERE id = 's-exp'`).get().c).toBe(0);
    const delLog = db.prepare(`SELECT * FROM sync_deletions WHERE table_name = 'suppliers' AND record_id = 's-exp'`).get() as any;
    expect(delLog).toBeDefined();
    const chg = db.prepare(`SELECT * FROM sync_changelog WHERE table_name = 'suppliers' AND record_id = 's-exp' AND operation = 'DELETE'`).get() as any;
    expect(chg).toBeDefined();
  });

  it('lock multi-process : un seul worker actif, lock orphelin récupérable', async () => {
    const w1 = new SupabaseWorker();
    await w1.start();
    expect(fs.existsSync(path.join(tempDir, '.supabase-worker.lock'))).toBe(true);

    // Second worker : doit refuser de démarrer (pas d'interval)
    const w2 = new SupabaseWorker();
    await w2.start();
    expect((w2 as any).intervalId).toBeNull();
    expect((w1 as any).intervalId).not.toBeNull();

    // Libération du lock
    w1.stop();
    expect(fs.existsSync(path.join(tempDir, '.supabase-worker.lock'))).toBe(false);

    // Lock orphelin (mtime vieux de 2 h) : récupéré par un nouveau worker
    fs.writeFileSync(path.join(tempDir, '.supabase-worker.lock'), '{}');
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    fs.utimesSync(path.join(tempDir, '.supabase-worker.lock'), old, old);
    const w3 = new SupabaseWorker();
    await w3.start();
    expect((w3 as any).intervalId).not.toBeNull();
    w3.stop();
  });

  it('purge 30 j : les items failed/dead anciens sont supprimés, les récents conservés', () => {
    const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const recentDate = new Date().toISOString();
    db.prepare(`INSERT INTO sync_queue (id, table_name, record_id, operation, payload, created_at, status) VALUES (?,?,?,?,?,?,?)`)
      .run('q-old-failed', 'products', 'p-1', 'UPDATE', '{}', oldDate, 'failed');
    db.prepare(`INSERT INTO sync_queue (id, table_name, record_id, operation, payload, created_at, status) VALUES (?,?,?,?,?,?,?)`)
      .run('q-recent-failed', 'products', 'p-2', 'UPDATE', '{}', recentDate, 'failed');
    db.prepare(`INSERT INTO sync_changelog (id, table_name, record_id, operation, new_values, old_version, new_version, created_at, pushed_to_supabase, retry_count, max_retries, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run('chg-old-dead', 'products', 'p-3', 'UPDATE', '{}', 0, 1, oldDate, 0, 10, 10, 'dead');

    syncEngineModule.syncEngine.cleanupPushedRecords();

    expect(db.prepare(`SELECT COUNT(*) as c FROM sync_queue WHERE id = 'q-old-failed'`).get().c).toBe(0);
    expect(db.prepare(`SELECT COUNT(*) as c FROM sync_queue WHERE id = 'q-recent-failed'`).get().c).toBe(1);
    expect(db.prepare(`SELECT COUNT(*) as c FROM sync_changelog WHERE id = 'chg-old-dead'`).get().c).toBe(0);
  });
});
