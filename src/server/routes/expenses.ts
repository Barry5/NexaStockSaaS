import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { expenseSchema } from '../schemas/index.js';
import { expenseService } from '../services/domain/expenseService.js';

const router = Router();

router.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const expenses = expenseService.getAll(tenantId);
    res.json(expenses);
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticateToken, validate(expenseSchema), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const newExpense = expenseService.create(req.body, tenantId);
    res.status(201).json(newExpense);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticateToken, validate(expenseSchema), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const updated = expenseService.update(id, req.body, tenantId);
    if (!updated) {
      return res.status(404).json({ error: 'Dépense introuvable.' });
    }
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authenticateToken, (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const deleted = expenseService.delete(id, tenantId);
    if (!deleted) {
      return res.status(404).json({ error: 'Dépense introuvable.' });
    }
    res.json({ success: true, message: 'La dépense a été supprimée avec succès.' });
  } catch (error) {
    next(error);
  }
});

export default router;
