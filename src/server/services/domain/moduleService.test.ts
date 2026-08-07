import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Régression : la configuration des modules par plan doit (1) persister côté
// SQLite et (2) être journalisée dans sync_changelog pour que le SupabaseWorker
// la pousse vers PostgreSQL (sinon le pull PG du redémarrage l'écrase).
describe('moduleService.setPlanModules - persistance + synchronisation', () => {
  let db: any;
  let moduleService: any;
  let tempDir: string;

  const TS = Date.now();
  const PLAN_ID = `plan-modsync-${TS}`;
  const planName = `Plan Module Sync ${TS}`;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexastock-modsync-'));
    process.env.DB_PATH = path.join(tempDir, 'database.db');
    process.env.BACKUP_DIR = path.join(tempDir, 'backups');
    process.env.SNAPSHOT_PATH = path.join(tempDir, 'snapshot.json');

    const dbModule = await import('../../database/db.js');
    db = dbModule.default;
    const init = await import('../../database/init.js');
    init.initializeDatabase();
    const mod = await import('./moduleService.js');
    moduleService = mod.moduleService;

    db.prepare(`INSERT INTO pricing_plans (id, name, price, currency, durationDays, color, active)
                VALUES (?, ?, 0, 'EUR', 30, '#000000', 1)`).run(PLAN_ID, planName);
  });

  afterAll(() => {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });

  const planModuleLogs = () =>
    (db.prepare(`SELECT operation, record_id, new_values FROM sync_changelog WHERE table_name = 'plan_modules' ORDER BY rowid ASC`).all() as any[])
      .filter((l: any) => (l.new_values && l.new_values.includes(PLAN_ID)) || l.record_id.includes(PLAN_ID));

  it('sauvegarde les modules ET journalise les CREATE dans sync_changelog', () => {
    const keys = ['products', 'customers', 'invoices'];
    const rows = moduleService.setPlanModules(PLAN_ID, keys);

    expect(rows.map((r: any) => r.moduleKey).sort()).toEqual([...keys].sort());
    expect(planModuleLogs().filter(l => l.operation === 'CREATE').length).toBe(3);

    // Persisté côté SQLite : un rechargement complet retrouve la config.
    const reloaded = moduleService.getPlanModules(PLAN_ID);
    expect(reloaded.map((r: any) => r.moduleKey).sort()).toEqual([...keys].sort());
  });

  it('enregistre le diff : DELETE pour le module retiré, id des lignes intactes conservées', () => {
    moduleService.setPlanModules(PLAN_ID, ['products', 'customers', 'invoices']);
    const pmId = moduleService.getPlanModules(PLAN_ID).find((r: any) => r.moduleKey === 'products').id;

    const logsBefore = planModuleLogs().length;
    moduleService.setPlanModules(PLAN_ID, ['products', 'customers']);

    const logs = planModuleLogs();
    expect(logs.length).toBe(logsBefore + 1);
    expect(logs[logs.length - 1].operation).toBe('DELETE');

    const rowsAfter = moduleService.getPlanModules(PLAN_ID);
    expect(rowsAfter.some((r: any) => r.moduleKey === 'invoices')).toBe(false);
    expect(rowsAfter.find((r: any) => r.moduleKey === 'products').id).toBe(pmId);
  });

  it('réactive un module présent en base mais désactivé (UPDATE) et le journalise', () => {
    const id = `pm-${TS}-disabled`;
    db.prepare('INSERT OR REPLACE INTO plan_modules (id, planId, moduleKey, enabled) VALUES (?, ?, ?, 0)')
      .run(id, PLAN_ID, 'suppliers');

    const logsBefore = planModuleLogs().length;
    moduleService.setPlanModules(PLAN_ID, ['products', 'customers', 'suppliers']);

    const logs = planModuleLogs();
    const update = logs[logs.length - 1];
    expect(update.operation).toBe('UPDATE');
    expect(update.record_id).toBe(id);

    const row = db.prepare('SELECT enabled FROM plan_modules WHERE id = ?').get(id);
    expect(row.enabled).toBe(1);
  });

  it('aucune écriture dans l ancienne sync_queue : pipeline unifié changelog', () => {
    const queueCount = db.prepare('SELECT COUNT(*) as c FROM sync_queue').get().c;
    expect(queueCount).toBe(0);
    expect(planModuleLogs().length).toBeGreaterThan(0);
  });
});