import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let db: any;
let getTenantAvailableModules: any;
let getEffectivePlanId: any;
let tempDir: string;

describe('résolution du plan d\'abonnement pour l\'accès aux modules', () => {
  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexastock-tenantaccess-'));
    process.env.DB_PATH = path.join(tempDir, 'database.db');
    process.env.BACKUP_DIR = path.join(tempDir, 'backups');
    process.env.SNAPSHOT_PATH = path.join(tempDir, 'snapshot.json');

    const dbModule = await import('../database/db.js');
    db = dbModule.default;
    const init = await import('../database/init.js');
    init.initializeDatabase();

    ({ getTenantAvailableModules, getEffectivePlanId } = await import('./tenantAccess.js'));
  });

  afterAll(() => {
    try {
      db?.close();
    } catch { /* ignore */ }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  it('résout le plan par subscriptionPlanId quand il est défini', () => {
    expect(getEffectivePlanId({ subscriptionPlanId: 'plan-free' })).toBe('plan-free');
  });

  it('résout le plan par nom quand subscriptionPlanId est NULL', () => {
    expect(getEffectivePlanId({ subscriptionPlanId: null, plan: 'Free' })).toBe('plan-free');
    expect(getEffectivePlanId({ plan: 'Premium' })).toBe('plan-premium');
  });

  it('retourne null quand aucun plan n\'est résolvable', () => {
    expect(getEffectivePlanId({ subscriptionPlanId: null, plan: 'Inconnu' })).toBeNull();
    expect(getEffectivePlanId({})).toBeNull();
  });

  it('retourne les modules du plan par nom quand subscriptionPlanId est NULL', () => {
    db.prepare(
      `INSERT INTO tenants (id, name, email, plan, subscriptionStatus, createdAt, updatedAt)
       VALUES ('t-menu-1', 'Menu Co', 'menu@test.com', 'Free', 'ACTIVE', ?, ?)`
    ).run(new Date().toISOString(), new Date().toISOString());

    const modules = getTenantAvailableModules('t-menu-1');
    expect(modules).toContain('dashboard');
    expect(modules).toContain('sales');
    expect(modules).toContain('products');
    expect(modules).toContain('invoices');
    expect(modules).not.toContain('ai');
  });

  it('retourne le fallback dashboard+sales quand aucun plan n\'est résolvable', () => {
    db.prepare(
      `INSERT INTO tenants (id, name, email, plan, subscriptionStatus, createdAt, updatedAt)
       VALUES ('t-menu-2', 'Orphelin', 'orphelin@test.com', 'Inconnu', 'ACTIVE', ?, ?)`
    ).run(new Date().toISOString(), new Date().toISOString());

    expect(getTenantAvailableModules('t-menu-2')).toEqual(['dashboard', 'sales']);
  });

  it('respecte les overrides tenant_modules même avec plan résolu par nom', () => {
    db.prepare(
      `INSERT INTO tenant_modules (id, tenantId, moduleKey, enabled) VALUES ('tm-menu-1', 't-menu-1', 'products', 0)`
    ).run();

    const modules = getTenantAvailableModules('t-menu-1');
    expect(modules).not.toContain('products');
  });
});
