import { BaseService } from './baseService.js';
import db from '../../database/db.js';

function genId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function now() {
  return new Date().toISOString();
}

export class InvoiceService extends BaseService {
  constructor() {
    super('invoices', 'invoices', []);
  }

  private generateInvoiceNumber(tenantId: string): string {
    const count = db.prepare('SELECT COUNT(*) as c FROM invoices WHERE tenantId = ?').get(tenantId) as any;
    const year = new Date().getFullYear();
    return `FAC-${year}-${String((count?.c || 0) + 1).padStart(4, '0')}`;
  }

  private generateDeliveryNumber(tenantId: string): string {
    const count = db.prepare('SELECT COUNT(*) as c FROM delivery_orders WHERE tenantId = ?').get(tenantId) as any;
    const year = new Date().getFullYear();
    return `BL-${year}-${String((count?.c || 0) + 1).padStart(4, '0')}`;
  }

  private generateReturnNumber(tenantId: string): string {
    const count = db.prepare('SELECT COUNT(*) as c FROM returns WHERE tenantId = ?').get(tenantId) as any;
    const year = new Date().getFullYear();
    return `RET-${year}-${String((count?.c || 0) + 1).padStart(4, '0')}`;
  }

  private addAuditLog(invoiceId: string, action: string, details: string, userId?: string, userName?: string) {
   const id = genId('audit');
   const timestamp = now();
   db.prepare(`
     INSERT INTO invoice_audit_log (id, invoiceId, action, details, userId, userName, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?)
   `).run(id, invoiceId, action, details, userId || null, userName || null, timestamp);
   this.enqueueSyncFor('invoice_audit_log', id, 'CREATE', {
     id,
     invoiceId,
     action,
     details,
     userId: userId || null,
     userName: userName || null,
     timestamp,
     legacy_id: id,
   });
  }

  private enqueueInvoiceItem(item: any, tenantId: string) {
   this.enqueueSyncFor('invoice_items', item.id, 'CREATE', { ...item, legacy_id: item.id }, tenantId);
  }

  private enqueueInvoiceItemDelete(item: any, tenantId: string) {
   this.enqueueSyncFor('invoice_items', item.id, 'DELETE', { ...item, legacy_id: item.id }, tenantId);
  }

  private enqueueDeliveryOrderItem(item: any, tenantId: string) {
   this.enqueueSyncFor('delivery_order_items', item.id, 'CREATE', { ...item, legacy_id: item.id }, tenantId);
  }

  private enqueueReturnItem(item: any, tenantId: string) {
   this.enqueueSyncFor('return_items', item.id, 'CREATE', { ...item, legacy_id: item.id }, tenantId);
  }

  private recalcInvoiceDeliveryStatus(invoiceId: string) {
    const items = db.prepare('SELECT * FROM invoice_items WHERE invoiceId = ?').all(invoiceId) as any[];
    if (items.length === 0) return;
    const allDelivered = items.every((i: any) => i.qtyDelivered >= i.quantity);
    const anyDelivered = items.some((i: any) => i.qtyDelivered > 0);
    const allCancelled = items.every((i: any) => i.quantity === 0);
    let status = 'not_delivered';
    if (allCancelled) status = 'cancelled';
    else if (allDelivered) status = 'fully_delivered';
    else if (anyDelivered) status = 'partially_delivered';
    db.prepare('UPDATE invoices SET deliveryStatus = ? WHERE id = ?').run(status, invoiceId);
  }

  private recalcInvoicePaymentStatus(invoiceId: string) {
    const invoice = db.prepare('SELECT total, paidAmount FROM invoices WHERE id = ?').get(invoiceId) as any;
    if (!invoice) return;
    const total = invoice.total || 0;
    const paid = invoice.paidAmount || 0;
    let status = 'unpaid';
    if (total <= 0) status = 'paid';
    else if (paid >= total) status = 'paid';
    else if (paid > 0) status = 'partially_paid';
    db.prepare('UPDATE invoices SET paymentStatus = ? WHERE id = ?').run(status, invoiceId);
  }

  private recalcInvoiceTotals(invoiceId: string) {
    const items = db.prepare('SELECT SUM(total) as s FROM invoice_items WHERE invoiceId = ?').get(invoiceId) as any;
    const subtotal = items?.s || 0;
    const invoice = db.prepare('SELECT taxRate, discount, discountType, shipping FROM invoices WHERE id = ?').get(invoiceId) as any;
    if (!invoice) return;
    const tax = subtotal * (invoice.taxRate / 100);
    let discount = invoice.discount || 0;
    if (invoice.discountType === 'percentage') {
      discount = subtotal * (discount / 100);
    }
    const total = subtotal + tax - discount + (invoice.shipping || 0);
    db.prepare('UPDATE invoices SET subtotal = ?, tax = ?, total = ? WHERE id = ?').run(subtotal, tax, total, invoiceId);
  }

  getAll(tenantId: string): any[] {
    const invoices = db.prepare('SELECT * FROM invoices WHERE tenantId = ? ORDER BY date DESC').all(tenantId) as any[];
    return invoices.map((inv: any) => {
      const items = db.prepare('SELECT * FROM invoice_items WHERE invoiceId = ?').all(inv.id);
      const deliveryOrders = db.prepare('SELECT * FROM delivery_orders WHERE invoiceId = ? ORDER BY createdAt ASC').all(inv.id);
      const payments = db.prepare('SELECT * FROM payments WHERE invoiceId = ? ORDER BY date ASC').all(inv.id);
      const returns = db.prepare('SELECT * FROM returns WHERE invoiceId = ? ORDER BY createdAt ASC').all(inv.id);
      return { ...inv, items, deliveryOrders, payments, returns };
    });
  }

  getById(id: string): any | null {
    const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as any;
    if (!inv) return null;
    const items = db.prepare('SELECT * FROM invoice_items WHERE invoiceId = ?').all(inv.id);
    const deliveryOrders = db.prepare('SELECT * FROM delivery_orders WHERE invoiceId = ? ORDER BY createdAt ASC').all(inv.id) as any[];
    const dosWithItems = deliveryOrders.map((do_: any) => {
      const doi = db.prepare('SELECT * FROM delivery_order_items WHERE deliveryOrderId = ?').all(do_.id);
      return { ...do_, items: doi };
    });
    const payments = db.prepare('SELECT * FROM payments WHERE invoiceId = ? ORDER BY date ASC').all(inv.id);
    const returns = db.prepare('SELECT * FROM returns WHERE invoiceId = ? ORDER BY createdAt ASC').all(inv.id) as any[];
    const returnsWithItems = returns.map((r: any) => {
      const ri = db.prepare('SELECT * FROM return_items WHERE returnId = ?').all(r.id);
      return { ...r, items: ri };
    });
    const auditLogs = db.prepare('SELECT * FROM invoice_audit_log WHERE invoiceId = ? ORDER BY timestamp ASC').all(inv.id);
    return { ...inv, items, deliveryOrders: dosWithItems, payments, returns: returnsWithItems, auditLogs };
  }

  create(data: any, tenantId: string, userId?: string, userName?: string): any {
    const { customerId, customerName, customerPhone, customerEmail, customerAddress, items, taxRate, discount, discountType, shipping, notes, termsConditions, dueDate } = data;
    if (!items || items.length === 0) throw new Error('Au moins un article requis');

    const id = genId('inv');
    const invoiceNumber = this.generateInvoiceNumber(tenantId);
    const t = now();
    let subtotal = 0;
    const invoiceItems = items.map((item: any) => {
      const total = (item.price || 0) * (item.quantity || 0);
      subtotal += total;
      return { id: genId('invitm'), invoiceId: id, productId: item.productId || null, productName: item.productName, productSku: item.productSku || null, quantity: item.quantity || 1, price: item.price || 0, total, qtyDelivered: 0, qtyReturned: 0 };
    });
    const dt = discountType || 'percentage';
    const discVal = discount || 0;
    const discAmount = dt === 'percentage' ? subtotal * (discVal / 100) : discVal;
    const taxVal = taxRate || 0;
    const taxAmount = subtotal * (taxVal / 100);
    const shipVal = shipping || 0;
    const total = subtotal + taxAmount - discAmount + shipVal;

    this.runInTransaction(() => {
      db.prepare(`
        INSERT INTO invoices (id, invoiceNumber, type, date, dueDate, customerId, customerName, customerPhone, customerEmail, customerAddress, subtotal, taxRate, tax, discount, discountType, shipping, total, paidAmount, status, deliveryStatus, paymentStatus, notes, termsConditions, tenantId, employeeId, employeeName, createdAt, updatedAt)
        VALUES (?, ?, 'sale', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'draft', 'not_delivered', 'unpaid', ?, ?, ?, ?, ?, ?, ?)
      `).run(id, invoiceNumber, t, dueDate || null, customerId || null, customerName || null, customerPhone || null, customerEmail || null, customerAddress || null, subtotal, taxVal, taxAmount, discVal, dt, shipVal, total, notes || null, termsConditions || null, tenantId, userId || null, userName || null, t, t);
      for (const ii of invoiceItems) {
        db.prepare(`INSERT INTO invoice_items (id, invoiceId, productId, productName, productSku, quantity, price, total, qtyDelivered, qtyReturned) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`).run(ii.id, ii.invoiceId, ii.productId, ii.productName, ii.productSku, ii.quantity, ii.price, ii.total);
        this.enqueueInvoiceItem(ii, tenantId);
      }
      this.addAuditLog(id, 'INVOICE_CREATED', `Facture ${invoiceNumber} créée avec ${items.length} article(s)`, userId, userName);
    });
 
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as any;
    this.enqueueSync('CREATE', id, { ...invoice, legacy_id: id }, tenantId);
    const createdItems = db.prepare('SELECT * FROM invoice_items WHERE invoiceId = ?').all(id);
    return { ...invoice, items: createdItems, deliveryOrders: [], payments: [], returns: [] };
  }

  update(id: string, data: any, tenantId: string, userId?: string, userName?: string): any | null {
    const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as any;
    if (!inv) return null;
    if (inv.status !== 'draft') throw new Error('Seules les factures en brouillon peuvent être modifiées');

    const { customerId, customerName, customerPhone, customerEmail, customerAddress, items, taxRate, discount, discountType, shipping, notes, termsConditions, dueDate } = data;
    if (!items || items.length === 0) throw new Error('Au moins un article requis');

    const t = now();
    let subtotal = 0;
    const invoiceItems = items.map((item: any) => {
      const total = (item.price || 0) * (item.quantity || 0);
      subtotal += total;
      return { id: item.id || genId('invitm'), invoiceId: inv.id, productId: item.productId || null, productName: item.productName, productSku: item.productSku || null, quantity: item.quantity || 1, price: item.price || 0, total, qtyDelivered: item.qtyDelivered || 0, qtyReturned: item.qtyReturned || 0 };
    });
    const dt = discountType || inv.discountType || 'percentage';
    const discVal = discount ?? inv.discount;
    const discAmount = dt === 'percentage' ? subtotal * (discVal / 100) : discVal;
    const taxVal = taxRate ?? inv.taxRate;
    const taxAmount = subtotal * (taxVal / 100);
    const shipVal = shipping ?? inv.shipping;
    const total = subtotal + taxAmount - discAmount + shipVal;

    const existingItems = db.prepare('SELECT * FROM invoice_items WHERE invoiceId = ?').all(inv.id) as any[];
    this.runInTransaction(() => {
      db.prepare(`
        UPDATE invoices SET customerId=?, customerName=?, customerPhone=?, customerEmail=?, customerAddress=?, subtotal=?, taxRate=?, tax=?, discount=?, discountType=?, shipping=?, total=?, notes=?, termsConditions=?, dueDate=?, updatedAt=?
        WHERE id=?
      `).run(customerId || null, customerName || null, customerPhone || null, customerEmail || null, customerAddress || null, subtotal, taxVal, taxAmount, discVal, dt, shipVal, total, notes || null, termsConditions || null, dueDate || null, t, inv.id);
      db.prepare('DELETE FROM invoice_items WHERE invoiceId = ?').run(inv.id);
      for (const ii of invoiceItems) {
        db.prepare(`INSERT INTO invoice_items (id, invoiceId, productId, productName, productSku, quantity, price, total, qtyDelivered, qtyReturned) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(ii.id, ii.invoiceId, ii.productId, ii.productName, ii.productSku, ii.quantity, ii.price, ii.total, ii.qtyDelivered, ii.qtyReturned);
      }
      this.recalcInvoiceDeliveryStatus(inv.id);
      this.addAuditLog(inv.id, 'INVOICE_UPDATED', 'Facture modifiée', userId, userName);
    });

    const newItemIds = new Set(invoiceItems.map((ii: any) => ii.id));
    for (const oldItem of existingItems) {
      if (!newItemIds.has(oldItem.id)) {
        this.enqueueInvoiceItemDelete(oldItem, tenantId);
      }
    }
    for (const ii of invoiceItems) {
      this.enqueueInvoiceItem(ii, tenantId);
    }

    const updated = db.prepare('SELECT * FROM invoices WHERE id = ?').get(inv.id) as any;
    this.enqueueSync('UPDATE', id, { ...updated, legacy_id: id }, tenantId);
    const updatedItems = db.prepare('SELECT * FROM invoice_items WHERE invoiceId = ?').all(inv.id);
    return { ...updated, items: updatedItems };
  }

  validate(id: string, userId?: string, userName?: string): any | null {
    const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as any;
    if (!inv) return null;
    if (inv.status !== 'draft') throw new Error('Seules les factures en brouillon peuvent être validées');
    db.prepare('UPDATE invoices SET status = ?, updatedAt = ? WHERE id = ?').run('validated', now(), inv.id);
    this.addAuditLog(inv.id, 'INVOICE_VALIDATED', 'Facture validée', userId, userName);
    this.recalcInvoiceDeliveryStatus(inv.id);
    this.recalcInvoicePaymentStatus(inv.id);
    this.enqueueSync('UPDATE', id, { status: 'validated', legacy_id: id }, inv.tenantId);
    return db.prepare('SELECT * FROM invoices WHERE id = ?').get(inv.id) as any;
  }

  cancel(id: string, reason: string | undefined, userId?: string, userName?: string): any | null {
    const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as any;
    if (!inv) return null;
    if (inv.status === 'cancelled') throw new Error('Déjà annulée');
    if (inv.status === 'archived') throw new Error('Facture archivée');
    this.runInTransaction(() => {
      db.prepare('UPDATE invoices SET status = ?, deliveryStatus = ?, notes = ?, updatedAt = ? WHERE id = ?').run('cancelled', 'cancelled', reason || inv.notes, now(), inv.id);
      db.prepare('UPDATE delivery_orders SET status = ? WHERE invoiceId = ? AND status = ?').run('cancelled', inv.id, 'draft');
      this.addAuditLog(inv.id, 'INVOICE_CANCELLED', reason ? `Annulée : ${reason}` : 'Facture annulée', userId, userName);
    });
    this.enqueueSync('UPDATE', id, { status: 'cancelled', legacy_id: id }, inv.tenantId);
    return db.prepare('SELECT * FROM invoices WHERE id = ?').get(inv.id) as any;
  }

  createDeliveryOrder(invoiceId: string, items: any[], notes: string | undefined, userId?: string, userName?: string): any {
    const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;
    if (!inv) return null;
    if (inv.status === 'draft') throw new Error('La facture doit être validée avant de créer un BL');
    if (inv.status === 'cancelled') throw new Error('Facture annulée');

    for (const item of items) {
      const invItem = db.prepare('SELECT * FROM invoice_items WHERE id = ? AND invoiceId = ?').get(item.invoiceItemId, inv.id) as any;
      if (!invItem) throw new Error(`Article ${item.invoiceItemId} non trouvé sur la facture`);
      const remaining = invItem.quantity - invItem.qtyDelivered - invItem.qtyReturned;
      if (item.quantity > remaining) throw new Error(`Quantité ${item.quantity} > reliquat ${remaining} pour ${invItem.productName}`);
    }

    const doId = genId('do');
    const deliveryNumber = this.generateDeliveryNumber(inv.tenantId);
    const t = now();

    this.runInTransaction(() => {
      db.prepare(`
        INSERT INTO delivery_orders (id, deliveryNumber, invoiceId, date, status, notes, createdBy, createdByName, tenantId, createdAt)
        VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)
      `).run(doId, deliveryNumber, inv.id, t, notes || null, userId || null, userName || null, inv.tenantId, t);

      for (const item of items) {
        const invItem = db.prepare('SELECT productId, productName, price FROM invoice_items WHERE id = ?').get(item.invoiceItemId) as any;
        const doiId = genId('doi');
        const total = (invItem.price || 0) * (item.quantity || 0);
        const deliveryItem = {
          id: doiId,
          deliveryOrderId: doId,
          invoiceItemId: item.invoiceItemId,
          productId: invItem.productId || null,
          productName: invItem.productName,
          quantity: item.quantity,
          price: invItem.price,
          total,
        };
        db.prepare(`
          INSERT INTO delivery_order_items (id, deliveryOrderId, invoiceItemId, productId, productName, quantity, price, total)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(deliveryItem.id, deliveryItem.deliveryOrderId, deliveryItem.invoiceItemId, deliveryItem.productId, deliveryItem.productName, deliveryItem.quantity, deliveryItem.price, deliveryItem.total);
        this.enqueueDeliveryOrderItem(deliveryItem, inv.tenantId);
      }
      this.addAuditLog(inv.id, 'DELIVERY_ORDER_CREATED', `BL ${deliveryNumber} créé`, userId, userName);
    });

    this.enqueueSync('CREATE', doId, { id: doId, deliveryNumber, invoiceId, tenantId: inv.tenantId, legacy_id: doId, _table: 'delivery_orders' }, inv.tenantId);
    const createdDO = db.prepare('SELECT * FROM delivery_orders WHERE id = ?').get(doId) as any;
    const doi = db.prepare('SELECT * FROM delivery_order_items WHERE deliveryOrderId = ?').all(doId);
    return { ...createdDO, items: doi };
  }

  validateDeliveryOrder(id: string, userId?: string, userName?: string): any {
    const do_ = db.prepare('SELECT * FROM delivery_orders WHERE id = ?').get(id) as any;
    if (!do_) return null;
    if (do_.status !== 'draft') throw new Error('Seuls les BL en brouillon peuvent être validés');

    const t = now();
    const items = db.prepare('SELECT * FROM delivery_order_items WHERE deliveryOrderId = ?').all(do_.id) as any[];

    this.runInTransaction(() => {
      db.prepare('UPDATE delivery_orders SET status = ?, validatedAt = ? WHERE id = ?').run('validated', t, do_.id);
      for (const item of items) {
        db.prepare('UPDATE invoice_items SET qtyDelivered = qtyDelivered + ? WHERE id = ?').run(item.quantity, item.invoiceItemId);
        const invItem = db.prepare('SELECT * FROM invoice_items WHERE id = ?').get(item.invoiceItemId) as any;
        if (invItem?.productId) {
          const product = db.prepare('SELECT quantity, name FROM products WHERE id = ?').get(invItem.productId) as any;
          if (product) {
            db.prepare('UPDATE products SET quantity = ? WHERE id = ?').run(Math.max(0, product.quantity - item.quantity), invItem.productId);
          }
        }
        if (invItem) {
          this.enqueueSync('UPDATE', invItem.id, { ...invItem, legacy_id: invItem.id }, do_.tenantId);
        }
      }
      this.recalcInvoiceDeliveryStatus(do_.invoiceId);
      this.addAuditLog(do_.invoiceId, 'DELIVERY_ORDER_VALIDATED', `BL ${do_.deliveryNumber} validé - stock déduit`, userId, userName);
    });
 
    this.enqueueSync('UPDATE', id, { status: 'validated', legacy_id: id }, do_.tenantId);
    return { ...do_, status: 'validated', validatedAt: t };
  }

  cancelDeliveryOrder(id: string, userId?: string, userName?: string): any {
    const do_ = db.prepare('SELECT * FROM delivery_orders WHERE id = ?').get(id) as any;
    if (!do_) return null;
    if (do_.status === 'cancelled') throw new Error('Déjà annulé');

    const t = now();
    this.runInTransaction(() => {
      if (do_.status === 'validated') {
        const items = db.prepare('SELECT * FROM delivery_order_items WHERE deliveryOrderId = ?').all(do_.id) as any[];
        for (const item of items) {
          db.prepare('UPDATE invoice_items SET qtyDelivered = MAX(0, qtyDelivered - ?) WHERE id = ?').run(item.quantity, item.invoiceItemId);
          const invItem = db.prepare('SELECT productId FROM invoice_items WHERE id = ?').get(item.invoiceItemId) as any;
          if (invItem?.productId) {
            const product = db.prepare('SELECT quantity, name FROM products WHERE id = ?').get(invItem.productId) as any;
            if (product) {
              db.prepare('UPDATE products SET quantity = ? WHERE id = ?').run(product.quantity + item.quantity, invItem.productId);
            }
          }
        }
      }
      db.prepare('UPDATE delivery_orders SET status = ?, cancelledAt = ? WHERE id = ?').run('cancelled', t, do_.id);
      this.recalcInvoiceDeliveryStatus(do_.invoiceId);
      this.addAuditLog(do_.invoiceId, 'DELIVERY_ORDER_CANCELLED', `BL ${do_.deliveryNumber} annulé`, userId, userName);
    });

    this.enqueueSync('UPDATE', id, { status: 'cancelled', legacy_id: id }, do_.tenantId);
    return { ...do_, status: 'cancelled', cancelledAt: t };
  }

  recordPayment(invoiceId: string, data: { amount: number; method?: string; reference?: string; notes?: string }, userId?: string, userName?: string): any {
    const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;
    if (!inv) return null;
    if (inv.status === 'cancelled') throw new Error('Facture annulée');

    const { amount, method, reference, notes } = data;
    if (!amount || amount <= 0) throw new Error('Montant invalide');

    const payId = genId('pay');
    const t = now();

    this.runInTransaction(() => {
      db.prepare(`
        INSERT INTO payments (id, invoiceId, date, amount, method, reference, notes, tenantId, createdBy, createdByName, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(payId, inv.id, t, amount, method || 'cash', reference || null, notes || null, inv.tenantId, userId || null, userName || null, t);
      db.prepare('UPDATE invoices SET paidAmount = paidAmount + ?, updatedAt = ? WHERE id = ?').run(amount, t, inv.id);
      this.recalcInvoicePaymentStatus(inv.id);
      this.addAuditLog(inv.id, 'PAYMENT_RECORDED', `Paiement de ${amount} reçu (${method})${reference ? ' ref: ' + reference : ''}`, userId, userName);
    });

    this.enqueueSyncFor('payments', payId, 'CREATE', {
      id: payId,
      invoiceId: inv.id,
      date: t,
      amount,
      method: method || 'cash',
      reference: reference || null,
      notes: notes || null,
      tenantId: inv.tenantId,
      createdBy: userId || null,
      createdByName: userName || null,
      createdAt: t,
      legacy_id: payId,
    }, inv.tenantId);
    this.enqueueSync('UPDATE', invoiceId, { paidAmount: (inv.paidAmount || 0) + amount, legacy_id: invoiceId }, inv.tenantId);
    return db.prepare('SELECT * FROM payments WHERE id = ?').get(payId) as any;
  }

  createReturn(invoiceId: string, items: any[], reason: string | undefined, userId?: string, userName?: string): any {
    const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;
    if (!inv) return null;
    if (inv.status === 'cancelled') throw new Error('Facture annulée');

    for (const item of items) {
      const invItem = db.prepare('SELECT * FROM invoice_items WHERE id = ? AND invoiceId = ?').get(item.invoiceItemId, inv.id) as any;
      if (!invItem) throw new Error(`Article ${item.invoiceItemId} non trouvé`);
      const deliverable = invItem.qtyDelivered - invItem.qtyReturned;
      if (item.quantity > deliverable) throw new Error(`Retour ${item.quantity} > livré ${deliverable} pour ${invItem.productName}`);
    }

    const returnId = genId('ret');
    const returnNumber = this.generateReturnNumber(inv.tenantId);
    const t = now();

    this.runInTransaction(() => {
      db.prepare(`
        INSERT INTO returns (id, returnNumber, invoiceId, date, status, reason, tenantId, createdBy, createdByName, createdAt)
        VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)
      `).run(returnId, returnNumber, inv.id, t, reason || null, inv.tenantId, userId || null, userName || null, t);

      for (const item of items) {
        const invItem = db.prepare('SELECT productId, productName, price FROM invoice_items WHERE id = ?').get(item.invoiceItemId) as any;
        const returnItem = {
          id: genId('retitm'),
          returnId,
          invoiceItemId: item.invoiceItemId,
          productId: invItem.productId || null,
          productName: invItem.productName,
          quantity: item.quantity,
          price: invItem.price,
          total: (invItem.price || 0) * (item.quantity || 0),
          reason: item.reason || null,
        };
        db.prepare(`
          INSERT INTO return_items (id, returnId, invoiceItemId, productId, productName, quantity, price, total, reason)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(returnItem.id, returnItem.returnId, returnItem.invoiceItemId, returnItem.productId, returnItem.productName, returnItem.quantity, returnItem.price, returnItem.total, returnItem.reason);
        this.enqueueReturnItem(returnItem, inv.tenantId);
      }
      this.addAuditLog(inv.id, 'RETURN_CREATED', `Retour ${returnNumber} créé`, userId, userName);
    });

    this.enqueueSync('CREATE', returnId, { id: returnId, returnNumber, invoiceId, tenantId: inv.tenantId, legacy_id: returnId, _table: 'returns' }, inv.tenantId);
    const ret = db.prepare('SELECT * FROM returns WHERE id = ?').get(returnId) as any;
    const retItems = db.prepare('SELECT * FROM return_items WHERE returnId = ?').all(returnId);
    return { ...ret, items: retItems };
  }

  validateReturn(id: string, userId?: string, userName?: string): any {
    const ret = db.prepare('SELECT * FROM returns WHERE id = ?').get(id) as any;
    if (!ret) return null;
    if (ret.status !== 'draft') throw new Error('Déjà traité');

    const t = now();
    const items = db.prepare('SELECT * FROM return_items WHERE returnId = ?').all(ret.id) as any[];

    this.runInTransaction(() => {
      db.prepare('UPDATE returns SET status = ?, validatedAt = ? WHERE id = ?').run('validated', t, ret.id);
      for (const item of items) {
        db.prepare('UPDATE invoice_items SET qtyReturned = qtyReturned + ? WHERE id = ?').run(item.quantity, item.invoiceItemId);
        const invItem = db.prepare('SELECT * FROM invoice_items WHERE id = ?').get(item.invoiceItemId) as any;
        if (invItem?.productId) {
          db.prepare('UPDATE products SET quantity = quantity + ? WHERE id = ?').run(item.quantity, invItem.productId);
        }
        if (invItem) {
          this.enqueueSync('UPDATE', invItem.id, { ...invItem, legacy_id: invItem.id }, ret.tenantId);
        }
      }
      this.recalcInvoiceDeliveryStatus(ret.invoiceId);
      this.addAuditLog(ret.invoiceId, 'RETURN_VALIDATED', `Retour ${ret.returnNumber} validé - stock restitué`, userId, userName);
    });
 
    this.enqueueSync('UPDATE', id, { status: 'validated', legacy_id: id }, ret.tenantId);
    return { ...ret, status: 'validated', validatedAt: t };
  }

  getAuditLogs(invoiceId: string): any[] {
    return db.prepare('SELECT * FROM invoice_audit_log WHERE invoiceId = ? ORDER BY timestamp ASC').all(invoiceId) as any[];
  }
}

export const invoiceService = new InvoiceService();
