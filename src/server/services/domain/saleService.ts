import { BaseService } from './baseService.js';
import db from '../../database/db.js';
import { randomUUID } from 'crypto';

// UUID v4 (audit §2.6, P7) : les IDs précédents (Date.now()+random) pouvaient
// entrer en collision à la même milliseconde entre appareils.
function genId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

const SALE_COLUMNS = [
  { sqlite: 'id', pg: 'legacy_id' },
  { sqlite: 'invoiceNumber', pg: 'invoice_number' },
  { sqlite: 'date', pg: 'date' },
  { sqlite: 'subtotal', pg: 'subtotal' },
  { sqlite: 'tax', pg: 'tax' },
  { sqlite: 'taxRate', pg: 'tax_rate' },
  { sqlite: 'discount', pg: 'discount' },
  { sqlite: 'total', pg: 'total' },
  { sqlite: 'paymentMethod', pg: 'payment_method' },
  { sqlite: 'customerId', pg: 'customer_id' },
  { sqlite: 'customerName', pg: 'customer_name' },
  { sqlite: 'tenantId', pg: 'tenant_id' },
  { sqlite: 'employeeId', pg: 'employee_id' },
  { sqlite: 'employeeName', pg: 'employee_name' },
];

export class SaleService extends BaseService {
  constructor() {
    super('sales', 'sales', SALE_COLUMNS);
  }

  getAll(tenantId: string): any[] {
    const sales = db.prepare('SELECT * FROM sales WHERE tenantId = ? ORDER BY date DESC').all(tenantId) as any[];
    return sales.map(s => ({
      ...s,
      items: db.prepare('SELECT * FROM sale_items WHERE saleId = ?').all(s.id),
    }));
  }

  getById(id: string): any | undefined {
    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(id) as any | undefined;
    if (!sale) return undefined;
    sale.items = db.prepare('SELECT * FROM sale_items WHERE saleId = ?').all(sale.id);
    return sale;
  }

  create(data: any, tenantId: string, userId: string, userName: string): any {
    const saleId = data.id || genId('sa');

    this.runInTransaction(() => {
      db.prepare(`
        INSERT INTO sales (id, invoiceNumber, date, subtotal, tax, taxRate, discount, total, paymentMethod, customerId, customerName, tenantId, employeeId, employeeName)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        saleId,
        data.invoiceNumber,
        data.date || this.now(),
        data.subtotal,
        data.tax,
        data.taxRate || 20,
        data.discount || 0,
        data.total,
        data.paymentMethod,
        data.customerId || null,
        data.customerName || null,
        tenantId,
        userId,
        userName
      );

      for (const item of data.items) {
        const saleItemId = genId('saitm');
        const product = db.prepare('SELECT quantity, name FROM products WHERE id = ? AND tenantId = ?').get(item.productId, tenantId) as { quantity: number; name: string } | undefined;
        const productName = item.productName || product?.name || 'Produit inconnu';

        const saleItem = {
         id: saleItemId,
         saleId,
         productId: item.productId || null,
         productName,
         quantity: item.quantity,
         price: item.price,
         total: item.total,
         qtyDelivered: 0,
         qtyReturned: 0,
        };

        db.prepare(`
          INSERT INTO sale_items (id, saleId, productId, productName, quantity, price, total)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          saleItem.id,
          saleItem.saleId,
          saleItem.productId,
          saleItem.productName,
          saleItem.quantity,
          saleItem.price,
          saleItem.total
        );

        this.enqueueSyncFor('sale_items', saleItem.id, 'CREATE', { ...saleItem, legacy_id: saleItem.id }, tenantId);

        if (product) {
         const nextQty = Math.max(0, product.quantity - item.quantity);
         db.prepare('UPDATE products SET quantity = ? WHERE id = ? AND tenantId = ?').run(nextQty, item.productId, tenantId);
        }
      }

      if (data.paymentMethod === 'credit' && data.customerId) {
        const customer = db.prepare('SELECT outstandingDebt FROM customers WHERE id = ? AND tenantId = ?').get(data.customerId, tenantId) as { outstandingDebt: number } | undefined;
        if (customer) {
          db.prepare('UPDATE customers SET outstandingDebt = ? WHERE id = ? AND tenantId = ?').run(customer.outstandingDebt + data.total, data.customerId, tenantId);
        }
      }

      const auditId = genId('aud');
      db.prepare(`
        INSERT INTO audit_logs (id, timestamp, userId, userName, action, details, tenantId)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        auditId,
        this.now(),
        userId,
        userName,
        'VENTE_CREE',
        `Enregistrement de la vente ${data.invoiceNumber} d'un montant total de ${data.total} EUR`,
        tenantId
      );
      this.enqueueSyncFor('audit_logs', auditId, 'CREATE', {
        id: auditId,
        timestamp: this.now(),
        userId,
        userName,
        action: 'VENTE_CREE',
        details: `Enregistrement de la vente ${data.invoiceNumber} d'un montant total de ${data.total} EUR`,
        tenantId,
        legacy_id: auditId,
      }, tenantId);

      // S2 : la vente est journalisée DANS la transaction (avant : après
      // runInTransaction → fenêtre de crash → ligne sans changelog → jamais
      // poussée, puis détruite par la réconciliation).
      this.enqueueSync('CREATE', saleId, { id: saleId, ...data, legacy_id: saleId }, tenantId);

      return { id: saleId, ...data };
    });

    return this.getById(saleId);
  }

  delete(id: string, tenantId: string, userId: string, userName: string): boolean {
    const sale = db.prepare('SELECT * FROM sales WHERE id = ? AND tenantId = ?').get(id, tenantId) as any;
    if (!sale) return false;

    this.runInTransaction(() => {
      const items = db.prepare('SELECT * FROM sale_items WHERE saleId = ?').all(id) as any[];
 
      for (const item of items) {
        this.enqueueSyncFor('sale_items', item.id, 'DELETE', { ...item, legacy_id: item.id }, tenantId);
        const product = db.prepare('SELECT quantity FROM products WHERE id = ? AND tenantId = ?').get(item.productId, tenantId) as any;
        if (product) {
          db.prepare('UPDATE products SET quantity = ? WHERE id = ? AND tenantId = ?').run(product.quantity + item.quantity, item.productId, tenantId);
        }
      }
 
      if (sale.paymentMethod === 'credit' && sale.customerId) {
        const customer = db.prepare('SELECT outstandingDebt FROM customers WHERE id = ? AND tenantId = ?').get(sale.customerId, tenantId) as any;
        if (customer) {
          db.prepare('UPDATE customers SET outstandingDebt = ? WHERE id = ? AND tenantId = ?').run(Math.max(0, customer.outstandingDebt - sale.total), sale.customerId, tenantId);
        }
      }
 
      db.prepare('DELETE FROM sales WHERE id = ? AND tenantId = ?').run(id, tenantId);

      const auditId = genId('aud');
      db.prepare(`
        INSERT INTO audit_logs (id, timestamp, userId, userName, action, details, tenantId)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        auditId,
        this.now(),
        userId,
        userName,
        'VENTE_ANNULEE',
        `Annulation de la facture ${sale.invoiceNumber} d'un montant de ${sale.total} EUR`,
        tenantId
      );
      this.enqueueSyncFor('audit_logs', auditId, 'CREATE', {
        id: auditId,
        timestamp: this.now(),
        userId,
        userName,
        action: 'VENTE_ANNULEE',
        details: `Annulation de la facture ${sale.invoiceNumber} d'un montant de ${sale.total} EUR`,
        tenantId,
        legacy_id: auditId,
      }, tenantId);
      // S2 : la suppression est journalisée DANS la transaction.
      this.enqueueSync('DELETE', id, { ...sale, legacy_id: id }, tenantId);
    });

    return true;
  }
}

export const saleService = new SaleService();
