import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { supplierSchema } from '../schemas/index.js';
import { supplierService } from '../services/domain/supplierService.js';

const router = Router();

router.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const suppliers = supplierService.getAll(tenantId);
    res.json(suppliers);
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticateToken, validate(supplierSchema), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const newSupplier = supplierService.create(req.body, tenantId);
    res.status(201).json(newSupplier);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticateToken, validate(supplierSchema), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const updated = supplierService.update(id, req.body, tenantId);
    if (!updated) {
      return res.status(404).json({ error: 'Fournisseur introuvable.' });
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
    const deleted = supplierService.delete(id, tenantId);
    if (!deleted) {
      return res.status(404).json({ error: 'Fournisseur introuvable.' });
    }
    res.json({ success: true, message: 'Le fournisseur a été supprimé avec succès.' });
  } catch (error) {
    next(error);
  }
});

export default router;
