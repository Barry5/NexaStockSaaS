import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let db: any;
let wipeLocalData: any;
let tempDir: string;

describe('wipeLocalData : purge complète en conservant le seed système', () => {
  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexastock-wipe-'));
    process.env.DB_PATH = path.join(tempDir, 'database.db');
    process.env.BACKUP_DIR = path.join(tempDir, 'backups');
    process.env.SNAPSHOT_PATH = path.join(tempDir, 'snapshot.json');

    const dbModule = await import('../database/db.js');
    db = dbModule.default;
    const init = await import('../database/init.js');
    init.initializeDatabase();

    ({ wipeLocalData } = await import('./sync.js'));
  });

  afterAll(() => {
    try { db?.close(); } catch { /* ignore */ }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('supprime les données métier (tenant, user, produit, vente) et la file de sync', () => {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO tenants (id, name, email, plan, subscriptionStatus, createdAt, updatedAt) VALUES ('t-1', 'Test', 't@t.com', 'Free', 'ACTIVE', ?, ?)`).run(now, now);
    db.prepare(`INSERT INTO users (id, name, email, role, tenantId, active, createdAt) VALUES ('u-2', 'Alice', 'a@a.com', 'owner', 't-1', 1, ?)`).run(now);
    db.prepare(`INSERT INTO products (id, name, sku, category, buyPrice, sellPrice, quantity, tenantId, createdAt) VALUES ('p-1', 'Prod', 'S1', 'Cat', 10, 15, 5, 't-1', ?)`).run(now);
    db.prepare(`INSERT INTO sync_queue (id, table_name, record_id, operation, payload, created_at, status) VALUES ('q-1', 'products', 'p-1', 'CREATE', '{}', ?, 'pending')`).run(now);

    const result = wipeLocalData();

    expect(result.tablesCleared).toBe(35);
    expect(db.prepare('SELECT COUNT(*) as c FROM tenants').get().c).toBe(0);
    expect(db.prepare('SELECT COUNT(*) as c FROM products').get().c).toBe(0);
    expect(db.prepare('SELECT COUNT(*) as c FROM sync_queue').get().c).toBe(0);
  });

  it('conserve le superadmin, les rôles, les forfaits, les paramètres et les modules', () => {
    const superadmin = db.prepare("SELECT COUNT(*) as c FROM users WHERE id = 'u-1'").get().c;
    const roles = db.prepare('SELECT COUNT(*) as c FROM roles').get().c;
    const plans = db.prepare('SELECT COUNT(*) as c FROM pricing_plans').get().c;
    const settings = db.prepare('SELECT COUNT(*) as c FROM global_saas_settings').get().c;
    const modules = db.prepare('SELECT COUNT(*) as c FROM module_definitions').get().c;
    const planModules = db.prepare('SELECT COUNT(*) as c FROM plan_modules').get().c;

    expect(superadmin).toBe(1);
    expect(roles).toBeGreaterThan(0);
    expect(plans).toBe(3);
    expect(settings).toBe(1);
    expect(modules).toBeGreaterThan(0);
    expect(planModules).toBeGreaterThan(0);
  });

  it('ne conserve aucun utilisateur non superadmin', () => {
    const otherUsers = db.prepare("SELECT COUNT(*) as c FROM users WHERE id != 'u-1'").get().c;
    expect(otherUsers).toBe(0);
  });
});
