import { BaseService } from './baseService.js';
import db from '../../database/db.js';
import { genId } from '../../utils/ids.js';

const SUPPLIER_COLUMNS = [
  { sqlite: 'id', pg: 'legacy_id' },
  { sqlite: 'name', pg: 'name' },
  { sqlite: 'contactName', pg: 'contact_name' },
  { sqlite: 'phone', pg: 'phone' },
  { sqlite: 'email', pg: 'email' },
  { sqlite: 'tenantId', pg: 'tenant_id' },
  { sqlite: 'createdAt', pg: 'created_at' },
];

export class SupplierService extends BaseService {
  constructor() {
    super('suppliers', 'suppliers', SUPPLIER_COLUMNS);
  }

  getAll(tenantId: string): any[] {
    return this.getAllRaw(tenantId, 'name ASC');
  }

  getById(id: string): any | undefined {
    return this.getByIdRaw(id);
  }

  create(data: any, tenantId: string): any {
    const id = data.id || genId('s');
    const now = this.now();

    const supplier = {
      id,
      name: data.name,
      contactName: data.contactName || null,
      phone: data.phone || null,
      email: data.email || null,
      tenantId,
      createdAt: now,
    };

    this.insertRaw(supplier);
    this.enqueueSync('CREATE', id, { ...supplier, legacy_id: id }, tenantId);

    return this.getById(id);
  }

  update(id: string, data: any, tenantId: string): any | null {
    const existing = db.prepare('SELECT * FROM suppliers WHERE id = ? AND tenantId = ?').get(id, tenantId) as any | undefined;
    if (!existing) return null;

    const updated = {
      name: data.name ?? existing.name,
      contactName: data.contactName !== undefined ? data.contactName : existing.contactName,
      phone: data.phone !== undefined ? data.phone : existing.phone,
      email: data.email !== undefined ? data.email : existing.email,
    };

    this.updateRaw(id, updated);
    this.enqueueSync('UPDATE', id, { ...existing, ...updated, legacy_id: id }, tenantId);

    return this.getById(id);
  }

  delete(id: string, tenantId: string): boolean {
    const existing = db.prepare('SELECT * FROM suppliers WHERE id = ? AND tenantId = ?').get(id, tenantId);
    if (!existing) return false;
    this.deleteRaw(id);
    this.enqueueSync('DELETE', id, existing as any, tenantId);
    return true;
  }
}

export const supplierService = new SupplierService();
