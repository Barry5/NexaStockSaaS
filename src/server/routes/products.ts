import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { productSchema } from '../schemas/index.js';
import { productService } from '../services/domain/productService.js';

const router = Router();

router.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const products = productService.getAll(tenantId);
    res.json(products);
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticateToken, validate(productSchema), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const product = productService.create(req.body, tenantId);
    res.status(201).json(product);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticateToken, validate(productSchema), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const updated = productService.update(id, req.body, tenantId);
    if (!updated) {
      return res.status(404).json({ error: 'Produit introuvable dans votre boutique.' });
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
    const deleted = productService.delete(id, tenantId);
    if (!deleted) {
      return res.status(404).json({ error: 'Produit introuvable dans votre boutique.' });
    }
    res.json({ success: true, message: 'Le produit a été supprimé avec succès.' });
  } catch (error) {
    next(error);
  }
});

export default router;
