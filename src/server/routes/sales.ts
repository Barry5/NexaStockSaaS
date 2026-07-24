import { Router, Response } from 'express';
import db from '../database/db.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { saleSchema } from '../schemas/index.js';

const router = Router();

// GET: Retrieve sales list for tenant
router.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const sales = db.prepare('SELECT * FROM sales WHERE tenantId = ? ORDER BY date DESC').all(tenantId) as any[];

    // Map nested sale items for each sale
    const salesWithItems = sales.map(s => {
      const items = db.prepare('SELECT * FROM sale_items WHERE saleId = ?').all(s.id);
      return {
        ...s,
        items
      };
    });

    res.json(salesWithItems);
  } catch (error) {
    next(error);
  }
});

// POST: Register a new sale (with atomic stock deduction & customer debt accretion)
router.post('/', authenticateToken, validate(saleSchema), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const saleData = req.body;
    const saleId = saleData.id || `sa-${Math.floor(Math.random() * 90000 + 10000)}`;

    const result = db.transaction(() => {
      // 1. Insert the Sale
      db.prepare(`
        INSERT INTO sales (id, invoiceNumber, date, subtotal, tax, taxRate, discount, total, paymentMethod, customerId, customerName, tenantId, employeeId, employeeName)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        saleId,
        saleData.invoiceNumber,
        saleData.date || new Date().toISOString(),
        saleData.subtotal,
        saleData.tax,
        saleData.taxRate || 20,
        saleData.discount || 0,
        saleData.total,
        saleData.paymentMethod,
        saleData.customerId || null,
        saleData.customerName || null,
        tenantId,
        req.user!.id,
        req.user!.name
      );

      // 2. Insert items, deduct inventory, handle customer debt
      for (const item of saleData.items) {
        // Insert into sale_items
        db.prepare(`
          INSERT INTO sale_items (id, saleId, productId, productName, quantity, price, total)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          `${saleId}-item-${Math.floor(Math.random() * 900000 + 100000)}`,
          saleId,
          item.productId || null,
          item.productName,
          item.quantity,
          item.price,
          item.total
        );

        // Deduct inventory stock
        const product = db.prepare('SELECT quantity, name FROM products WHERE id = ? AND tenantId = ?').get(item.productId, tenantId) as { quantity: number; name: string } | undefined;
        if (product) {
          const nextQty = Math.max(0, product.quantity - item.quantity);
          db.prepare('UPDATE products SET quantity = ? WHERE id = ? AND tenantId = ?').run(nextQty, item.productId, tenantId);
        }
      }

      // 3. If credit sale, update outstanding customer debt
      if (saleData.paymentMethod === 'credit' && saleData.customerId) {
        const customer = db.prepare('SELECT outstandingDebt FROM customers WHERE id = ? AND tenantId = ?').get(saleData.customerId, tenantId) as { outstandingDebt: number } | undefined;
        if (customer) {
          const newDebt = customer.outstandingDebt + saleData.total;
          db.prepare('UPDATE customers SET outstandingDebt = ? WHERE id = ? AND tenantId = ?').run(newDebt, saleData.customerId, tenantId);
        }
      }

      // 4. Record Audit Log
      const auditId = `aud-${Math.floor(Math.random() * 9000000 + 1000000)}`;
      db.prepare(`
        INSERT INTO audit_logs (id, timestamp, userId, userName, action, details, tenantId)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        auditId,
        new Date().toISOString(),
        req.user!.id,
        req.user!.name,
        'VENTE_CREE',
        `Enregistrement de la vente ${saleData.invoiceNumber} d'un montant total de ${saleData.total} EUR`,
        tenantId
      );

      return { id: saleId, ...saleData };
    })();

    res.status(211).json(result);
  } catch (error) {
    next(error);
  }
});

// DELETE: Cancel/refund a sale
router.delete('/:id', authenticateToken, (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const sale = db.prepare('SELECT * FROM sales WHERE id = ? AND tenantId = ?').get(id, tenantId) as any;
    if (!sale) {
      return res.status(404).json({ error: 'Vente introuvable.' });
    }

    db.transaction(() => {
      const items = db.prepare('SELECT * FROM sale_items WHERE saleId = ?').all(id) as any[];

      // 1. Restore product inventory levels
      for (const item of items) {
        const product = db.prepare('SELECT quantity FROM products WHERE id = ? AND tenantId = ?').get(item.productId, tenantId) as any;
        if (product) {
          const restoredQty = product.quantity + item.quantity;
          db.prepare('UPDATE products SET quantity = ? WHERE id = ? AND tenantId = ?').run(restoredQty, item.productId, tenantId);
        }
      }

      // 2. Reduce customer debt if credit sale
      if (sale.paymentMethod === 'credit' && sale.customerId) {
        const customer = db.prepare('SELECT outstandingDebt FROM customers WHERE id = ? AND tenantId = ?').get(sale.customerId, tenantId) as any;
        if (customer) {
          const reducedDebt = Math.max(0, customer.outstandingDebt - sale.total);
          db.prepare('UPDATE customers SET outstandingDebt = ? WHERE id = ? AND tenantId = ?').run(reducedDebt, sale.customerId, tenantId);
        }
      }

      // 3. Delete from tables (due to cascade, deleting sales deletes sale_items too)
      db.prepare('DELETE FROM sales WHERE id = ? AND tenantId = ?').run(id, tenantId);

      // 4. Audit logging
      const auditId = `aud-${Math.floor(Math.random() * 9000000 + 1000000)}`;
      db.prepare(`
        INSERT INTO audit_logs (id, timestamp, userId, userName, action, details, tenantId)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        auditId,
        new Date().toISOString(),
        req.user!.id,
        req.user!.name,
        'VENTE_ANNULEE',
        `Annulation de la facture ${sale.invoiceNumber} d'un montant de ${sale.total} EUR`,
        tenantId
      );
    })();

    res.json({ success: true, message: 'La vente a été annulée et le stock a été réapprovisionné.' });
  } catch (error) {
    next(error);
  }
});

export default router;
