import { BaseService } from './baseService.js';
import db from '../../database/db.js';
import { genId } from '../../utils/ids.js';

const CUSTOMER_COLUMNS = [
  { sqlite: 'id', pg: 'legacy_id' },
  { sqlite: 'name', pg: 'name' },
  { sqlite: 'email', pg: 'email' },
  { sqlite: 'phone', pg: 'phone' },
  { sqlite: 'loyaltyPoints', pg: 'loyalty_points' },
  { sqlite: 'outstandingDebt', pg: 'outstanding_debt' },
  { sqlite: 'tenantId', pg: 'tenant_id' },
  { sqlite: 'createdAt', pg: 'created_at' },
];

export class CustomerService extends BaseService {
  constructor() {
    super('customers', 'customers', CUSTOMER_COLUMNS);
  }

  getAll(tenantId: string): any[] {
    return this.getAllRaw(tenantId, 'name ASC');
  }

  getById(id: string): any | undefined {
    return this.getByIdRaw(id);
  }

  create(data: any, tenantId: string): any {
    const id = data.id || genId('c');
    const now = this.now();

    const customer = {
      id,
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      loyaltyPoints: data.loyaltyPoints ?? 0,
      outstandingDebt: data.outstandingDebt ?? 0,
      tenantId,
      createdAt: now,
    };

    this.insertRaw(customer);
    this.enqueueSync('CREATE', id, { ...customer, legacy_id: id }, tenantId);

    return this.getById(id);
  }

  update(id: string, data: any, tenantId: string): any | null {
    const existing = db.prepare('SELECT * FROM customers WHERE id = ? AND tenantId = ?').get(id, tenantId) as any | undefined;
    if (!existing) return null;

    const updated = {
      name: data.name ?? existing.name,
      email: data.email !== undefined ? data.email : existing.email,
      phone: data.phone !== undefined ? data.phone : existing.phone,
      loyaltyPoints: data.loyaltyPoints ?? existing.loyaltyPoints,
      outstandingDebt: data.outstandingDebt ?? existing.outstandingDebt,
    };

    this.updateRaw(id, updated);
    this.enqueueSync('UPDATE', id, { ...existing, ...updated, legacy_id: id }, tenantId);

    return this.getById(id);
  }

  delete(id: string, tenantId: string): boolean {
    const existing = db.prepare('SELECT * FROM customers WHERE id = ? AND tenantId = ?').get(id, tenantId);
    if (!existing) return false;
    this.deleteRaw(id);
    this.enqueueSync('DELETE', id, existing as any, tenantId);
    return true;
  }
}

export const customerService = new CustomerService();
