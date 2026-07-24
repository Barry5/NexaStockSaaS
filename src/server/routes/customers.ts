import { Router, Response } from 'express';
import db from '../database/db.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { customerSchema } from '../schemas/index.js';

const router = Router();

// GET: Retrieve customers
router.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const customers = db.prepare('SELECT * FROM customers WHERE tenantId = ? ORDER BY name ASC').all(tenantId);
    res.json(customers);
  } catch (error) {
    next(error);
  }
});

// POST: Add customer
router.post('/', authenticateToken, validate(customerSchema), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { name, email, phone, loyaltyPoints, outstandingDebt } = req.body;
    const id = req.body.id || `c-${Math.floor(Math.random() * 90000 + 10000)}`;
    const createdAt = new Date().toISOString();

    db.prepare(`
      INSERT INTO customers (id, name, email, phone, loyaltyPoints, outstandingDebt, tenantId, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, email || null, phone || null, loyaltyPoints || 0, outstandingDebt || 0.0, tenantId, createdAt);

    const newCustomer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    res.status(201).json(newCustomer);
  } catch (error) {
    next(error);
  }
});

// PUT: Update customer
router.put('/:id', authenticateToken, validate(customerSchema), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { name, email, phone, loyaltyPoints, outstandingDebt } = req.body;

    const customer = db.prepare('SELECT * FROM customers WHERE id = ? AND tenantId = ?').get(id, tenantId);
    if (!customer) {
      return res.status(404).json({ error: 'Client introuvable.' });
    }

    db.prepare(`
      UPDATE customers 
      SET name = ?, email = ?, phone = ?, loyaltyPoints = ?, outstandingDebt = ?
      WHERE id = ? AND tenantId = ?
    `).run(name, email || null, phone || null, loyaltyPoints, outstandingDebt, id, tenantId);

    const updatedCustomer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    res.json(updatedCustomer);
  } catch (error) {
    next(error);
  }
});

// DELETE: Delete customer
router.delete('/:id', authenticateToken, (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const customer = db.prepare('SELECT * FROM customers WHERE id = ? AND tenantId = ?').get(id, tenantId);
    if (!customer) {
      return res.status(404).json({ error: 'Client introuvable.' });
    }

    db.prepare('DELETE FROM customers WHERE id = ? AND tenantId = ?').run(id, tenantId);
    res.json({ success: true, message: 'Le client a été supprimé avec succès.' });
  } catch (error) {
    next(error);
  }
});

export default router;
