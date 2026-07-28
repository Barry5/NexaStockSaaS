import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { commissionService } from '../services/domain/commissionService.js';

const router = Router();

router.get('/affiliates', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.query.tenantId as string || req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'tenantId requis' });
  const result = commissionService.getAffiliates(tenantId);
  res.json(result);
});

router.post('/affiliates', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'Aucun tenant actif' });
  try {
    const result = commissionService.createAffiliate(req.body, tenantId, req.user?.id, req.user?.name);
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/affiliates/:id', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = commissionService.updateAffiliate(req.params.id, req.body, req.user?.id, req.user?.name);
    if (!result) return res.status(404).json({ error: 'Apporteur introuvable' });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/rules', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.query.tenantId as string || req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'tenantId requis' });
  const rules = commissionService.getRules(tenantId);
  res.json(rules);
});

router.post('/rules', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'Aucun tenant actif' });
  try {
    const rule = commissionService.createRule(req.body, tenantId);
    res.status(201).json(rule);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/rules/:id', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const result = commissionService.updateRule(req.params.id, req.body);
  if (!result) return res.status(404).json({ error: 'Règle introuvable' });
  res.json(result);
});

router.delete('/rules/:id', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const deleted = commissionService.deleteRule(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Règle introuvable' });
  res.json({ success: true });
});

router.get('/ledger/:affiliateId', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const result = commissionService.getLedger(req.params.affiliateId);
  res.json(result);
});

router.post('/ledger', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'Aucun tenant actif' });
  try {
    const entry = commissionService.createLedgerEntry(req.body, tenantId, req.user?.id, req.user?.name);
    res.status(201).json(entry);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/calculate', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = commissionService.calculateCommissions(req.body, req.user?.id, req.user?.name);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/payments', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.query.tenantId as string || req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'tenantId requis' });
  const payments = commissionService.getPayments(tenantId);
  res.json(payments);
});

router.post('/payments', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'Aucun tenant actif' });
  try {
    const result = commissionService.recordPayment(req.body, tenantId, req.user?.id, req.user?.name);
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/dashboard', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.query.tenantId as string || req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'tenantId requis' });
  const result = commissionService.getDashboard(tenantId);
  res.json(result);
});

router.get('/affiliates/:id/statement', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const result = commissionService.getAffiliateStatement(req.params.id);
  res.json(result);
});

export default router;
