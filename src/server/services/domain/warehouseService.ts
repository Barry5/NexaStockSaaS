import { BaseService } from './baseService.js';
import db from '../../database/db.js';
import { genId } from '../../utils/ids.js';

const WAREHOUSE_COLUMNS = [
  { sqlite: 'id', pg: 'legacy_id' },
  { sqlite: 'name', pg: 'name' },
  { sqlite: 'location', pg: 'location' },
  { sqlite: 'tenantId', pg: 'tenant_id' },
];

const TRANSFER_COLUMNS = [
  { sqlite: 'id', pg: 'legacy_id' },
  { sqlite: 'productId', pg: 'product_id' },
  { sqlite: 'productName', pg: 'product_name' },
  { sqlite: 'fromWarehouseId', pg: 'from_warehouse_id' },
  { sqlite: 'toWarehouseId', pg: 'to_warehouse_id' },
  { sqlite: 'quantity', pg: 'quantity' },
  { sqlite: 'date', pg: 'date' },
  { sqlite: 'status', pg: 'status' },
  { sqlite: 'tenantId', pg: 'tenant_id' },
];

export class WarehouseService extends BaseService {
  constructor() {
    super('warehouses', 'warehouses', WAREHOUSE_COLUMNS);
  }

  getAll(tenantId: string): any[] {
    return this.getAllRaw(tenantId, 'name ASC');
  }

  getTransfers(tenantId: string): any[] {
    const cols = TRANSFER_COLUMNS.map(m => m.sqlite).join(', ');
    return db.prepare(`SELECT ${cols} FROM stock_transfers WHERE tenantId = ? ORDER BY date DESC`).all(tenantId) as any[];
  }

  getById(id: string): any | undefined {
    return this.getByIdRaw(id);
  }

  create(data: any, tenantId: string): any {
    const id = data.id || genId('wh');

    const warehouse = {
      id,
      name: data.name,
      location: data.location || null,
      tenantId,
    };

    this.insertRaw(warehouse);
    this.enqueueSync('CREATE', id, { ...warehouse, legacy_id: id }, tenantId);

    return this.getById(id);
  }

  update(id: string, data: any, tenantId: string): any | null {
    const existing = db.prepare('SELECT * FROM warehouses WHERE id = ? AND tenantId = ?').get(id, tenantId) as any | undefined;
    if (!existing) return null;

    const updated = {
      name: data.name ?? existing.name,
      location: data.location !== undefined ? data.location : existing.location,
    };

    this.updateRaw(id, updated);
    this.enqueueSync('UPDATE', id, { ...existing, ...updated, legacy_id: id }, tenantId);

    return this.getById(id);
  }

  delete(id: string, tenantId: string): boolean {
    const existing = db.prepare('SELECT * FROM warehouses WHERE id = ? AND tenantId = ?').get(id, tenantId);
    if (!existing) return false;
    this.deleteRaw(id);
    this.enqueueSync('DELETE', id, existing as any, tenantId);
    return true;
  }

  createTransfer(data: any, tenantId: string, userId: string, userName: string): any {
    const id = data.id || genId('tr');

    const transfer = {
      id,
      productId: data.productId,
      productName: data.productName,
      fromWarehouseId: data.fromWarehouseId,
      toWarehouseId: data.toWarehouseId,
      quantity: data.quantity,
      date: data.date || this.now(),
      status: data.status || 'termine',
      tenantId,
    };

    db.prepare(`
      INSERT INTO stock_transfers (id, productId, productName, fromWarehouseId, toWarehouseId, quantity, date, status, tenantId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(...TRANSFER_COLUMNS.map(m => transfer[m.sqlite]));

    const auditId = genId('aud');
    db.prepare(`
      INSERT INTO audit_logs (id, timestamp, userId, userName, action, details, tenantId)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      auditId,
      this.now(),
      userId,
      userName,
      'STOCKS_TRANSFERT',
      `Transfert de ${transfer.quantity} x "${transfer.productName}" de l'entrepôt ${transfer.fromWarehouseId} vers ${transfer.toWarehouseId}`,
      tenantId
    );

    this.enqueueSync('CREATE', id, { ...transfer, legacy_id: id, _table: 'stock_transfers' }, tenantId);

    return db.prepare('SELECT * FROM stock_transfers WHERE id = ?').get(id);
  }
}

export const warehouseService = new WarehouseService();
