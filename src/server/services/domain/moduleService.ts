import { BaseService } from './baseService.js';
import db from '../../database/db.js';
import { getTenantAvailableModules } from '../../middleware/tenantAccess.js';
import { genId } from '../../utils/ids.js';

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
    const keys = [...new Set(moduleKeys)];
    const wanted = new Set(keys);
    const existing = db.prepare('SELECT * FROM plan_modules WHERE planId = ?').all(planId) as any[];
    const existingByKey = new Map(existing.map(r => [r.moduleKey, r]));

    const transaction = db.transaction(() => {
      // Diff : persistent + journalise dans sync_changelog (le SupabaseWorker
      // poussera vers PostgreSQL). Sans ça, la config locale était écrasée à
      // chaque lancement par le pull PG (stale).
      for (const row of existing) {
        if (wanted.has(row.moduleKey)) {
          if (row.enabled !== 1) {
            db.prepare('UPDATE plan_modules SET enabled = 1 WHERE id = ?').run(row.id);
            this.enqueueSyncFor('plan_modules', row.id, 'UPDATE', { id: row.id, planId, moduleKey: row.moduleKey, enabled: 1 });
          }
        } else {
          db.prepare('DELETE FROM plan_modules WHERE id = ?').run(row.id);
          this.enqueueSyncFor('plan_modules', row.id, 'DELETE', { id: row.id, planId, moduleKey: row.moduleKey, enabled: row.enabled });
        }
      }
      for (const key of keys) {
        if (existingByKey.has(key)) continue;
        const id = genId('pm');
        db.prepare('INSERT INTO plan_modules (id, planId, moduleKey, enabled) VALUES (?, ?, ?, 1)').run(id, planId, key);
        this.enqueueSyncFor('plan_modules', id, 'CREATE', { id, planId, moduleKey: key, enabled: 1 });
      }
    });
    transaction();

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
      const id = genId('tm');
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
