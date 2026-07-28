import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loanSchema } from '../schemas/index.js';
import { loanService } from '../services/domain/loanService.js';

const router = Router();

router.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const loans = loanService.getAll(tenantId);
    res.json(loans);
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticateToken, validate(loanSchema), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const result = loanService.create(req.body, tenantId);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticateToken, validate(loanSchema), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const result = loanService.update(id, req.body, tenantId);
    if (!result) {
      return res.status(404).json({ error: 'Emprunt/prêt introuvable.' });
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authenticateToken, (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const deleted = loanService.delete(id, tenantId);
    if (!deleted) {
      return res.status(404).json({ error: 'Emprunt/prêt introuvable.' });
    }
    res.json({ success: true, message: 'Le registre de prêt a été supprimé avec succès.' });
  } catch (error) {
    next(error);
  }
});

export default router;
