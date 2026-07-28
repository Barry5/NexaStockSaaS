import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { commissionV2Service } from '../services/domain/commissionV2Service.js';

const router = Router();

router.post('/sale/record', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'Aucun tenant actif' });
    const result = commissionV2Service.recordSaleCommission(req.body, tenantId, req.user?.id, req.user?.name);
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Erreur lors de l'enregistrement de la commission" });
  }
});

router.get('/sale/:saleId', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const result = commissionV2Service.getSaleCommission(req.params.saleId, tenantId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Erreur de chargement' });
  }
});

router.get('/dashboard/enhanced', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.query.tenantId as string || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'tenantId requis' });
    const result = commissionV2Service.getEnhancedDashboard(tenantId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Erreur du tableau de bord' });
  }
});

router.get('/search', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.query.tenantId as string || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'tenantId requis' });
    const result = commissionV2Service.search(tenantId, req.query as any);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Erreur de recherche' });
  }
});

router.put('/sale-commission/:id/schedule', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const result = commissionV2Service.updatePaymentSchedule(req.params.id, req.body, tenantId);
    if (!result) return res.status(404).json({ error: 'Commission vente introuvable' });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Erreur de mise à jour' });
  }
});

router.post('/batch-pay', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'Aucun tenant actif' });
    const { saleAffiliateIds, method, campaignName } = req.body;
    const result = commissionV2Service.batchPay(saleAffiliateIds, method, campaignName, tenantId, req.user?.id, req.user?.name);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Erreur de paiement groupé' });
  }
});

router.get('/pending', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.query.tenantId as string || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'tenantId requis' });
    const result = commissionV2Service.getPending(tenantId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Erreur de chargement' });
  }
});

export default router;
