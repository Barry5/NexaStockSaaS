import { describe, expect, it, beforeAll, afterAll, vi, vi as vitest } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tempDir: string;
let db: any;
let svc: any;
let coherenceSvc: any;

const mockData: Record<string, any[]> = {};
const mockFrom = vitest.fn((table: string) => {
  const rows = mockData[table] || [];
  return {
    select: (cols: string | null, opts?: any) => {
      if (opts?.head) return Promise.resolve({ count: rows.length, error: null });
      return { range: (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }) };
    },
    delete: () => ({ not: () => { mockData[table] = []; return Promise.resolve({ error: null }); }, neq: () => { mockData[table] = []; return Promise.resolve({ error: null }); }, eq: () => { mockData[table] = []; return Promise.resolve({ error: null }); } }),
    insert: (records: any[]) => { mockData[table] = [...(mockData[table] || []), ...records]; return Promise.resolve({ error: null }); },
  };
});
const mockGetAdminClient = vitest.fn(() => ({ from: mockFrom }));

vitest.mock('../services/supabase/supabaseService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  isSupabaseConfigured: vitest.fn(() => true),
  checkConnection: vitest.fn(async () => true),
  countRemoteRows: async (table: string) => ({ count: (mockData[table] || []).length, error: null }),
  getAdminClient: mockGetAdminClient,
}));

describe('adminBackupService : sauvegardes SQLite / Supabase + restauration sécurisée', () => {
  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexastock-backup-admin-'));
    process.env.DB_PATH = path.join(tempDir, 'database.db');
    process.env.BACKUP_DIR = path.join(tempDir, 'backups');
    process.env.SNAPSHOT_PATH = path.join(tempDir, 'snapshot.json');

    const dbModule = await import('../database/db.js');
    db = dbModule.default;
    const init = await import('../database/init.js');
    init.initializeDatabase();
    svc = await import('./adminBackupService.js');
    coherenceSvc = await import('./coherenceService.js');

    const now = new Date().toISOString();
    db.prepare(`INSERT OR IGNORE INTO tenants (id, name, plan, currency, createdAt) VALUES (?, ?, ?, ?, ?)`).run('t-b1', 'Tenant B1', 'Free', 'EUR', now);
    db.prepare(`INSERT INTO products (id, name, sku, category, buyPrice, sellPrice, quantity, tenantId, createdAt, updatedAt, version) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run('p-b1', 'Produit B1', 'SKU-B1', 'cat', 5, 10, 3, 't-b1', now, now, 1);
  });

  afterAll(() => {
    try { db?.close(); } catch { /* ignore */ }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('crée une sauvegarde SQLite avec checksum et métadonnées', async () => {
    const rec = await svc.createSqliteBackup('Test SQLite');
    expect(rec.id).toContain('sqlite-backup-');
    expect(rec.checksum.length).toBe(64);
    expect(rec.status).toBe('ok');
    expect(rec.size).toBeGreaterThan(0);
    expect(fs.existsSync(rec.filePath)).toBe(true);

    const list = svc.listBackups();
    expect(list.some(b => b.id === rec.id)).toBe(true);
  });

  it('vérifie le checksum et l\'intégrité d\'une sauvegarde SQLite', () => {
    const rec = svc.listBackups().find(b => b.type === 'sqlite')!;
    const res = svc.verifyBackup(rec.id);
    expect(res.ok).toBe(true);
    expect(res.checksumMatch).toBe(true);
    expect(res.integrity).toBe('ok');
  });

  it('refuse la suppression de la dernière sauvegarde SQLite', () => {
    const rec = svc.listBackups().find(b => b.type === 'sqlite')!;
    const res = svc.deleteBackup(rec.id);
    expect(res.refused).toBe(true);
    expect(res.removed).toBe(false);
  });

  it('crée une sauvegarde Supabase (dump JSON) et la vérifie', async () => {
    mockData['products'] = [{ id: 'uuid-b1', legacy_id: 'p-b1', name: 'Produit B1' }];
    const rec = await svc.createSupabaseBackup('Test Supabase');
    expect(rec.type).toBe('supabase');
    expect(fs.existsSync(rec.filePath)).toBe(true);
    const payload = JSON.parse(fs.readFileSync(rec.filePath, 'utf8'));
    expect(payload.format).toBe('nexastock-supabase-backup');
    expect(payload.tableCounts.products).toBe(1);

    const res = svc.verifyBackup(rec.id);
    expect(res.ok).toBe(true);
    expect(res.integrity).toContain('json_ok');
  });

  it('restaure une sauvegarde SQLite : sauvegarde de sécurité + cohérence avant/après + intégrité', async () => {
    // 1. Sauvegarde de l'état avec 1 produit
    const backup = await svc.createSqliteBackup('Avant modif');
    // 2. On modifie la base locale
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO products (id, name, sku, category, buyPrice, sellPrice, quantity, tenantId, createdAt, updatedAt, version) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run('p-b2', 'Produit B2 (après backup)', 'SKU-B2', 'cat', 5, 10, 1, 't-b1', now, now, 1);
    expect((db.prepare(`SELECT COUNT(*) as c FROM products`).get() as any).c).toBe(2);

    // 3. Restauration sécurisée
    const report = await svc.restoreSqliteBackup(backup.id);
    expect(report.success).toBe(true);
    expect(report.verified).toBe(true);
    expect(report.safetyBackupId).toBeDefined();
    expect(report.integrity?.ok).toBe(true);
    expect(report.coherenceBefore).toBeDefined();
    expect(report.coherenceAfter).toBeDefined();

    // 4. L'état local correspond au backup (1 produit : p-b1), p-b2 absent
    const ids = (db.prepare(`SELECT id FROM products`).all() as any[]).map(r => r.id);
    expect(ids).toContain('p-b1');
    expect(ids).not.toContain('p-b2');

    // 5. La sauvegarde de sécurité existe dans le registre
    const safety = svc.getBackup(report.safetyBackupId as string);
    expect(safety).toBeDefined();
    expect(safety.label).toContain('sécurité');
  });

  it('restaure une sauvegarde Supabase : vidage + ré-insertion depuis le dump', async () => {
    mockData['products'] = [{ id: 'uuid-b1', legacy_id: 'p-b1', name: 'Produit B1' }];
    const now = new Date().toISOString();
    const backup = await svc.createSupabaseBackup('Avant supabase');
    expect(backup.type).toBe('supabase');

    // On altère le "cloud" avec une ligne fantôme
    mockData['products'].push({ id: 'ghost', legacy_id: 'ghost', name: 'Ghost' });

    const report = await svc.restoreSupabaseBackup(backup.id);
    expect(report.success).toBe(true);
    expect(report.verified).toBe(true);
    expect(report.safetyBackupId).toBeDefined();
    expect(report.coherenceBefore).toBeDefined();
    expect(report.coherenceAfter).toBeDefined();
    expect(report.tables.restored).toBeGreaterThan(0);

    // La ligne fantôme a été vidée et le contenu du backup ré-écrit
    const ghost = mockData['products'].find((p: any) => p.legacy_id === 'ghost');
    expect(ghost).toBeUndefined();
    // La table a bien été vidée puis ré-approvisionnée depuis le dump
    expect(mockData['products'].length).toBe(1);
    expect(mockData['products'][0].legacy_id).toBe('p-b1');
  });

  it('restaure Supabase avec les tables à clé naturelle (module_definitions key, global_saas_settings id INTEGER)', async () => {
    const keys = (db.prepare(`SELECT key FROM module_definitions`).all() as any[]).map((r: any) => r.key);
    mockData['module_definitions'] = keys.map(k => ({ key: k, label: k }));
    mockData['global_saas_settings'] = [{ id: 1, trial_days: 14 }];
    mockData['products'] = [{ id: 'uuid-b1', legacy_id: 'p-b1', name: 'Produit B1' }];

    const backup = await svc.createSupabaseBackup('Avant supabase clés naturelles');

    // Drift : lignes en plus côté "cloud" (module sans key, gss avec un id illégal)
    mockData['module_definitions'].push({ key: 'ghost-mod', label: 'Ghost' });
    mockData['global_saas_settings'].push({ id: 999, trial_days: 30 });

    const report = await svc.restoreSupabaseBackup(backup.id);
    expect(report.success).toBe(true);
    expect(mockData['module_definitions'].length).toBe(keys.length);
    expect(mockData['module_definitions'].find((m: any) => m.key === 'ghost-mod')).toBeUndefined();
    expect(mockData['global_saas_settings'].length).toBe(1);
    expect(mockData['global_saas_settings'][0].id).toBe(1);
  });
});
