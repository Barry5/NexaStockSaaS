import { BaseService } from './baseService.js';
import db from '../../database/db.js';
import { genId } from '../../utils/ids.js';

export interface PricingPlanInput {
  name?: string;
  description?: string;
  price?: number;
  currency?: string;
  durationDays?: number;
  features?: string[];
  limits?: Record<string, number>;
  color?: string;
  displayOrder?: number;
  active?: boolean;
}

function genPlanId(): string {
  return genId('plan');
}

function parsePlanRow(row: any): any {
  return {
    ...row,
    features: JSON.parse(row.features || '[]'),
    limits: JSON.parse(row.limits || '{}'),
    active: !!row.active,
  };
}

export class PricingPlanService extends BaseService {
  constructor() {
    super('pricing_plans', 'pricing_plans', []);
  }

  getAll(includeInactive = true): any[] {
    const rows = includeInactive
      ? db.prepare('SELECT * FROM pricing_plans ORDER BY displayOrder ASC, price ASC').all()
      : db.prepare('SELECT * FROM pricing_plans WHERE active = 1 ORDER BY displayOrder ASC').all();
    return (rows as any[]).map(parsePlanRow);
  }

  getById(id: string): any | null {
    const row = db.prepare('SELECT * FROM pricing_plans WHERE id = ?').get(id) as any;
    return row ? parsePlanRow(row) : null;
  }

  create(data: PricingPlanInput): any {
    const id = genId('plan');
    const now = new Date().toISOString();
    const name = data.name || 'Nouveau forfait';
    const price = Number(data.price) || 0;
    const currency = data.currency || 'EUR';
    const durationDays = Number(data.durationDays) || 30;
    const features = JSON.stringify(data.features || []);
    const limits = JSON.stringify(data.limits || { maxProducts: 100, maxSales: 100, maxCustomers: 50, maxUsers: 1 });
    const color = data.color || 'gray';
    const displayOrder = Number(data.displayOrder) || 99;
    const active = data.active !== false ? 1 : 0;

    this.runInTransaction(() => {
      db.prepare(`
        INSERT INTO pricing_plans (id, name, description, price, currency, durationDays, features, limits, color, displayOrder, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, name, data.description || null, price, currency, durationDays, features, limits, color, displayOrder, active);
    });

    const plan = this.getById(id);
    this.enqueueSyncFor('pricing_plans', id, 'CREATE', {
      ...plan,
      id,
      legacy_id: id,
    });
    return plan;
  }

  update(id: string, data: PricingPlanInput): any | null {
    const existing = db.prepare('SELECT * FROM pricing_plans WHERE id = ?').get(id) as any;
    if (!existing) return null;

    const name = data.name !== undefined ? data.name : existing.name;
    const description = data.description !== undefined ? data.description : existing.description;
    const price = data.price !== undefined ? Number(data.price) : existing.price;
    const currency = data.currency !== undefined ? data.currency : existing.currency;
    const durationDays = data.durationDays !== undefined ? Number(data.durationDays) : existing.durationDays;
    const features = data.features !== undefined ? JSON.stringify(data.features) : existing.features;
    const limits = data.limits !== undefined ? JSON.stringify(data.limits) : existing.limits;
    const color = data.color !== undefined ? data.color : existing.color;
    const displayOrder = data.displayOrder !== undefined ? Number(data.displayOrder) : existing.displayOrder;
    const active = data.active !== undefined ? (data.active ? 1 : 0) : existing.active;

    db.prepare(`
      UPDATE pricing_plans SET name = ?, description = ?, price = ?, currency = ?, durationDays = ?, features = ?, limits = ?, color = ?, displayOrder = ?, active = ?
      WHERE id = ?
    `).run(name, description, price, currency, durationDays, features, limits, color, displayOrder, active, id);

    const plan = this.getById(id);
    this.enqueueSyncFor('pricing_plans', id, 'UPDATE', {
      ...plan,
      id,
      legacy_id: id,
    });
    return plan;
  }

  remove(id: string): boolean {
    const existing = db.prepare('SELECT * FROM pricing_plans WHERE id = ?').get(id) as any;
    if (!existing) return false;

    const usedByTenants = db.prepare('SELECT COUNT(*) as count FROM tenants WHERE plan = ?').get(existing.name) as { count: number };
    if (usedByTenants.count > 0) {
      throw new Error(`Ce forfait est utilisé par ${usedByTenants.count} entreprise(s). Réaffectez-les avant de supprimer.`);
    }

    db.prepare('DELETE FROM pricing_plans WHERE id = ?').run(id);
    this.enqueueSyncFor('pricing_plans', id, 'DELETE', { legacy_id: id, id });
    return true;
  }
}

export const pricingPlanService = new PricingPlanService();
