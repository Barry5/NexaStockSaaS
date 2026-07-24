import { Router, Response } from 'express';
import db from '../database/db.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { expenseSchema } from '../schemas/index.js';

const router = Router();

// GET: Retrieve expenses
router.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const expenses = db.prepare('SELECT * FROM expenses WHERE tenantId = ? ORDER BY date DESC').all(tenantId);
    res.json(expenses);
  } catch (error) {
    next(error);
  }
});

// POST: Add expense
router.post('/', authenticateToken, validate(expenseSchema), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { title, amount, category, date, description, recipient, paymentMethod, status, attachment } = req.body;
    const id = req.body.id || `e-${Math.floor(Math.random() * 90000 + 10000)}`;

    db.prepare(`
      INSERT INTO expenses (id, title, amount, category, date, description, recipient, paymentMethod, status, attachment, tenantId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, title, amount, category, date, description || null, recipient || null, paymentMethod, status || 'en_attente', attachment || null, tenantId);

    const newExpense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
    res.status(201).json(newExpense);
  } catch (error) {
    next(error);
  }
});

// PUT: Update expense
router.put('/:id', authenticateToken, validate(expenseSchema), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { title, amount, category, date, description, recipient, paymentMethod, status, attachment } = req.body;

    const expense = db.prepare('SELECT * FROM expenses WHERE id = ? AND tenantId = ?').get(id, tenantId);
    if (!expense) {
      return res.status(404).json({ error: 'Dépense introuvable.' });
    }

    db.prepare(`
      UPDATE expenses 
      SET title = ?, amount = ?, category = ?, date = ?, description = ?, recipient = ?, paymentMethod = ?, status = ?, attachment = ?
      WHERE id = ? AND tenantId = ?
    `).run(title, amount, category, date, description || null, recipient || null, paymentMethod, status, attachment || null, id, tenantId);

    const updatedExpense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
    res.json(updatedExpense);
  } catch (error) {
    next(error);
  }
});

// DELETE: Delete expense
router.delete('/:id', authenticateToken, (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const expense = db.prepare('SELECT * FROM expenses WHERE id = ? AND tenantId = ?').get(id, tenantId);
    if (!expense) {
      return res.status(404).json({ error: 'Dépense introuvable.' });
    }

    db.prepare('DELETE FROM expenses WHERE id = ? AND tenantId = ?').run(id, tenantId);
    res.json({ success: true, message: 'La dépense a été supprimée avec succès.' });
  } catch (error) {
    next(error);
  }
});

export default router;
