import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let db: any;
let pricingPlanService: any;
let tenantService: any;
let moduleService: any;
let invoiceService: any;
let rbacService: any;
let transform: any;
let tempDir: string;

function queueRows(table: string, op?: string): any[] {
  const rows = db.prepare(
    `SELECT * FROM sync_queue WHERE table_name = ? ${op ? 'AND operation = ?' : ''} ORDER BY created_at ASC, rowid ASC`
  ).all(op ? [table, op] : [table]) as any[];
  return rows;
}

function lastQueueRow(table: string, op?: string): any | undefined {
  const rows = queueRows(table, op);
  return rows[rows.length - 1];
}

describe('enregistrement systématique des écritures pour la synchronisation', () => {
  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexastock-sync-'));
    process.env.DB_PATH = path.join(tempDir, 'database.db');
    process.env.BACKUP_DIR = path.join(tempDir, 'backups');
    process.env.SNAPSHOT_PATH = path.join(tempDir, 'snapshot.json');

    const dbModule = await import('../../database/db.js');
    db = dbModule.default;
    const init = await import('../../database/init.js');
    init.initializeDatabase();

    ({ pricingPlanService } = await import('./pricingPlanService.js'));
    ({ tenantService } = await import('./tenantService.js'));
    ({ moduleService } = await import('./moduleService.js'));
    ({ invoiceService } = await import('./invoiceService.js'));
    ({ rbacService } = await import('./rbacService.js'));
    ({ transformToPostgres: transform } = await import('../supabase/transform.js'));
  });

  afterAll(() => {
    try {
      db?.close();
    } catch { /* ignore */ }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  it('crée / met à jour / supprime un forfait avec enregistrement sync à chaque étape', () => {
    const plan = pricingPlanService.create({
      name: 'Plan Test', description: 'Forfait de test', price: 12.5, currency: 'EUR',
      durationDays: 30, features: ['Ventes illimitées'], limits: { maxProducts: 500, maxSales: 9999, maxCustomers: 200, maxUsers: 5 },
      color: 'cyan', displayOrder: 10, active: true,
    });
    expect(plan.id).toBeTruthy();
    expect(plan.features).toEqual(['Ventes illimitées']);
    expect(plan.active).toBe(true);

    const create = lastQueueRow('pricing_plans', 'CREATE');
    expect(create).toBeTruthy();
    expect(JSON.parse(create.payload).legacy_id).toBe(plan.id);

    const updated = pricingPlanService.update(plan.id, { price: 19.99, active: false });
    expect(updated.price).toBe(19.99);
    expect(updated.active).toBe(false);
    const update = lastQueueRow('pricing_plans', 'UPDATE');
    expect(update).toBeTruthy();
    expect(update.payload).toContain('19.99');

    expect(pricingPlanService.remove(plan.id)).toBe(true);
    const del = lastQueueRow('pricing_plans', 'DELETE');
    expect(del).toBeTruthy();
    expect(del.record_id).toBe(plan.id);
  });

  it('bloque la suppression d\'un forfait utilisé par une entreprise', () => {
    db.prepare(`INSERT INTO tenants (id, name, email, plan, subscriptionStatus, createdAt, updatedAt) VALUES ('t-test-1', 'Test Co', 't@test.com', 'Free', 'ACTIVE', ?, ?)`)
      .run(new Date().toISOString(), new Date().toISOString());
    const freePlan = db.prepare(`SELECT id FROM pricing_plans WHERE name = 'Free'`).get() as { id: string };
    expect(() => pricingPlanService.remove(freePlan.id)).toThrow(/entreprise/);
  });

  it('enregistre les modifications des paramètres globaux SaaS', () => {
    tenantService.updateSettings({ trialDays: 21, gracePeriodDays: 7, revertToPlanOnExpiry: 'ReadOnly' });
    const row = lastQueueRow('global_saas_settings', 'UPDATE');
    expect(row).toBeTruthy();
    expect(row.payload).toContain('"trialDays":21');
  });

  it('enregistre les overrides de modules par entreprise (tenant_modules)', () => {
    moduleService.setTenantModuleOverride('t-test-1', 'products', false);
    const row = lastQueueRow('tenant_modules', 'CREATE');
    expect(row).toBeTruthy();
    expect(row.payload).toContain('"enabled":false');
    moduleService.setTenantModuleOverride('t-test-1', 'products', true);
    const row2 = lastQueueRow('tenant_modules', 'UPDATE');
    expect(row2).toBeTruthy();
  });

  it('enregistre les paiements de facture (payments) et leurs traces (invoice_audit_log)', () => {
    db.prepare(`INSERT INTO invoices (id, invoiceNumber, type, date, total, paidAmount, status, deliveryStatus, paymentStatus, tenantId, createdAt, updatedAt)
      VALUES ('inv-test-1', 'FAC-TEST-1', 'sale', ?, 100, 0, 'validated', 'not_delivered', 'unpaid', 't-test-1', ?, ?)`)
      .run(new Date().toISOString(), new Date().toISOString(), new Date().toISOString());

    const payment = invoiceService.recordPayment('inv-test-1', { amount: 40, method: 'cash', reference: 'REF-1' }, 'u-1', 'Superadmin');
    expect(payment.id).toBeTruthy();

    const pay = lastQueueRow('payments', 'CREATE');
    expect(pay).toBeTruthy();
    expect(pay.payload).toContain('"amount":40');

    const audit = lastQueueRow('invoice_audit_log', 'CREATE');
    expect(audit).toBeTruthy();
    expect(audit.payload).toContain('PAYMENT_RECORDED');

    const invoiceUpdate = lastQueueRow('invoices', 'UPDATE');
    expect(invoiceUpdate).toBeTruthy();
    expect(invoiceUpdate.payload).toContain('"paidAmount":40');
  });

  it('enregistre les permissions de rôles (role_permissions) et les mises à jour de rôles', () => {
    db.prepare(`INSERT INTO roles (id, name, label, description, is_system, tenantId, createdAt) VALUES ('role-test-1', 'test_role', 'Test Role', NULL, 0, 't-test-1', ?)`)
      .run(new Date().toISOString());
    rbacService.updateRolePermissions('role-test-1', { 'products.view': true });
    const rp = lastQueueRow('role_permissions', 'CREATE');
    expect(rp).toBeTruthy();
    expect(rp.payload).toContain('"roleId":"role-test-1"');
    expect(rp.payload).toContain('"permissionId":"perm-products-view"');

    rbacService.updateRole('role-test-1', { label: 'Test Role V2' });
    const role = lastQueueRow('roles', 'UPDATE');
    expect(role).toBeTruthy();
    expect(role.payload).toContain('Test Role V2');
  });

  it('enregistre les traces d\'audit des entreprises réelles, jamais pour le pseudo-tenant superadmin', () => {
    tenantService.updateTenantStatus('t-test-1', 'SUSPENDED');
    const audit = lastQueueRow('audit_logs', 'CREATE');
    expect(audit).toBeTruthy();
    expect(audit.payload).toContain('TENANT_SUSPENDED');

    const superadminAudits = db.prepare(`SELECT COUNT(*) as c FROM sync_queue WHERE table_name = 'audit_logs' AND payload LIKE '%"tenantId":"superadmin"%'`).get() as { c: number };
    expect(superadminAudits.c).toBe(0);
  });

  it('transforme correctement les payloads vers PostgreSQL (FK mappées, booléens, JSONB)', () => {
    const tAudit = transform('audit_logs', {
      id: 'aud-x', timestamp: new Date().toISOString(), userId: 'system', userName: 'system',
      action: 'X', details: 'y', tenantId: 't-test-1', legacy_id: 'aud-x',
    }) as any;
    expect(tAudit.user_id).toBe('system');

    const tPlan = transform('pricing_plans', {
      id: 'plan-x', name: 'P', price: 10, currency: 'EUR', features: ['a'], limits: { maxProducts: 1 },
      active: true, legacy_id: 'plan-x',
    }) as any;
    expect(tPlan.features).toEqual(['a']);
    expect(tPlan.active).toBe(true);
    expect(tPlan.legacy_id).toBe('plan-x');
  });
});
