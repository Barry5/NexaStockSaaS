import { Router, Response } from 'express';
import db from '../database/db.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

function genId(p: string) { return `${p}-${Date.now()}-${Math.floor(Math.random() * 10000)}`; }
function now() { return new Date().toISOString(); }
function today() { return new Date().toISOString().split('T')[0]; }

function generateNumber(tenantId: string): string {
  const c = db.prepare('SELECT COUNT(*) as cnt FROM delivery_orders WHERE tenantId = ?').get(tenantId) as any;
  return `BL-${new Date().getFullYear()}-${String((c?.cnt || 0) + 1).padStart(4, '0')}`;
}

function addAudit(dnId: string, action: string, desc: string, tenantId: string, userId?: string, userName?: string) {
  db.prepare(`INSERT INTO delivery_note_audit (id, deliveryNoteId, action, description, userId, userName, tenantId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(genId('dna'), dnId, action, desc, userId || null, userName || null, tenantId, now());
}

function recalcInvoiceDeliveryStatus(invoiceId: string) {
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

// Dashboard stats
router.get('/dashboard', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'Tenant requis' });

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

    res.json({
      stats: { todayCount, draftCount, validatedCount, inTransitCount, deliveredCount, cancelledCount, partiallyDeliveredInvoices, pendingInvoices, remainingQty, total: draftCount + validatedCount + inTransitCount + deliveredCount + cancelledCount },
      recent,
    });
  } catch (error) {
    res.status(500).json({ error: 'Erreur du tableau de bord BL' });
  }
});

// List with search/filter
router.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'Tenant requis' });

    const q = (req.query.q as string) || '';
    const status = req.query.status as string;
    const from = req.query.from as string;
    const to = req.query.to as string;
    const invoiceNum = req.query.invoice as string;

    let sql = `SELECT do.*, i.invoiceNumber, i.customerName, i.customerPhone
      FROM delivery_orders do LEFT JOIN invoices i ON do.invoiceId = i.id WHERE do.tenantId = ?`;
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

    res.json({ results: enriched, total: enriched.length });
  } catch (error) {
    res.status(500).json({ error: 'Erreur de recherche BL' });
  }
});

// Get single delivery note with items
router.get('/:id', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const do_ = db.prepare('SELECT * FROM delivery_orders WHERE id = ? AND tenantId = ?').get(req.params.id, tenantId) as any;
    if (!do_) return res.status(404).json({ error: 'BL introuvable' });

    const items = db.prepare('SELECT * FROM delivery_order_items WHERE deliveryOrderId = ?').all(do_.id) as any[];
    const invoice = db.prepare('SELECT invoiceNumber, customerName, customerPhone, customerAddress FROM invoices WHERE id = ?').get(do_.invoiceId) as any;
    const audit = db.prepare('SELECT * FROM delivery_note_audit WHERE deliveryNoteId = ? ORDER BY createdAt DESC').all(do_.id);

    res.json({ ...do_, items, invoice, audit });
  } catch (error) {
    res.status(500).json({ error: 'Erreur de récupération BL' });
  }
});

// Get delivery history for an invoice
router.get('/invoice/:invoiceId', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const rows = db.prepare('SELECT * FROM delivery_orders WHERE invoiceId = ? AND tenantId = ? ORDER BY createdAt ASC').all(req.params.invoiceId, tenantId) as any[];
    const enriched = rows.map((r: any) => {
      const items = db.prepare('SELECT doi.*, ii.quantity as orderedQty, ii.qtyDelivered FROM delivery_order_items doi LEFT JOIN invoice_items ii ON doi.invoiceItemId = ii.id WHERE doi.deliveryOrderId = ?').all(r.id);
      return { ...r, items };
    });
    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: 'Erreur de récupération historique' });
  }
});

// Create delivery note from invoice
router.post('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'Tenant requis' });

    const { invoiceId, notes, driverName, vehicleInfo, warehouseOrigin, deliveryAddress, deliveryPhone, items } = req.body;
    if (!invoiceId || !items?.length) return res.status(400).json({ error: 'Facture et articles requis' });

    const inv = db.prepare('SELECT * FROM invoices WHERE id = ? AND tenantId = ?').get(invoiceId, tenantId) as any;
    if (!inv) return res.status(400).json({ error: 'Facture introuvable' });
    if (inv.status !== 'validated') return res.status(400).json({ error: 'Seules les factures validées peuvent générer des BL' });

    // Validate each item doesn't exceed remaining qty
    for (const item of items) {
      const invItem = db.prepare('SELECT * FROM invoice_items WHERE id = ? AND invoiceId = ?').get(item.invoiceItemId, invoiceId) as any;
      if (!invItem) return res.status(400).json({ error: `Ligne facture introuvable: ${item.invoiceItemId}` });
      const remaining = invItem.quantity - invItem.qtyDelivered;
      if (item.quantity > remaining) return res.status(400).json({ error: `Quantité ${item.quantity} > reste ${remaining} pour ${invItem.productName}` });
      if (item.quantity <= 0) return res.status(400).json({ error: `Quantité invalide pour ${invItem.productName}` });
    }

    const doId = genId('do');
    const number = generateNumber(tenantId);

    db.transaction(() => {
      db.prepare(`
        INSERT INTO delivery_orders (id, deliveryNumber, invoiceId, date, status, notes, driverName, vehicleInfo, warehouseOrigin, deliveryAddress, deliveryPhone, createdBy, createdByName, tenantId, createdAt)
        VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(doId, number, invoiceId, now(), notes || null, driverName || null, vehicleInfo || null, warehouseOrigin || null, deliveryAddress || null, deliveryPhone || null, req.user?.id || null, req.user?.name || null, tenantId, now());

      for (const item of items) {
        const invItem = db.prepare('SELECT productId, productName, productSku, price FROM invoice_items WHERE id = ?').get(item.invoiceItemId) as any;
        const total = (invItem.price || 0) * (item.quantity || 0);
        db.prepare(`
          INSERT INTO delivery_order_items (id, deliveryOrderId, invoiceItemId, productId, productName, quantity, price, total)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(genId('doi'), doId, item.invoiceItemId, invItem.productId || null, invItem.productName, item.quantity, invItem.price, total);
      }

      addAudit(doId, 'CREATED', `BL ${number} créé depuis ${inv.invoiceNumber}`, tenantId, req.user?.id, req.user?.name);
    })();

    const created = db.prepare('SELECT * FROM delivery_orders WHERE id = ?').get(doId) as any;
    const doi = db.prepare('SELECT * FROM delivery_order_items WHERE deliveryOrderId = ?').all(doId);
    res.status(201).json({ ...created, items: doi });
  } catch (error) {
    res.status(500).json({ error: "Erreur de création du BL" });
  }
});

// Update draft delivery note
router.put('/:id', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const do_ = db.prepare('SELECT * FROM delivery_orders WHERE id = ? AND tenantId = ?').get(req.params.id, tenantId) as any;
    if (!do_) return res.status(404).json({ error: 'BL introuvable' });
    if (do_.status !== 'draft') return res.status(400).json({ error: 'Seuls les BL en préparation peuvent être modifiés' });

    const { notes, driverName, vehicleInfo, warehouseOrigin, deliveryAddress, deliveryPhone, deliveryDate, deliveryTime, items } = req.body;

    db.transaction(() => {
      db.prepare(`
        UPDATE delivery_orders SET notes = ?, driverName = ?, vehicleInfo = ?, warehouseOrigin = ?, deliveryAddress = ?, deliveryPhone = ?, deliveryDate = ?, deliveryTime = ?, updatedAt = ?, updatedBy = ?, updatedByName = ?
        WHERE id = ?
      `).run(
        notes ?? do_.notes, driverName ?? do_.driverName, vehicleInfo ?? do_.vehicleInfo,
        warehouseOrigin ?? do_.warehouseOrigin, deliveryAddress ?? do_.deliveryAddress,
        deliveryPhone ?? do_.deliveryPhone, deliveryDate ?? do_.deliveryDate,
        deliveryTime ?? do_.deliveryTime, now(), req.user?.id || null, req.user?.name || null, do_.id
      );

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

      addAudit(do_.id, 'UPDATED', `BL ${do_.deliveryNumber} modifié`, tenantId, req.user?.id, req.user?.name);
    })();

    const updated = db.prepare('SELECT * FROM delivery_orders WHERE id = ?').get(do_.id) as any;
    const doi = db.prepare('SELECT * FROM delivery_order_items WHERE deliveryOrderId = ?').all(do_.id);
    res.json({ ...updated, items: doi });
  } catch (error) {
    res.status(500).json({ error: 'Erreur de modification BL' });
  }
});

// Validate (confirm stock deduction)
router.post('/:id/validate', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const do_ = db.prepare('SELECT * FROM delivery_orders WHERE id = ? AND tenantId = ?').get(req.params.id, tenantId) as any;
    if (!do_) return res.status(404).json({ error: 'BL introuvable' });
    if (do_.status !== 'draft') return res.status(400).json({ error: 'Seuls les BL en préparation peuvent être validés' });

    const items = db.prepare('SELECT * FROM delivery_order_items WHERE deliveryOrderId = ?').all(do_.id) as any[];

    db.transaction(() => {
      db.prepare('UPDATE delivery_orders SET status = ?, validatedAt = ?, updatedAt = ?, updatedBy = ?, updatedByName = ? WHERE id = ?')
        .run('validated', now(), now(), req.user?.id || null, req.user?.name || null, do_.id);

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

      recalcInvoiceDeliveryStatus(do_.invoiceId);
      addAudit(do_.id, 'VALIDATED', `BL ${do_.deliveryNumber} validé - stock déduit`, tenantId, req.user?.id, req.user?.name);
    })();

    res.json(reloadDO(do_.id));
  } catch (error) {
    res.status(500).json({ error: 'Erreur de validation BL' });
  }
});

// Mark as in transit
router.post('/:id/in-transit', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const do_ = db.prepare('SELECT * FROM delivery_orders WHERE id = ? AND tenantId = ?').get(req.params.id, tenantId) as any;
    if (!do_) return res.status(404).json({ error: 'BL introuvable' });
    if (do_.status !== 'validated') return res.status(400).json({ error: 'Le BL doit être validé d\'abord' });

    const ts = now();
    db.prepare('UPDATE delivery_orders SET status = ?, deliveryDate = ?, deliveryTime = ?, updatedAt = ?, updatedBy = ?, updatedByName = ? WHERE id = ?')
      .run('in_transit', req.body.deliveryDate || ts.split('T')[0], req.body.deliveryTime || ts.split('T')[1]?.split('.')[0] || '', ts, req.user?.id || null, req.user?.name || null, do_.id);

    addAudit(do_.id, 'IN_TRANSIT', `BL ${do_.deliveryNumber} en cours de livraison`, tenantId, req.user?.id, req.user?.name);
    res.json(reloadDO(do_.id));
  } catch (error) {
    res.status(500).json({ error: 'Erreur de mise à jour BL' });
  }
});

// Mark as delivered
router.post('/:id/deliver', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const do_ = db.prepare('SELECT * FROM delivery_orders WHERE id = ? AND tenantId = ?').get(req.params.id, tenantId) as any;
    if (!do_) return res.status(404).json({ error: 'BL introuvable' });
    if (!['validated', 'in_transit'].includes(do_.status)) return res.status(400).json({ error: 'Le BL doit être en cours ou validé' });

    const { customerSignature, driverSignature, companyStamp } = req.body;

    db.transaction(() => {
      db.prepare('UPDATE delivery_orders SET status = ?, customerSignature = ?, driverSignature = ?, companyStamp = ?, deliveryDate = ?, updatedAt = ?, updatedBy = ?, updatedByName = ? WHERE id = ?')
        .run('delivered', customerSignature || null, driverSignature || null, companyStamp || null, now().split('T')[0], now(), req.user?.id || null, req.user?.name || null, do_.id);

      recalcInvoiceDeliveryStatus(do_.invoiceId);
      addAudit(do_.id, 'DELIVERED', `BL ${do_.deliveryNumber} livré`, tenantId, req.user?.id, req.user?.name);
    })();

    res.json(reloadDO(do_.id));
  } catch (error) {
    res.status(500).json({ error: 'Erreur de livraison BL' });
  }
});

// Cancel (restore stock if was validated)
router.post('/:id/cancel', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const do_ = db.prepare('SELECT * FROM delivery_orders WHERE id = ? AND tenantId = ?').get(req.params.id, tenantId) as any;
    if (!do_) return res.status(404).json({ error: 'BL introuvable' });
    if (do_.status === 'cancelled') return res.status(400).json({ error: 'Déjà annulé' });

    db.transaction(() => {
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
        .run('cancelled', now(), now(), req.user?.id || null, req.user?.name || null, do_.id);
      recalcInvoiceDeliveryStatus(do_.invoiceId);
      addAudit(do_.id, 'CANCELLED', `BL ${do_.deliveryNumber} annulé`, tenantId, req.user?.id, req.user?.name);
    })();

    res.json(reloadDO(do_.id));
  } catch (error) {
    res.status(500).json({ error: 'Erreur d\'annulation BL' });
  }
});

function reloadDO(id: string) {
  const do_ = db.prepare('SELECT * FROM delivery_orders WHERE id = ?').get(id) as any;
  const items = db.prepare('SELECT * FROM delivery_order_items WHERE deliveryOrderId = ?').all(id);
  return { ...do_, items };
}

export default router;
