import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { warehouseSchema, stockTransferSchema } from '../schemas/index.js';
import { warehouseService } from '../services/domain/warehouseService.js';

const router = Router();

router.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const warehouses = warehouseService.getAll(tenantId);
    const transfers = warehouseService.getTransfers(tenantId);
    res.json({ warehouses, transfers });
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticateToken, validate(warehouseSchema), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const newWarehouse = warehouseService.create(req.body, tenantId);
    res.status(201).json(newWarehouse);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticateToken, validate(warehouseSchema), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const updated = warehouseService.update(id, req.body, tenantId);
    if (!updated) {
      return res.status(404).json({ error: 'Entrepôt introuvable.' });
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
    const deleted = warehouseService.delete(id, tenantId);
    if (!deleted) {
      return res.status(404).json({ error: 'Entrepôt introuvable.' });
    }
    res.json({ success: true, message: 'Entrepôt supprimé avec succès.' });
  } catch (error) {
    next(error);
  }
});

router.post('/transfer', authenticateToken, validate(stockTransferSchema), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const result = warehouseService.createTransfer(req.body, tenantId, req.user!.id, req.user!.name);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
