import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { invoiceService } from '../services/domain/invoiceService.js';

const router = Router();

router.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.query.tenantId as string || req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'tenantId requis' });
  const result = invoiceService.getAll(tenantId);
  res.json(result);
});

router.get('/:id', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const result = invoiceService.getById(req.params.id);
  if (!result) return res.status(404).json({ error: 'Facture introuvable' });
  res.json(result);
});

router.post('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'Aucun tenant actif' });
  try {
    const result = invoiceService.create(req.body, tenantId, req.user?.id, req.user?.name);
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:id', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'Aucun tenant actif' });
  try {
    const result = invoiceService.update(req.params.id, req.body, tenantId, req.user?.id, req.user?.name);
    if (!result) return res.status(404).json({ error: 'Facture introuvable' });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/validate', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = invoiceService.validate(req.params.id, req.user?.id, req.user?.name);
    if (!result) return res.status(404).json({ error: 'Facture introuvable' });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/cancel', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { reason } = req.body;
    const result = invoiceService.cancel(req.params.id, reason, req.user?.id, req.user?.name);
    if (!result) return res.status(404).json({ error: 'Facture introuvable' });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/delivery-orders', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { items, notes } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: 'Au moins un article requis' });
    const result = invoiceService.createDeliveryOrder(req.params.id, items, notes, req.user?.id, req.user?.name);
    if (!result) return res.status(404).json({ error: 'Facture introuvable' });
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/delivery-orders/:id/validate', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = invoiceService.validateDeliveryOrder(req.params.id, req.user?.id, req.user?.name);
    if (!result) return res.status(404).json({ error: 'BL introuvable' });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/delivery-orders/:id/cancel', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = invoiceService.cancelDeliveryOrder(req.params.id, req.user?.id, req.user?.name);
    if (!result) return res.status(404).json({ error: 'BL introuvable' });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/payments', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = invoiceService.recordPayment(req.params.id, req.body, req.user?.id, req.user?.name);
    if (!result) return res.status(404).json({ error: 'Facture introuvable' });
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/returns', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { items, reason } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: 'Au moins un article requis' });
    const result = invoiceService.createReturn(req.params.id, items, reason, req.user?.id, req.user?.name);
    if (!result) return res.status(404).json({ error: 'Facture introuvable' });
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/returns/:id/validate', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = invoiceService.validateReturn(req.params.id, req.user?.id, req.user?.name);
    if (!result) return res.status(404).json({ error: 'Retour introuvable' });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:id/audit', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const logs = invoiceService.getAuditLogs(req.params.id);
  res.json(logs);
});

export default router;
