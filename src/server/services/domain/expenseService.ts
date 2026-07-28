import { BaseService } from './baseService.js';
import db from '../../database/db.js';

const EXPENSE_COLUMNS = [
  { sqlite: 'id', pg: 'legacy_id' },
  { sqlite: 'title', pg: 'title' },
  { sqlite: 'amount', pg: 'amount' },
  { sqlite: 'category', pg: 'category' },
  { sqlite: 'date', pg: 'date' },
  { sqlite: 'description', pg: 'description' },
  { sqlite: 'recipient', pg: 'recipient' },
  { sqlite: 'paymentMethod', pg: 'payment_method' },
  { sqlite: 'status', pg: 'status' },
  { sqlite: 'attachment', pg: 'attachment' },
  { sqlite: 'tenantId', pg: 'tenant_id' },
];

export class ExpenseService extends BaseService {
  constructor() {
    super('expenses', 'expenses', EXPENSE_COLUMNS);
  }

  getAll(tenantId: string): any[] {
    return this.getAllRaw(tenantId, 'date DESC');
  }

  getById(id: string): any | undefined {
    return this.getByIdRaw(id);
  }

  create(data: any, tenantId: string): any {
    const id = data.id || `e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const expense = {
      id,
      title: data.title,
      amount: data.amount,
      category: data.category,
      date: data.date,
      description: data.description || null,
      recipient: data.recipient || null,
      paymentMethod: data.paymentMethod,
      status: data.status || 'en_attente',
      attachment: data.attachment || null,
      tenantId,
    };

    this.insertRaw(expense);
    this.enqueueSync('CREATE', id, { ...expense, legacy_id: id }, tenantId);

    return this.getById(id);
  }

  update(id: string, data: any, tenantId: string): any | null {
    const existing = db.prepare('SELECT * FROM expenses WHERE id = ? AND tenantId = ?').get(id, tenantId) as any | undefined;
    if (!existing) return null;

    const updated = {
      title: data.title ?? existing.title,
      amount: data.amount ?? existing.amount,
      category: data.category ?? existing.category,
      date: data.date ?? existing.date,
      description: data.description !== undefined ? data.description : existing.description,
      recipient: data.recipient !== undefined ? data.recipient : existing.recipient,
      paymentMethod: data.paymentMethod ?? existing.paymentMethod,
      status: data.status ?? existing.status,
      attachment: data.attachment !== undefined ? data.attachment : existing.attachment,
    };

    this.updateRaw(id, updated);
    this.enqueueSync('UPDATE', id, { ...existing, ...updated, legacy_id: id }, tenantId);

    return this.getById(id);
  }

  delete(id: string, tenantId: string): boolean {
    const existing = db.prepare('SELECT * FROM expenses WHERE id = ? AND tenantId = ?').get(id, tenantId);
    if (!existing) return false;
    this.deleteRaw(id);
    this.enqueueSync('DELETE', id, existing as any, tenantId);
    return true;
  }
}

export const expenseService = new ExpenseService();
