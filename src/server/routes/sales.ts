import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { saleSchema } from '../schemas/index.js';
import { saleService } from '../services/domain/saleService.js';

const router = Router();

router.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const sales = saleService.getAll(tenantId);
    res.json(sales);
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticateToken, validate(saleSchema), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const result = saleService.create(req.body, tenantId, req.user!.id, req.user!.name);
    res.status(211).json(result);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authenticateToken, (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const deleted = saleService.delete(id, tenantId, req.user!.id, req.user!.name);
    if (!deleted) {
      return res.status(404).json({ error: 'Vente introuvable.' });
    }
    res.json({ success: true, message: 'La vente a été annulée et le stock a été réapprovisionné.' });
  } catch (error) {
    next(error);
  }
});

export default router;
