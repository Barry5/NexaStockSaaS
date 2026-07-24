import { Router, Response } from 'express';
import db from '../database/db.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { supplierSchema } from '../schemas/index.js';

const router = Router();

// GET: Retrieve suppliers
router.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const suppliers = db.prepare('SELECT * FROM suppliers WHERE tenantId = ? ORDER BY name ASC').all(tenantId);
    res.json(suppliers);
  } catch (error) {
    next(error);
  }
});

// POST: Add supplier
router.post('/', authenticateToken, validate(supplierSchema), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { name, contactName, phone, email } = req.body;
    const id = req.body.id || `s-${Math.floor(Math.random() * 90000 + 10000)}`;
    const createdAt = new Date().toISOString();

    db.prepare(`
      INSERT INTO suppliers (id, name, contactName, phone, email, tenantId, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, contactName || null, phone || null, email || null, tenantId, createdAt);

    const newSupplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
    res.status(201).json(newSupplier);
  } catch (error) {
    next(error);
  }
});

// PUT: Update supplier
router.put('/:id', authenticateToken, validate(supplierSchema), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { name, contactName, phone, email } = req.body;

    const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ? AND tenantId = ?').get(id, tenantId);
    if (!supplier) {
      return res.status(404).json({ error: 'Fournisseur introuvable.' });
    }

    db.prepare(`
      UPDATE suppliers 
      SET name = ?, contactName = ?, phone = ?, email = ?
      WHERE id = ? AND tenantId = ?
    `).run(name, contactName || null, phone || null, email || null, id, tenantId);

    const updatedSupplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
    res.json(updatedSupplier);
  } catch (error) {
    next(error);
  }
});

// DELETE: Delete supplier
router.delete('/:id', authenticateToken, (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ? AND tenantId = ?').get(id, tenantId);
    if (!supplier) {
      return res.status(404).json({ error: 'Fournisseur introuvable.' });
    }

    db.prepare('DELETE FROM suppliers WHERE id = ? AND tenantId = ?').run(id, tenantId);
    res.json({ success: true, message: 'Le fournisseur a été supprimé avec succès.' });
  } catch (error) {
    next(error);
  }
});

export default router;
