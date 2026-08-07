import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Régression : un changement de forfait ne doit jamais masquer les modules
// existants. Quand le forfait d'un tenant n'a aucune ligne `plan_modules`
// (ou est introuvable), l'accès doit rester complet (fail-open) au lieu de
// se réduire à ['dashboard', 'sales'].
describe('getTenantAvailableModules - fail-open sur forfait non configuré', () => {
  let db: any;
  let getTenantAvailableModules: (tenantId: string) => string[];
  let tempDir: string;

  const TS = Date.now();
  const PLAN_ID = `plan-modtest-${TS}`;
  const TENANT_ID = `t-modtest-${TS}`;
  const planName = `Plan Module Test ${TS}`;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexastock-modtest-'));
    process.env.DB_PATH = path.join(tempDir, 'database.db');
    process.env.BACKUP_DIR = path.join(tempDir, 'backups');
    process.env.SNAPSHOT_PATH = path.join(tempDir, 'snapshot.json');

    const dbModule = await import('../database/db.js');
    db = dbModule.default;
    const init = await import('../database/init.js');
    init.initializeDatabase();
    const tenantAccess = await import('./tenantAccess.js');
    getTenantAvailableModules = tenantAccess.getTenantAvailableModules;

    db.prepare(`INSERT INTO pricing_plans (id, name, price, currency, durationDays, color, active)
                VALUES (?, ?, 0, 'EUR', 30, '#000000', 1)`)
      .run(PLAN_ID, planName);
    db.prepare(`INSERT INTO tenants (id, name, plan, createdAt, subscriptionPlanId, subscriptionStatus)
                VALUES (?, ?, ?, ?, ?, 'TRIAL')`)
      .run(TENANT_ID, 'Tenant Test Modules', planName, new Date().toISOString(), PLAN_ID);
  });

  afterAll(() => {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  const clearPlanModules = () => {
    db.prepare('DELETE FROM plan_modules WHERE planId = ?').run(PLAN_ID);
  };
  const clearTenantModules = () => {
    db.prepare('DELETE FROM tenant_modules WHERE tenantId = ?').run(TENANT_ID);
  };
  const insertPlanModule = (moduleKey: string) => {
    db.prepare('INSERT OR REPLACE INTO plan_modules (id, planId, moduleKey, enabled) VALUES (?, ?, ?, 1)')
      .run(`${PLAN_ID}-pm-${moduleKey}`, PLAN_ID, moduleKey);
  };
  const insertTenantModule = (moduleKey: string, enabled: number) => {
    db.prepare('INSERT OR REPLACE INTO tenant_modules (id, tenantId, moduleKey, enabled) VALUES (?, ?, ?, ?)')
      .run(`${TENANT_ID}-tm-${moduleKey}`, TENANT_ID, moduleKey, enabled);
  };

  it('renvoie TOUS les modules quand le forfait n\'a aucune ligne plan_modules', () => {
    clearPlanModules();
    clearTenantModules();
    const modules = getTenantAvailableModules(TENANT_ID);
    expect(modules).toContain('dashboard');
    expect(modules).toContain('sales');
    expect(modules).toContain('products');
    expect(modules).toContain('invoices');
    expect(modules).toContain('customers');
  });

  it('reste restreint aux modules du forfait quand plan_modules est configuré', () => {
    clearTenantModules();
    clearPlanModules();
    insertPlanModule('products');
    insertPlanModule('customers');

    const modules = getTenantAvailableModules(TENANT_ID);
    expect(modules).toContain('products');
    expect(modules).toContain('customers');
    expect(modules).toContain('dashboard'); // core
    expect(modules).toContain('sales');     // core
    expect(modules).not.toContain('suppliers');
    expect(modules).not.toContain('warehouses');
  });

  it('respecte les overrides tenant (désactivation) en fail-open', () => {
    clearPlanModules();
    clearTenantModules();
    insertTenantModule('products', 0);

    const modules = getTenantAvailableModules(TENANT_ID);
    expect(modules).not.toContain('products');
    expect(modules).toContain('sales');
    expect(modules).toContain('dashboard');
  });

  it('renvoie tous les modules quand le planId est introuvable', () => {
    clearPlanModules();
    clearTenantModules();
    db.prepare(`UPDATE tenants SET subscriptionPlanId = NULL, plan = 'Plan inexistant' WHERE id = ?`)
      .run(TENANT_ID);

    const modules = getTenantAvailableModules(TENANT_ID);
    expect(modules).toContain('products');
    expect(modules).toContain('sales');
    expect(modules).toContain('dashboard');
  });
});
