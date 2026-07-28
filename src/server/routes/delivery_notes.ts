import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { deliveryNoteService } from '../services/domain/deliveryNoteService.js';

const router = Router();

router.get('/dashboard', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'Tenant requis' });
    const result = deliveryNoteService.getDashboard(tenantId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Erreur du tableau de bord BL' });
  }
});

router.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'Tenant requis' });
    const result = deliveryNoteService.search(tenantId, req.query as any);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Erreur de recherche BL' });
  }
});

router.get('/:id', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const result = deliveryNoteService.getById(req.params.id, tenantId);
    if (!result) return res.status(404).json({ error: 'BL introuvable' });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Erreur de récupération BL' });
  }
});

router.get('/invoice/:invoiceId', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const result = deliveryNoteService.getInvoiceHistory(req.params.invoiceId, tenantId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Erreur de récupération historique' });
  }
});

router.post('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'Tenant requis' });
    const result = deliveryNoteService.create(req.body, tenantId, req.user?.id, req.user?.name);
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Erreur de création du BL" });
  }
});

router.put('/:id', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const result = deliveryNoteService.update(req.params.id, req.body, tenantId, req.user?.id, req.user?.name);
    if (!result) return res.status(404).json({ error: 'BL introuvable' });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Erreur de modification BL' });
  }
});

router.post('/:id/validate', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const result = deliveryNoteService.validate(req.params.id, tenantId, req.user?.id, req.user?.name);
    if (!result) return res.status(404).json({ error: 'BL introuvable' });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Erreur de validation BL' });
  }
});

router.post('/:id/in-transit', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const result = deliveryNoteService.markInTransit(req.params.id, req.body, tenantId, req.user?.id, req.user?.name);
    if (!result) return res.status(404).json({ error: 'BL introuvable' });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Erreur de mise à jour BL' });
  }
});

router.post('/:id/deliver', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const result = deliveryNoteService.markDelivered(req.params.id, req.body, tenantId, req.user?.id, req.user?.name);
    if (!result) return res.status(404).json({ error: 'BL introuvable' });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Erreur de livraison BL' });
  }
});

router.post('/:id/cancel', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const result = deliveryNoteService.cancel(req.params.id, tenantId, req.user?.id, req.user?.name);
    if (!result) return res.status(404).json({ error: 'BL introuvable' });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Erreur d'annulation BL" });
  }
});

export default router;
