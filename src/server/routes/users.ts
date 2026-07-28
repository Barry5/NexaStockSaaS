import { Router, Response } from 'express';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import { userService } from '../services/domain/userService.js';

const router = Router();

router.get('/', authenticateToken, requireRole(['owner', 'admin', 'gerant']), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const users = userService.getAll(tenantId);
    res.json(users);
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticateToken, requireRole(['owner', 'admin', 'gerant']), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const createdUser = await userService.create(req.body, tenantId);
    res.status(201).json(createdUser);
  } catch (error: any) {
    if (error.message === 'Cette adresse email est déjà enregistrée.') {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

router.put('/:id', authenticateToken, requireRole(['owner', 'admin', 'gerant']), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const updatedUser = await userService.update(id, req.body, tenantId);
    if (!updatedUser) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }
    res.json(updatedUser);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authenticateToken, requireRole(['owner', 'admin']), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    if (id === req.user!.id) {
      return res.status(400).json({ error: 'Vous ne pouvez pas révoquer votre propre compte.' });
    }
    const deleted = userService.delete(id, tenantId);
    if (!deleted) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }
    res.json({ success: true, message: 'Le compte d\'accès de l\'utilisateur a été révoqué.' });
  } catch (error) {
    next(error);
  }
});

export default router;
