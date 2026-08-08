import { describe, expect, it, beforeAll, afterAll, vi, vi as vitest } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tempDir: string;
let db: any;
let coherenceService: any;

// Tables simulées côté Supabase : comptes et lignes contrôlables par test.
const mockData: Record<string, any[]> = {};
let mockReachable = true;

const mockFrom = vitest.fn((table: string) => {
  const rows = mockData[table] || [];
  return {
    select: (cols: string | null, opts?: any) => {
      if (opts?.head) {
        return Promise.resolve({ count: rows.length, error: mockReachable ? null : { message: 'network down' } });
      }
      return {
        range: (from: number, to: number) =>
          Promise.resolve({
            data: mockReachable ? rows.slice(from, to + 1) : [],
            error: mockReachable ? null : { message: 'network down' },
          }),
      };
    },
    delete: () => ({ not: () => Promise.resolve({ error: null }), neq: () => Promise.resolve({ error: null }), eq: () => Promise.resolve({ error: null }) }),
    insert: () => Promise.resolve({ error: null }),
  };
});
const mockGetAdminClient = vitest.fn(() => ({ from: mockFrom }));

vitest.mock('../services/supabase/supabaseService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  isSupabaseConfigured: vitest.fn(() => true),
  checkConnection: vitest.fn(async () => true),
  countRemoteRows: async (table: string) => {
    const rows = mockData[table] || [];
    return { count: mockReachable ? rows.length : null, error: mockReachable ? null : { message: 'network down' } };
  },
  getAdminClient: mockGetAdminClient,
}));

describe('coherenceService : contrôle SQLite <-> Supabase', () => {
  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexastock-coherence-'));
    process.env.DB_PATH = path.join(tempDir, 'database.db');
    process.env.BACKUP_DIR = path.join(tempDir, 'backups');
    process.env.SNAPSHOT_PATH = path.join(tempDir, 'snapshot.json');

    const dbModule = await import('../database/db.js');
    db = dbModule.default;
    const init = await import('../database/init.js');
    init.initializeDatabase();
    ({ runCoherenceCheck: coherenceService } = await import('./coherenceService.js'));

    // Données locales de test
    const now = new Date().toISOString();
    db.prepare(`INSERT OR IGNORE INTO tenants (id, name, plan, currency, createdAt) VALUES (?, ?, ?, ?, ?)`).run('t-c1', 'Tenant C1', 'Free', 'EUR', now);
    db.prepare(`INSERT INTO products (id, name, sku, category, buyPrice, sellPrice, quantity, tenantId, createdAt, updatedAt, version) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run('p-c1', 'Produit 1', 'SKU1', 'cat', 5, 10, 3, 't-c1', now, now, 1);
    db.prepare(`INSERT INTO products (id, name, sku, category, buyPrice, sellPrice, quantity, tenantId, createdAt, updatedAt, version) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run('p-c2', 'Produit 2', 'SKU2', 'cat', 5, 10, 7, 't-c1', now, now, 1);
  });

  afterAll(() => {
    try { db?.close(); } catch { /* ignore */ }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('rapporte OK quand comptes et versions correspondent', async () => {
    mockReachable = true;
    mockData['products'] = [
      { id: 'uuid-1', legacy_id: 'p-c1', version: 1, updated_at: new Date().toISOString() },
      { id: 'uuid-2', legacy_id: 'p-c2', version: 1, updated_at: new Date().toISOString() },
    ];
    const report = await coherenceService({ deep: true });
    const products = report.tables.find((t: any) => t.table === 'products');
    expect(products).toBeDefined();
    expect(products.status).toBe('ok');
    expect(products.sqliteCount).toBe(2);
    expect(products.supabaseCount).toBe(2);
    expect(report.summary.checked).toBeGreaterThan(0);
  });

  it('détecte un écart de comptage -> incoherent', async () => {
    mockReachable = true;
    mockData['products'] = [
      { id: 'uuid-1', legacy_id: 'p-c1', version: 1, updated_at: new Date().toISOString() },
    ];
    const report = await coherenceService({ deep: false });
    const products = report.tables.find((t: any) => t.table === 'products');
    expect(products.status).toBe('incoherent');
    expect(products.localOnlyCount).toBe(1);
    expect(products.cause).toContain('Écarts inexpliqués');
  });

  it('classe en pending un écart expliqué par une création en attente', async () => {
    mockReachable = true;
    // Les lignes déjà synchronisées sont présentes côté cloud : seul p-c3
    // (création locale en attente) apparaît uniquement en local.
    const now = new Date().toISOString();
    mockData['products'] = [
      { id: 'uuid-1', legacy_id: 'p-c1', version: 1, updated_at: now },
      { id: 'uuid-2', legacy_id: 'p-c2', version: 1, updated_at: now },
    ];
    // Nouvelle création locale en attente de poussée
    db.prepare(`INSERT INTO products (id, name, sku, category, buyPrice, sellPrice, quantity, tenantId, createdAt, updatedAt, version) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run('p-c3', 'Produit 3', 'SKU3', 'cat', 5, 10, 1, 't-c1', now, now, 1);
    db.prepare(`INSERT INTO sync_changelog (id, table_name, record_id, operation, new_values, old_version, new_version, created_at, pushed_to_supabase, status, retry_count, max_retries) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run('chg-c3', 'products', 'p-c3', 'CREATE', JSON.stringify({ id: 'p-c3' }), 0, 1, now, 0, 'pending', 0, 10);

    const report = await coherenceService({ deep: false });
    const products = report.tables.find((t: any) => t.table === 'products');
    expect(products).toBeDefined();
    expect(products.pendingCreates).toBeGreaterThanOrEqual(1);
    expect(products.localOnlyCount).toBe(1);
    expect(products.explainedByPending).toBe(true);
  });

  it('marque les tables unknown quand Supabase est injoignable', async () => {
    mockReachable = false;
    const report = await coherenceService({ deep: false });
    expect(report.supabaseReachable).toBe(false);
    const products = report.tables.find((t: any) => t.table === 'products');
    expect(products.status).toBe('unknown');
    mockReachable = true;
  });

  it('compare module_definitions par clé key (table sans colonne id)', async () => {
    mockReachable = true;
    const keys = (db.prepare(`SELECT key FROM module_definitions`).all() as any[]).map((r: any) => r.key);
    mockData['module_definitions'] = keys.map(k => ({ key: k }));
    const report = await coherenceService({ deep: true });
    const md = report.tables.find((t: any) => t.table === 'module_definitions');
    expect(md).toBeDefined();
    expect(md.status).toBe('ok');
    expect(md.supabaseCount).toBe(keys.length);
    expect(md.localOnlyCount).toBe(0);
    expect(md.remoteOnlyCount).toBe(0);
  });

  it('compare global_saas_settings par id sans legacy_id (pas de faux localOnly)', async () => {
    mockReachable = true;
    const gssLocal = db.prepare(`SELECT id, updatedAt FROM global_saas_settings`).get() as any;
    mockData['global_saas_settings'] = [{ id: gssLocal.id, updated_at: gssLocal.updatedAt }];
    const report = await coherenceService({ deep: true });
    const gss = report.tables.find((t: any) => t.table === 'global_saas_settings');
    expect(gss).toBeDefined();
    expect(gss.status).toBe('ok');
    expect(gss.localOnlyCount).toBe(0);
    expect(gss.versionMismatchCount).toBe(0);
  });

  it('compte gdrive_tokens sur tenant_id (table sans colonne id)', async () => {
    mockReachable = true;
    mockData['gdrive_tokens'] = [];
    const report = await coherenceService({ deep: true });
    const gd = report.tables.find((t: any) => t.table === 'gdrive_tokens');
    expect(gd).toBeDefined();
    expect(gd.supabaseCount).toBe(0);
    expect(gd.status).not.toBe('unknown');
  });

  it('traduit les ids locaux via sync_uuid_map (plan_modules pm-* -> UUID PG)', async () => {
    mockReachable = true;
    const localPm = (db.prepare(`SELECT id FROM plan_modules`).all() as any[]);
    // PG tient des UUID distincts des ids locaux ; la correspondance est
    // enregistrée dans sync_uuid_map par le moteur de synchronisation.
    mockData['plan_modules'] = localPm.map((r: any, i: number) => ({ id: `pg-uuid-${i}` }));
    for (const [i, r] of localPm.entries()) {
      db.prepare(`INSERT OR REPLACE INTO sync_uuid_map (sqlite_id, pg_uuid, created_at) VALUES (?, ?, ?)`)
        .run(r.id, `pg-uuid-${i}`, new Date().toISOString());
    }
    const report = await coherenceService({ deep: true });
    const pm = report.tables.find((t: any) => t.table === 'plan_modules');
    expect(pm).toBeDefined();
    expect(pm.status).toBe('ok');
    expect(pm.localOnlyCount).toBe(0);
    expect(pm.remoteOnlyCount).toBe(0);
    expect(pm.supabaseCount).toBe(localPm.length);
  });
});
