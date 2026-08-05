import { BaseService } from './baseService.js';
import db from '../../database/db.js';
import { genId } from '../../utils/ids.js';
import { nextCounter } from '../../utils/counters.js';

function now() { return new Date().toISOString(); }
function today() { return now().split('T')[0]; }

export class DeliveryNoteService extends BaseService {
  constructor() {
    super('delivery_orders', 'delivery_orders', []);
  }

  // Compteur persistant partagé avec invoiceService (type 'BL' commun) :
  // un seul séquence pour toutes les sources de Bons de Livraison (S6).
  private generateNumber(tenantId: string): string {
    return nextCounter(tenantId, 'BL', 'BL');
  }

  private addAudit(dnId: string, action: string, desc: string, tenantId: string, userId?: string, userName?: string) {
    db.prepare(`INSERT INTO delivery_note_audit (id, deliveryNoteId, action, description, userId, userName, tenantId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(genId('dna'), dnId, action, desc, userId || null, userName || null, tenantId, now());
  }

  private recalcInvoiceDeliveryStatus(invoiceId: string) {
    const items = db.prepare('SELECT * FROM invoice_items WHERE invoiceId = ?').all(invoiceId) as any[];
    if (!items.length) return;
    const allDelivered = items.every((i: any) => i.qtyDelivered >= i.quantity);
    const anyDelivered = items.some((i: any) => i.qtyDelivered > 0);
    const allCancelled = items.every((i: any) => i.quantity === 0);
    let status = 'not_delivered';
    if (allCancelled) status = 'cancelled';
    else if (allDelivered) status = 'fully_delivered';
    else if (anyDelivered) status = 'partially_delivered';
    db.prepare('UPDATE invoices SET deliveryStatus = ? WHERE id = ?').run(status, invoiceId);
  }

  private reloadDO(id: string) {
    const do_ = db.prepare('SELECT * FROM delivery_orders WHERE id = ?').get(id) as any;
    const items = db.prepare('SELECT * FROM delivery_order_items WHERE deliveryOrderId = ?').all(id);
    return { ...do_, items };
  }

  getDashboard(tenantId: string) {
    const d = today();
    const todayCount = (db.prepare("SELECT COUNT(*) as cnt FROM delivery_orders WHERE tenantId = ? AND date >= ?").get(tenantId, d) as any)?.cnt || 0;
    const draftCount = (db.prepare("SELECT COUNT(*) as cnt FROM delivery_orders WHERE tenantId = ? AND status = 'draft'").get(tenantId) as any)?.cnt || 0;
    const validatedCount = (db.prepare("SELECT COUNT(*) as cnt FROM delivery_orders WHERE tenantId = ? AND status = 'validated'").get(tenantId) as any)?.cnt || 0;
    const inTransitCount = (db.prepare("SELECT COUNT(*) as cnt FROM delivery_orders WHERE tenantId = ? AND status = 'in_transit'").get(tenantId) as any)?.cnt || 0;
    const deliveredCount = (db.prepare("SELECT COUNT(*) as cnt FROM delivery_orders WHERE tenantId = ? AND status = 'delivered'").get(tenantId) as any)?.cnt || 0;
    const cancelledCount = (db.prepare("SELECT COUNT(*) as cnt FROM delivery_orders WHERE tenantId = ? AND status = 'cancelled'").get(tenantId) as any)?.cnt || 0;
    const partiallyDeliveredInvoices = (db.prepare("SELECT COUNT(*) as cnt FROM invoices WHERE tenantId = ? AND deliveryStatus = 'partially_delivered'").get(tenantId) as any)?.cnt || 0;
    const pendingInvoices = (db.prepare("SELECT COUNT(*) as cnt FROM invoices WHERE tenantId = ? AND deliveryStatus = 'not_delivered' AND status = 'validated'").get(tenantId) as any)?.cnt || 0;
    const remainingQty = (db.prepare("SELECT COALESCE(SUM(quantity - qtyDelivered),0) as rem FROM invoice_items WHERE invoiceId IN (SELECT id FROM invoices WHERE tenantId = ? AND status = 'validated')").get(tenantId) as any)?.rem || 0;
    const recent = db.prepare("SELECT do.*, i.invoiceNumber, i.customerName FROM delivery_orders do LEFT JOIN invoices i ON do.invoiceId = i.id WHERE do.tenantId = ? ORDER BY do.createdAt DESC LIMIT 10").all(tenantId);
    return {
      stats: { todayCount, draftCount, validatedCount, inTransitCount, deliveredCount, cancelledCount, partiallyDeliveredInvoices, pendingInvoices, remainingQty, total: draftCount + validatedCount + inTransitCount + deliveredCount + cancelledCount },
      recent,
    };
  }

  search(tenantId: string, query: { q?: string; status?: string; from?: string; to?: string; invoice?: string }) {
    const q = query.q || '';
    const status = query.status;
    const from = query.from;
    const to = query.to;
    const invoiceNum = query.invoice;
    let sql = `SELECT do.*, i.invoiceNumber, i.customerName, i.customerPhone FROM delivery_orders do LEFT JOIN invoices i ON do.invoiceId = i.id WHERE do.tenantId = ?`;
    const params: any[] = [tenantId];
    if (status) { sql += ' AND do.status = ?'; params.push(status); }
    if (from) { sql += ' AND do.date >= ?'; params.push(from); }
    if (to) { sql += ' AND do.date <= ?'; params.push(to); }
    if (q) { sql += ' AND (do.deliveryNumber LIKE ? OR i.invoiceNumber LIKE ? OR i.customerName LIKE ? OR do.driverName LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
    if (invoiceNum) { sql += ' AND i.invoiceNumber LIKE ?'; params.push(`%${invoiceNum}%`); }
    sql += ' ORDER BY do.createdAt DESC LIMIT 100';
    const rows = db.prepare(sql).all(...params) as any[];
    const enriched = rows.map((r: any) => {
      const items = db.prepare('SELECT * FROM delivery_order_items WHERE deliveryOrderId = ?').all(r.id);
      const delivered = items.reduce((a: number, i: any) => a + i.quantity, 0);
      return { ...r, items, totalItems: items.length, totalQuantity: delivered };
    });
    return { results: enriched, total: enriched.length };
  }

  getById(id: string, tenantId: string): any | null {
    const do_ = db.prepare('SELECT * FROM delivery_orders WHERE id = ? AND tenantId = ?').get(id, tenantId) as any;
    if (!do_) return null;
    const items = db.prepare('SELECT * FROM delivery_order_items WHERE deliveryOrderId = ?').all(do_.id) as any[];
    const invoice = db.prepare('SELECT invoiceNumber, customerName, customerPhone, customerAddress FROM invoices WHERE id = ?').get(do_.invoiceId) as any;
    const audit = db.prepare('SELECT * FROM delivery_note_audit WHERE deliveryNoteId = ? ORDER BY createdAt DESC').all(do_.id);
    return { ...do_, items, invoice, audit };
  }

  getInvoiceHistory(invoiceId: string, tenantId: string): any[] {
    const rows = db.prepare('SELECT * FROM delivery_orders WHERE invoiceId = ? AND tenantId = ? ORDER BY createdAt ASC').all(invoiceId, tenantId) as any[];
    return rows.map((r: any) => {
      const items = db.prepare('SELECT doi.*, ii.quantity as orderedQty, ii.qtyDelivered FROM delivery_order_items doi LEFT JOIN invoice_items ii ON doi.invoiceItemId = ii.id WHERE doi.deliveryOrderId = ?').all(r.id);
      return { ...r, items };
    });
  }

  create(data: any, tenantId: string, userId?: string, userName?: string): any {
    const { invoiceId, notes, driverName, vehicleInfo, warehouseOrigin, deliveryAddress, deliveryPhone, items } = data;
    if (!invoiceId || !items?.length) throw new Error('Facture et articles requis');

    const inv = db.prepare('SELECT * FROM invoices WHERE id = ? AND tenantId = ?').get(invoiceId, tenantId) as any;
    if (!inv) throw new Error('Facture introuvable');
    if (inv.status !== 'validated') throw new Error('Seules les factures validées peuvent générer des BL');

    for (const item of items) {
      const invItem = db.prepare('SELECT * FROM invoice_items WHERE id = ? AND invoiceId = ?').get(item.invoiceItemId, invoiceId) as any;
      if (!invItem) throw new Error(`Ligne facture introuvable: ${item.invoiceItemId}`);
      const remaining = invItem.quantity - invItem.qtyDelivered;
      if (item.quantity > remaining) throw new Error(`Quantité ${item.quantity} > reste ${remaining} pour ${invItem.productName}`);
      if (item.quantity <= 0) throw new Error(`Quantité invalide pour ${invItem.productName}`);
    }

    const doId = genId('do');
    const number = this.generateNumber(tenantId);

    this.runInTransaction(() => {
      db.prepare(`
        INSERT INTO delivery_orders (id, deliveryNumber, invoiceId, date, status, notes, driverName, vehicleInfo, warehouseOrigin, deliveryAddress, deliveryPhone, createdBy, createdByName, tenantId, createdAt)
        VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(doId, number, invoiceId, now(), notes || null, driverName || null, vehicleInfo || null, warehouseOrigin || null, deliveryAddress || null, deliveryPhone || null, userId || null, userName || null, tenantId, now());

      for (const item of items) {
        const invItem = db.prepare('SELECT productId, productName, productSku, price FROM invoice_items WHERE id = ?').get(item.invoiceItemId) as any;
        const total = (invItem.price || 0) * (item.quantity || 0);
        db.prepare(`INSERT INTO delivery_order_items (id, deliveryOrderId, invoiceItemId, productId, productName, quantity, price, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(genId('doi'), doId, item.invoiceItemId, invItem.productId || null, invItem.productName, item.quantity, invItem.price, total);
      }
      this.addAudit(doId, 'CREATED', `BL ${number} créé depuis ${inv.invoiceNumber}`, tenantId, userId, userName);
    });

    this.enqueueSync('CREATE', doId, { id: doId, deliveryNumber: number, invoiceId, tenantId, legacy_id: doId, _table: 'delivery_orders' }, tenantId);
    return this.reloadDO(doId);
  }

  update(id: string, data: any, tenantId: string, userId?: string, userName?: string): any | null {
    const do_ = db.prepare('SELECT * FROM delivery_orders WHERE id = ? AND tenantId = ?').get(id, tenantId) as any;
    if (!do_) return null;
    if (do_.status !== 'draft') throw new Error('Seuls les BL en préparation peuvent être modifiés');

    const { notes, driverName, vehicleInfo, warehouseOrigin, deliveryAddress, deliveryPhone, deliveryDate, deliveryTime, items } = data;

    this.runInTransaction(() => {
      db.prepare(`
        UPDATE delivery_orders SET notes = ?, driverName = ?, vehicleInfo = ?, warehouseOrigin = ?, deliveryAddress = ?, deliveryPhone = ?, deliveryDate = ?, deliveryTime = ?, updatedAt = ?, updatedBy = ?, updatedByName = ? WHERE id = ?
      `).run(notes ?? do_.notes, driverName ?? do_.driverName, vehicleInfo ?? do_.vehicleInfo, warehouseOrigin ?? do_.warehouseOrigin, deliveryAddress ?? do_.deliveryAddress, deliveryPhone ?? do_.deliveryPhone, deliveryDate ?? do_.deliveryDate, deliveryTime ?? do_.deliveryTime, now(), userId || null, userName || null, do_.id);

      if (items) {
        const invoiceId = do_.invoiceId;
        db.prepare('DELETE FROM delivery_order_items WHERE deliveryOrderId = ?').run(do_.id);
        for (const item of items) {
          const invItem = db.prepare('SELECT productId, productName, productSku, price FROM invoice_items WHERE id = ? AND invoiceId = ?').get(item.invoiceItemId, invoiceId) as any;
          if (!invItem) continue;
          const remaining = invItem.quantity - invItem.qtyDelivered;
          const qty = Math.min(item.quantity, remaining);
          if (qty <= 0) continue;
          db.prepare(`INSERT INTO delivery_order_items (id, deliveryOrderId, invoiceItemId, productId, productName, quantity, price, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(genId('doi'), do_.id, item.invoiceItemId, invItem.productId || null, invItem.productName, qty, invItem.price, qty * invItem.price);
        }
      }
      this.addAudit(do_.id, 'UPDATED', `BL ${do_.deliveryNumber} modifié`, tenantId, userId, userName);
    });

    this.enqueueSync('UPDATE', id, data, tenantId);
    return this.reloadDO(do_.id);
  }

  validate(id: string, tenantId: string, userId?: string, userName?: string): any | null {
    const do_ = db.prepare('SELECT * FROM delivery_orders WHERE id = ? AND tenantId = ?').get(id, tenantId) as any;
    if (!do_) return null;
    if (do_.status !== 'draft') throw new Error('Seuls les BL en préparation peuvent être validés');

    const items = db.prepare('SELECT * FROM delivery_order_items WHERE deliveryOrderId = ?').all(do_.id) as any[];

    this.runInTransaction(() => {
      db.prepare('UPDATE delivery_orders SET status = ?, validatedAt = ?, updatedAt = ?, updatedBy = ?, updatedByName = ? WHERE id = ?')
        .run('validated', now(), now(), userId || null, userName || null, do_.id);
      for (const item of items) {
        db.prepare('UPDATE invoice_items SET qtyDelivered = qtyDelivered + ? WHERE id = ?').run(item.quantity, item.invoiceItemId);
        const invItem = db.prepare('SELECT productId FROM invoice_items WHERE id = ?').get(item.invoiceItemId) as any;
        if (invItem?.productId) {
          const product = db.prepare('SELECT quantity FROM products WHERE id = ? AND tenantId = ?').get(invItem.productId, tenantId) as any;
          if (product) {
            db.prepare('UPDATE products SET quantity = ? WHERE id = ? AND tenantId = ?').run(Math.max(0, product.quantity - item.quantity), invItem.productId, tenantId);
          }
        }
      }
      this.recalcInvoiceDeliveryStatus(do_.invoiceId);
      this.addAudit(do_.id, 'VALIDATED', `BL ${do_.deliveryNumber} validé - stock déduit`, tenantId, userId, userName);
    });

    this.enqueueSync('UPDATE', id, { status: 'validated', legacy_id: id }, tenantId);
    return this.reloadDO(do_.id);
  }

  markInTransit(id: string, data: { deliveryDate?: string; deliveryTime?: string }, tenantId: string, userId?: string, userName?: string): any | null {
    const do_ = db.prepare('SELECT * FROM delivery_orders WHERE id = ? AND tenantId = ?').get(id, tenantId) as any;
    if (!do_) return null;
    if (do_.status !== 'validated') throw new Error('Le BL doit être validé d\'abord');
    const ts = now();
    db.prepare('UPDATE delivery_orders SET status = ?, deliveryDate = ?, deliveryTime = ?, updatedAt = ?, updatedBy = ?, updatedByName = ? WHERE id = ?')
      .run('in_transit', data.deliveryDate || ts.split('T')[0], data.deliveryTime || ts.split('T')[1]?.split('.')[0] || '', ts, userId || null, userName || null, do_.id);
    this.addAudit(do_.id, 'IN_TRANSIT', `BL ${do_.deliveryNumber} en cours de livraison`, tenantId, userId, userName);
    this.enqueueSync('UPDATE', id, { status: 'in_transit', legacy_id: id }, tenantId);
    return this.reloadDO(do_.id);
  }

  markDelivered(id: string, signatures: { customerSignature?: string; driverSignature?: string; companyStamp?: string }, tenantId: string, userId?: string, userName?: string): any | null {
    const do_ = db.prepare('SELECT * FROM delivery_orders WHERE id = ? AND tenantId = ?').get(id, tenantId) as any;
    if (!do_) return null;
    if (!['validated', 'in_transit'].includes(do_.status)) throw new Error('Le BL doit être en cours ou validé');
    const { customerSignature, driverSignature, companyStamp } = signatures;
    this.runInTransaction(() => {
      db.prepare('UPDATE delivery_orders SET status = ?, customerSignature = ?, driverSignature = ?, companyStamp = ?, deliveryDate = ?, updatedAt = ?, updatedBy = ?, updatedByName = ? WHERE id = ?')
        .run('delivered', customerSignature || null, driverSignature || null, companyStamp || null, now().split('T')[0], now(), userId || null, userName || null, do_.id);
      this.recalcInvoiceDeliveryStatus(do_.invoiceId);
      this.addAudit(do_.id, 'DELIVERED', `BL ${do_.deliveryNumber} livré`, tenantId, userId, userName);
    });
    this.enqueueSync('UPDATE', id, { status: 'delivered', legacy_id: id }, tenantId);
    return this.reloadDO(do_.id);
  }

  cancel(id: string, tenantId: string, userId?: string, userName?: string): any | null {
    const do_ = db.prepare('SELECT * FROM delivery_orders WHERE id = ? AND tenantId = ?').get(id, tenantId) as any;
    if (!do_) return null;
    if (do_.status === 'cancelled') throw new Error('Déjà annulé');
    this.runInTransaction(() => {
      if (do_.status === 'validated' || do_.status === 'in_transit' || do_.status === 'delivered') {
        const items = db.prepare('SELECT * FROM delivery_order_items WHERE deliveryOrderId = ?').all(do_.id) as any[];
        for (const item of items) {
          db.prepare('UPDATE invoice_items SET qtyDelivered = MAX(0, qtyDelivered - ?) WHERE id = ?').run(item.quantity, item.invoiceItemId);
          const invItem = db.prepare('SELECT productId FROM invoice_items WHERE id = ?').get(item.invoiceItemId) as any;
          if (invItem?.productId) {
            const product = db.prepare('SELECT quantity FROM products WHERE id = ? AND tenantId = ?').get(invItem.productId, tenantId) as any;
            if (product) {
              db.prepare('UPDATE products SET quantity = ? WHERE id = ? AND tenantId = ?').run(product.quantity + item.quantity, invItem.productId, tenantId);
            }
          }
        }
      }
      db.prepare('UPDATE delivery_orders SET status = ?, cancelledAt = ?, updatedAt = ?, updatedBy = ?, updatedByName = ? WHERE id = ?')
        .run('cancelled', now(), now(), userId || null, userName || null, do_.id);
      this.recalcInvoiceDeliveryStatus(do_.invoiceId);
      this.addAudit(do_.id, 'CANCELLED', `BL ${do_.deliveryNumber} annulé`, tenantId, userId, userName);
    });
    this.enqueueSync('UPDATE', id, { status: 'cancelled', legacy_id: id }, tenantId);
    return this.reloadDO(do_.id);
  }
}

export const deliveryNoteService = new DeliveryNoteService();
