import { Router, Response } from 'express';
import db from '../database/db.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function generateInvoiceNumber(tenantId: string): string {
  const count = db.prepare('SELECT COUNT(*) as c FROM invoices WHERE tenantId = ?').get(tenantId) as any;
  const year = new Date().getFullYear();
  return `FAC-${year}-${String((count?.c || 0) + 1).padStart(4, '0')}`;
}

function generateDeliveryNumber(tenantId: string): string {
  const count = db.prepare('SELECT COUNT(*) as c FROM delivery_orders WHERE tenantId = ?').get(tenantId) as any;
  const year = new Date().getFullYear();
  return `BL-${year}-${String((count?.c || 0) + 1).padStart(4, '0')}`;
}

function generateReturnNumber(tenantId: string): string {
  const count = db.prepare('SELECT COUNT(*) as c FROM returns WHERE tenantId = ?').get(tenantId) as any;
  const year = new Date().getFullYear();
  return `RET-${year}-${String((count?.c || 0) + 1).padStart(4, '0')}`;
}

function addAuditLog(invoiceId: string, action: string, details: string, userId?: string, userName?: string) {
  db.prepare(`
    INSERT INTO invoice_audit_log (id, invoiceId, action, details, userId, userName, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(generateId('audit'), invoiceId, action, details, userId || null, userName || null, new Date().toISOString());
}

function recalcInvoiceDeliveryStatus(invoiceId: string) {
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

function recalcInvoicePaymentStatus(invoiceId: string) {
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

function recalcInvoiceTotals(invoiceId: string) {
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

router.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.query.tenantId as string || req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'tenantId requis' });
  const invoices = db.prepare('SELECT * FROM invoices WHERE tenantId = ? ORDER BY date DESC').all(tenantId) as any[];
  const result = invoices.map((inv: any) => {
    const items = db.prepare('SELECT * FROM invoice_items WHERE invoiceId = ?').all(inv.id);
    const deliveryOrders = db.prepare('SELECT * FROM delivery_orders WHERE invoiceId = ? ORDER BY createdAt ASC').all(inv.id);
    const payments = db.prepare('SELECT * FROM payments WHERE invoiceId = ? ORDER BY date ASC').all(inv.id);
    const returns = db.prepare('SELECT * FROM returns WHERE invoiceId = ? ORDER BY createdAt ASC').all(inv.id);
    return { ...inv, items, deliveryOrders, payments, returns };
  });
  res.json(result);
});

router.get('/:id', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id) as any;
  if (!inv) return res.status(404).json({ error: 'Facture introuvable' });
  const items = db.prepare('SELECT * FROM invoice_items WHERE invoiceId = ?').all(inv.id);
  const deliveryOrders = db.prepare('SELECT * FROM delivery_orders WHERE invoiceId = ? ORDER BY createdAt ASC').all(inv.id);
  const dosWithItems = deliveryOrders.map((do_: any) => {
    const doi = db.prepare('SELECT * FROM delivery_order_items WHERE deliveryOrderId = ?').all(do_.id);
    return { ...do_, items: doi };
  });
  const payments = db.prepare('SELECT * FROM payments WHERE invoiceId = ? ORDER BY date ASC').all(inv.id);
  const returns = db.prepare('SELECT * FROM returns WHERE invoiceId = ? ORDER BY createdAt ASC').all(inv.id);
  const returnsWithItems = returns.map((r: any) => {
    const ri = db.prepare('SELECT * FROM return_items WHERE returnId = ?').all(r.id);
    return { ...r, items: ri };
  });
  const auditLogs = db.prepare('SELECT * FROM invoice_audit_log WHERE invoiceId = ? ORDER BY timestamp ASC').all(inv.id);
  res.json({ ...inv, items, deliveryOrders: dosWithItems, payments, returns: returnsWithItems, auditLogs });
});

router.post('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'Aucun tenant actif' });
  const { customerId, customerName, customerPhone, customerEmail, customerAddress, items, taxRate, discount, discountType, shipping, notes, termsConditions, dueDate } = req.body;
  if (!items || items.length === 0) return res.status(400).json({ error: 'Au moins un article requis' });

  const id = generateId('inv');
  const invoiceNumber = generateInvoiceNumber(tenantId);
  const now = new Date().toISOString();
  let subtotal = 0;
  const invoiceItems = items.map((item: any) => {
    const total = (item.price || 0) * (item.quantity || 0);
    subtotal += total;
    return {
      id: generateId('invitm'),
      invoiceId: id,
      productId: item.productId || null,
      productName: item.productName,
      productSku: item.productSku || null,
      quantity: item.quantity || 1,
      price: item.price || 0,
      total,
      qtyDelivered: 0,
      qtyReturned: 0
    };
  });
  const dt = discountType || 'percentage';
  const discVal = discount || 0;
  const discAmount = dt === 'percentage' ? subtotal * (discVal / 100) : discVal;
  const taxVal = taxRate || 0;
  const taxAmount = subtotal * (taxVal / 100);
  const shipVal = shipping || 0;
  const total = subtotal + taxAmount - discAmount + shipVal;

  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO invoices (id, invoiceNumber, type, date, dueDate, customerId, customerName, customerPhone, customerEmail, customerAddress, subtotal, taxRate, tax, discount, discountType, shipping, total, paidAmount, status, deliveryStatus, paymentStatus, notes, termsConditions, tenantId, employeeId, employeeName, createdAt, updatedAt)
      VALUES (?, ?, 'sale', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'draft', 'not_delivered', 'unpaid', ?, ?, ?, ?, ?, ?, ?)
    `).run(id, invoiceNumber, now, dueDate || null, customerId || null, customerName || null, customerPhone || null, customerEmail || null, customerAddress || null, subtotal, taxVal, taxAmount, discVal, dt, shipVal, total, notes || null, termsConditions || null, tenantId, req.user?.id || null, req.user?.name || null, now, now);
    for (const ii of invoiceItems) {
      db.prepare(`INSERT INTO invoice_items (id, invoiceId, productId, productName, productSku, quantity, price, total, qtyDelivered, qtyReturned) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`).run(ii.id, ii.invoiceId, ii.productId, ii.productName, ii.productSku, ii.quantity, ii.price, ii.total);
    }
    addAuditLog(id, 'INVOICE_CREATED', `Facture ${invoiceNumber} créée avec ${items.length} article(s)`, req.user?.id, req.user?.name);
  });
  transaction();

  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as any;
  const createdItems = db.prepare('SELECT * FROM invoice_items WHERE invoiceId = ?').all(id);
  res.status(201).json({ ...invoice, items: createdItems, deliveryOrders: [], payments: [], returns: [] });
});

router.put('/:id', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id) as any;
  if (!inv) return res.status(404).json({ error: 'Facture introuvable' });
  if (inv.status !== 'draft') return res.status(400).json({ error: 'Seules les factures en brouillon peuvent être modifiées' });

  const { customerId, customerName, customerPhone, customerEmail, customerAddress, items, taxRate, discount, discountType, shipping, notes, termsConditions, dueDate } = req.body;
  if (!items || items.length === 0) return res.status(400).json({ error: 'Au moins un article requis' });

  const now = new Date().toISOString();
  let subtotal = 0;
  const invoiceItems = items.map((item: any) => {
    const total = (item.price || 0) * (item.quantity || 0);
    subtotal += total;
    return {
      id: item.id || generateId('invitm'),
      invoiceId: inv.id,
      productId: item.productId || null,
      productName: item.productName,
      productSku: item.productSku || null,
      quantity: item.quantity || 1,
      price: item.price || 0,
      total,
      qtyDelivered: item.qtyDelivered || 0,
      qtyReturned: item.qtyReturned || 0
    };
  });
  const dt = discountType || inv.discountType || 'percentage';
  const discVal = discount ?? inv.discount;
  const discAmount = dt === 'percentage' ? subtotal * (discVal / 100) : discVal;
  const taxVal = taxRate ?? inv.taxRate;
  const taxAmount = subtotal * (taxVal / 100);
  const shipVal = shipping ?? inv.shipping;
  const total = subtotal + taxAmount - discAmount + shipVal;

  db.transaction(() => {
    db.prepare(`
      UPDATE invoices SET customerId=?, customerName=?, customerPhone=?, customerEmail=?, customerAddress=?, subtotal=?, taxRate=?, tax=?, discount=?, discountType=?, shipping=?, total=?, notes=?, termsConditions=?, dueDate=?, updatedAt=?
      WHERE id=?
    `).run(customerId || null, customerName || null, customerPhone || null, customerEmail || null, customerAddress || null, subtotal, taxVal, taxAmount, discVal, dt, shipVal, total, notes || null, termsConditions || null, dueDate || null, now, inv.id);
    db.prepare('DELETE FROM invoice_items WHERE invoiceId = ?').run(inv.id);
    for (const ii of invoiceItems) {
      db.prepare(`INSERT INTO invoice_items (id, invoiceId, productId, productName, productSku, quantity, price, total, qtyDelivered, qtyReturned) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(ii.id, ii.invoiceId, ii.productId, ii.productName, ii.productSku, ii.quantity, ii.price, ii.total, ii.qtyDelivered, ii.qtyReturned);
    }
    recalcInvoiceDeliveryStatus(inv.id);
    addAuditLog(inv.id, 'INVOICE_UPDATED', 'Facture modifiée', req.user?.id, req.user?.name);
  })();

  const updated = db.prepare('SELECT * FROM invoices WHERE id = ?').get(inv.id) as any;
  const updatedItems = db.prepare('SELECT * FROM invoice_items WHERE invoiceId = ?').all(inv.id);
  res.json({ ...updated, items: updatedItems });
});

router.post('/:id/validate', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id) as any;
  if (!inv) return res.status(404).json({ error: 'Facture introuvable' });
  if (inv.status !== 'draft') return res.status(400).json({ error: 'Seules les factures en brouillon peuvent être validées' });

  db.prepare('UPDATE invoices SET status = ?, updatedAt = ? WHERE id = ?').run('validated', new Date().toISOString(), inv.id);
  addAuditLog(inv.id, 'INVOICE_VALIDATED', 'Facture validée', req.user?.id, req.user?.name);
  recalcInvoiceDeliveryStatus(inv.id);
  recalcInvoicePaymentStatus(inv.id);

  const updated = db.prepare('SELECT * FROM invoices WHERE id = ?').get(inv.id) as any;
  res.json(updated);
});

router.post('/:id/cancel', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id) as any;
  if (!inv) return res.status(404).json({ error: 'Facture introuvable' });
  if (inv.status === 'cancelled') return res.status(400).json({ error: 'Déjà annulée' });
  if (inv.status === 'archived') return res.status(400).json({ error: 'Facture archivée' });

  const { reason } = req.body;
  db.transaction(() => {
    db.prepare('UPDATE invoices SET status = ?, deliveryStatus = ?, notes = ?, updatedAt = ? WHERE id = ?').run('cancelled', 'cancelled', reason || inv.notes, new Date().toISOString(), inv.id);
    db.prepare('UPDATE delivery_orders SET status = ? WHERE invoiceId = ? AND status = ?').run('cancelled', inv.id, 'draft');
    addAuditLog(inv.id, 'INVOICE_CANCELLED', reason ? `Annulée : ${reason}` : 'Facture annulée', req.user?.id, req.user?.name);
  })();

  const updated = db.prepare('SELECT * FROM invoices WHERE id = ?').get(inv.id) as any;
  res.json(updated);
});

router.post('/:id/delivery-orders', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id) as any;
  if (!inv) return res.status(404).json({ error: 'Facture introuvable' });
  if (inv.status === 'draft') return res.status(400).json({ error: 'La facture doit être validée avant de créer un BL' });
  if (inv.status === 'cancelled') return res.status(400).json({ error: 'Facture annulée' });

  const { items } = req.body;
  if (!items || items.length === 0) return res.status(400).json({ error: 'Au moins un article requis' });

  for (const item of items) {
    const invItem = db.prepare('SELECT * FROM invoice_items WHERE id = ? AND invoiceId = ?').get(item.invoiceItemId, inv.id) as any;
    if (!invItem) return res.status(400).json({ error: `Article ${item.invoiceItemId} non trouvé sur la facture` });
    const remaining = invItem.quantity - invItem.qtyDelivered - invItem.qtyReturned;
    if (item.quantity > remaining) return res.status(400).json({ error: `Quantité ${item.quantity} > reliquat ${remaining} pour ${invItem.productName}` });
  }

  const doId = generateId('do');
  const deliveryNumber = generateDeliveryNumber(inv.tenantId);
  const now = new Date().toISOString();

  db.transaction(() => {
    db.prepare(`
      INSERT INTO delivery_orders (id, deliveryNumber, invoiceId, date, status, notes, createdBy, createdByName, tenantId, createdAt)
      VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)
    `).run(doId, deliveryNumber, inv.id, now, req.body.notes || null, req.user?.id || null, req.user?.name || null, inv.tenantId, now);

    for (const item of items) {
      const invItem = db.prepare('SELECT productId, productName, price FROM invoice_items WHERE id = ?').get(item.invoiceItemId) as any;
      const doiId = generateId('doi');
      const total = (invItem.price || 0) * (item.quantity || 0);
      db.prepare(`
        INSERT INTO delivery_order_items (id, deliveryOrderId, invoiceItemId, productId, productName, quantity, price, total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(doiId, doId, item.invoiceItemId, invItem.productId || null, invItem.productName, item.quantity, invItem.price, total);
    }
    addAuditLog(inv.id, 'DELIVERY_ORDER_CREATED', `BL ${deliveryNumber} créé`, req.user?.id, req.user?.name);
  })();

  const createdDO = db.prepare('SELECT * FROM delivery_orders WHERE id = ?').get(doId) as any;
  const doi = db.prepare('SELECT * FROM delivery_order_items WHERE deliveryOrderId = ?').all(doId);
  res.status(201).json({ ...createdDO, items: doi });
});

router.post('/delivery-orders/:id/validate', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const do_ = db.prepare('SELECT * FROM delivery_orders WHERE id = ?').get(req.params.id) as any;
  if (!do_) return res.status(404).json({ error: 'BL introuvable' });
  if (do_.status !== 'draft') return res.status(400).json({ error: 'Seuls les BL en brouillon peuvent être validés' });

  const now = new Date().toISOString();
  const items = db.prepare('SELECT * FROM delivery_order_items WHERE deliveryOrderId = ?').all(do_.id) as any[];

  db.transaction(() => {
    db.prepare('UPDATE delivery_orders SET status = ?, validatedAt = ? WHERE id = ?').run('validated', now, do_.id);
    for (const item of items) {
      // Update qtyDelivered on invoice_item
      db.prepare('UPDATE invoice_items SET qtyDelivered = qtyDelivered + ? WHERE id = ?').run(item.quantity, item.invoiceItemId);
      // Decrement product stock
      const invItem = db.prepare('SELECT productId FROM invoice_items WHERE id = ?').get(item.invoiceItemId) as any;
      if (invItem?.productId) {
        const product = db.prepare('SELECT quantity, name FROM products WHERE id = ?').get(invItem.productId) as any;
        if (product) {
          db.prepare('UPDATE products SET quantity = ? WHERE id = ?').run(Math.max(0, product.quantity - item.quantity), invItem.productId);
        }
      }
    }
    recalcInvoiceDeliveryStatus(do_.invoiceId);
    addAuditLog(do_.invoiceId, 'DELIVERY_ORDER_VALIDATED', `BL ${do_.deliveryNumber} validé - stock déduit`, req.user?.id, req.user?.name);
  })();

  res.json({ ...do_, status: 'validated', validatedAt: now });
});

router.post('/delivery-orders/:id/cancel', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const do_ = db.prepare('SELECT * FROM delivery_orders WHERE id = ?').get(req.params.id) as any;
  if (!do_) return res.status(404).json({ error: 'BL introuvable' });
  if (do_.status === 'cancelled') return res.status(400).json({ error: 'Déjà annulé' });

  const now = new Date().toISOString();
  db.transaction(() => {
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
    db.prepare('UPDATE delivery_orders SET status = ?, cancelledAt = ? WHERE id = ?').run('cancelled', now, do_.id);
    recalcInvoiceDeliveryStatus(do_.invoiceId);
    addAuditLog(do_.invoiceId, 'DELIVERY_ORDER_CANCELLED', `BL ${do_.deliveryNumber} annulé`, req.user?.id, req.user?.name);
  })();

  res.json({ ...do_, status: 'cancelled', cancelledAt: now });
});

router.post('/:id/payments', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id) as any;
  if (!inv) return res.status(404).json({ error: 'Facture introuvable' });
  if (inv.status === 'cancelled') return res.status(400).json({ error: 'Facture annulée' });

  const { amount, method, reference, notes } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Montant invalide' });

  const payId = generateId('pay');
  const now = new Date().toISOString();

  db.transaction(() => {
    db.prepare(`
      INSERT INTO payments (id, invoiceId, date, amount, method, reference, notes, tenantId, createdBy, createdByName, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(payId, inv.id, now, amount, method || 'cash', reference || null, notes || null, inv.tenantId, req.user?.id || null, req.user?.name || null, now);
    db.prepare('UPDATE invoices SET paidAmount = paidAmount + ?, updatedAt = ? WHERE id = ?').run(amount, now, inv.id);
    recalcInvoicePaymentStatus(inv.id);
    addAuditLog(inv.id, 'PAYMENT_RECORDED', `Paiement de ${amount} reçu (${method})${reference ? ' ref: ' + reference : ''}`, req.user?.id, req.user?.name);
  })();

  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(payId) as any;
  res.status(201).json(payment);
});

router.post('/:id/returns', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id) as any;
  if (!inv) return res.status(404).json({ error: 'Facture introuvable' });
  if (inv.status === 'cancelled') return res.status(400).json({ error: 'Facture annulée' });

  const { items, reason } = req.body;
  if (!items || items.length === 0) return res.status(400).json({ error: 'Au moins un article requis' });

  for (const item of items) {
    const invItem = db.prepare('SELECT * FROM invoice_items WHERE id = ? AND invoiceId = ?').get(item.invoiceItemId, inv.id) as any;
    if (!invItem) return res.status(400).json({ error: `Article ${item.invoiceItemId} non trouvé` });
    const deliverable = invItem.qtyDelivered - invItem.qtyReturned;
    if (item.quantity > deliverable) return res.status(400).json({ error: `Retour ${item.quantity} > livré ${deliverable} pour ${invItem.productName}` });
  }

  const returnId = generateId('ret');
  const returnNumber = generateReturnNumber(inv.tenantId);
  const now = new Date().toISOString();

  db.transaction(() => {
    db.prepare(`
      INSERT INTO returns (id, returnNumber, invoiceId, date, status, reason, tenantId, createdBy, createdByName, createdAt)
      VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)
    `).run(returnId, returnNumber, inv.id, now, reason || null, inv.tenantId, req.user?.id || null, req.user?.name || null, now);

    for (const item of items) {
      const invItem = db.prepare('SELECT productId, productName, price FROM invoice_items WHERE id = ?').get(item.invoiceItemId) as any;
      const total = (invItem.price || 0) * (item.quantity || 0);
      db.prepare(`
        INSERT INTO return_items (id, returnId, invoiceItemId, productId, productName, quantity, price, total, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(generateId('retitm'), returnId, item.invoiceItemId, invItem.productId || null, invItem.productName, item.quantity, invItem.price, total, item.reason || null);
    }
    addAuditLog(inv.id, 'RETURN_CREATED', `Retour ${returnNumber} créé`, req.user?.id, req.user?.name);
  })();

  const ret = db.prepare('SELECT * FROM returns WHERE id = ?').get(returnId) as any;
  const retItems = db.prepare('SELECT * FROM return_items WHERE returnId = ?').all(returnId);
  res.status(201).json({ ...ret, items: retItems });
});

router.post('/returns/:id/validate', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const ret = db.prepare('SELECT * FROM returns WHERE id = ?').get(req.params.id) as any;
  if (!ret) return res.status(404).json({ error: 'Retour introuvable' });
  if (ret.status !== 'draft') return res.status(400).json({ error: 'Déjà traité' });

  const now = new Date().toISOString();
  const items = db.prepare('SELECT * FROM return_items WHERE returnId = ?').all(ret.id) as any[];

  db.transaction(() => {
    db.prepare('UPDATE returns SET status = ?, validatedAt = ? WHERE id = ?').run('validated', now, ret.id);
    for (const item of items) {
      db.prepare('UPDATE invoice_items SET qtyReturned = qtyReturned + ? WHERE id = ?').run(item.quantity, item.invoiceItemId);
      const invItem = db.prepare('SELECT productId FROM invoice_items WHERE id = ?').get(item.invoiceItemId) as any;
      if (invItem?.productId) {
        db.prepare('UPDATE products SET quantity = quantity + ? WHERE id = ?').run(item.quantity, invItem.productId);
      }
    }
    recalcInvoiceDeliveryStatus(ret.invoiceId);
    addAuditLog(ret.invoiceId, 'RETURN_VALIDATED', `Retour ${ret.returnNumber} validé - stock restitué`, req.user?.id, req.user?.name);
  })();

  res.json({ ...ret, status: 'validated', validatedAt: now });
});

router.get('/:id/audit', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const logs = db.prepare('SELECT * FROM invoice_audit_log WHERE invoiceId = ? ORDER BY timestamp ASC').all(req.params.id);
  res.json(logs);
});

export default router;
