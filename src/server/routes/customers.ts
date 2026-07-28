import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { customerSchema } from '../schemas/index.js';
import { customerService } from '../services/domain/customerService.js';

const router = Router();

router.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const customers = customerService.getAll(tenantId);
    res.json(customers);
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticateToken, validate(customerSchema), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const newCustomer = customerService.create(req.body, tenantId);
    res.status(201).json(newCustomer);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticateToken, validate(customerSchema), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const updated = customerService.update(id, req.body, tenantId);
    if (!updated) {
      return res.status(404).json({ error: 'Client introuvable.' });
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
    const deleted = customerService.delete(id, tenantId);
    if (!deleted) {
      return res.status(404).json({ error: 'Client introuvable.' });
    }
    res.json({ success: true, message: 'Le client a été supprimé avec succès.' });
  } catch (error) {
    next(error);
  }
});

export default router;
