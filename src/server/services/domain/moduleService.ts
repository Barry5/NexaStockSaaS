import { BaseService } from './baseService.js';
import db from '../../database/db.js';
import { getTenantAvailableModules } from '../../middleware/tenantAccess.js';

const MODULE_COLUMNS = [
  { sqlite: 'id', pg: 'legacy_id' },
  { sqlite: 'planId', pg: 'plan_id' },
  { sqlite: 'moduleKey', pg: 'module_key' },
  { sqlite: 'enabled', pg: 'enabled' },
];

export class ModuleService extends BaseService {
  constructor() {
    super('plan_modules', 'plan_modules', MODULE_COLUMNS);
  }

  getDefinitions(): any[] {
    return db.prepare('SELECT * FROM module_definitions ORDER BY display_order').all() as any[];
  }

  getPlanModules(planId: string): any[] {
    return db.prepare('SELECT * FROM plan_modules WHERE planId = ?').all(planId) as any[];
  }

  setPlanModules(planId: string, moduleKeys: string[]): any[] {
    db.prepare('DELETE FROM plan_modules WHERE planId = ?').run(planId);
    const insert = db.prepare('INSERT INTO plan_modules (id, planId, moduleKey, enabled) VALUES (?, ?, ?, 1)');
    const now = Date.now();
    for (let i = 0; i < moduleKeys.length; i++) {
      insert.run(`pm-${now}-${i}`, planId, moduleKeys[i]);
    }
    return this.getPlanModules(planId);
  }

  getTenantModules(tenantId: string): string[] {
    return getTenantAvailableModules(tenantId);
  }

  setTenantModuleOverride(tenantId: string, moduleKey: string, enabled: boolean): any[] {
    const existing = db.prepare('SELECT id FROM tenant_modules WHERE tenantId = ? AND moduleKey = ?').get(tenantId, moduleKey) as any;
    if (existing) {
      db.prepare('UPDATE tenant_modules SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, existing.id);
      this.enqueueSyncFor('tenant_modules', existing.id, 'UPDATE', { id: existing.id, tenantId, moduleKey, enabled }, tenantId);
    } else {
      const id = `tm-${Date.now()}`;
      db.prepare('INSERT INTO tenant_modules (id, tenantId, moduleKey, enabled) VALUES (?, ?, ?, ?)').run(
        id, tenantId, moduleKey, enabled ? 1 : 0
      );
      this.enqueueSyncFor('tenant_modules', id, 'CREATE', { id, tenantId, moduleKey, enabled }, tenantId);
    }
    return this.getTenantModules(tenantId);
  }

  getUserModules(tenantId: string): { modules: string[]; definitions: any[] } {
    const modules = getTenantAvailableModules(tenantId);
    const definitions = db.prepare('SELECT * FROM module_definitions ORDER BY display_order').all();
    return { modules, definitions };
  }
}

export const moduleService = new ModuleService();
