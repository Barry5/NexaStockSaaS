import { Router, Response } from 'express';
import db from '../database/db.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { warehouseSchema, stockTransferSchema } from '../schemas/index.js';

const router = Router();

// GET: Retrieve warehouses and transfers
router.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const warehouses = db.prepare('SELECT * FROM warehouses WHERE tenantId = ? ORDER BY name ASC').all(tenantId);
    const transfers = db.prepare('SELECT * FROM stock_transfers WHERE tenantId = ? ORDER BY date DESC').all(tenantId);

    res.json({
      warehouses,
      transfers
    });
  } catch (error) {
    next(error);
  }
});

// POST: Add new warehouse
router.post('/', authenticateToken, validate(warehouseSchema), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { name, location } = req.body;
    const id = req.body.id || `wh-${Math.floor(Math.random() * 90000 + 10000)}`;

    db.prepare(`
      INSERT INTO warehouses (id, name, location, tenantId)
      VALUES (?, ?, ?, ?)
    `).run(id, name, location || null, tenantId);

    const newWarehouse = db.prepare('SELECT * FROM warehouses WHERE id = ?').get(id);
    res.status(201).json(newWarehouse);
  } catch (error) {
    next(error);
  }
});

// PUT: Update warehouse
router.put('/:id', authenticateToken, validate(warehouseSchema), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { name, location } = req.body;

    const warehouse = db.prepare('SELECT * FROM warehouses WHERE id = ? AND tenantId = ?').get(id, tenantId);
    if (!warehouse) {
      return res.status(404).json({ error: 'Entrepôt introuvable.' });
    }

    db.prepare(`
      UPDATE warehouses 
      SET name = ?, location = ?
      WHERE id = ? AND tenantId = ?
    `).run(name, location || null, id, tenantId);

    const updatedWarehouse = db.prepare('SELECT * FROM warehouses WHERE id = ?').get(id);
    res.json(updatedWarehouse);
  } catch (error) {
    next(error);
  }
});

// DELETE: Delete warehouse
router.delete('/:id', authenticateToken, (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const warehouse = db.prepare('SELECT * FROM warehouses WHERE id = ? AND tenantId = ?').get(id, tenantId);
    if (!warehouse) {
      return res.status(404).json({ error: 'Entrepôt introuvable.' });
    }

    db.prepare('DELETE FROM warehouses WHERE id = ? AND tenantId = ?').run(id, tenantId);
    res.json({ success: true, message: 'Entrepôt supprimé avec succès.' });
  } catch (error) {
    next(error);
  }
});

// POST: Record Stock Transfer
router.post('/transfer', authenticateToken, validate(stockTransferSchema), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { productId, productName, fromWarehouseId, toWarehouseId, quantity, date, status } = req.body;
    const id = req.body.id || `tr-${Math.floor(Math.random() * 90000 + 10000)}`;

    const result = db.transaction(() => {
      // 1. Record stock transfer log
      db.prepare(`
        INSERT INTO stock_transfers (id, productId, productName, fromWarehouseId, toWarehouseId, quantity, date, status, tenantId)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, productId, productName, fromWarehouseId, toWarehouseId, quantity, date || new Date().toISOString(), status || 'termine', tenantId);

      // 2. Note: For active store quantities, we can also perform transfers or check product inventory.
      // Since global product list tracks active quantities, let's keep track of actual moves in transfer history.
      
      // 3. Record audit log
      const auditId = `aud-${Math.floor(Math.random() * 9000000 + 1000000)}`;
      db.prepare(`
        INSERT INTO audit_logs (id, timestamp, userId, userName, action, details, tenantId)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        auditId,
        new Date().toISOString(),
        req.user!.id,
        req.user!.name,
        'STOCKS_TRANSFERT',
        `Transfert de ${quantity} x "${productName}" de l'entrepôt ${fromWarehouseId} vers ${toWarehouseId}`,
        tenantId
      );

      return db.prepare('SELECT * FROM stock_transfers WHERE id = ?').get(id);
    })();

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
