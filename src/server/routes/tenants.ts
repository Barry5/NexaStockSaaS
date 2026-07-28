import { Router, Response } from 'express';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { tenantUpdateSchema } from '../schemas/index.js';
import { tenantService } from '../services/domain/tenantService.js';

const router = Router();

router.get('/settings', authenticateToken, (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const result = tenantService.getSettings();
    res.json(result);
  } catch (error) { next(error); }
});

router.put('/settings', authenticateToken, requireRole(['superadmin']), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const result = tenantService.updateSettings(req.body);
    res.json(result);
  } catch (error) { next(error); }
});

router.get('/tenants', authenticateToken, requireRole(['superadmin']), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenants = tenantService.getAllTenants();
    res.json(tenants);
  } catch (error) { next(error); }
});

router.get('/tenants/:id', authenticateToken, requireRole(['superadmin']), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const result = tenantService.getTenantById(req.params.id);
    if (!result) return res.status(404).json({ error: 'Entreprise introuvable' });
    res.json(result);
  } catch (error) { next(error); }
});

router.post('/tenants', authenticateToken, requireRole(['superadmin']), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const result = tenantService.createTenant(req.body);
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/tenants/:id', authenticateToken, requireRole(['superadmin']), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const result = tenantService.updateTenant(req.params.id, req.body);
    if (!result) return res.status(404).json({ error: 'Entreprise introuvable' });
    res.json(result);
  } catch (error) { next(error); }
});

router.put('/tenants/:id/status', authenticateToken, requireRole(['superadmin']), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { status } = req.body;
    const result = tenantService.updateTenantStatus(req.params.id, status);
    if (!result) return res.status(404).json({ error: 'Entreprise introuvable' });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/tenants/:id/plan', authenticateToken, requireRole(['superadmin']), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { plan } = req.body;
    if (!plan) return res.status(400).json({ error: 'Plan requis' });
    const result = tenantService.updateTenantPlan(req.params.id, plan);
    if (!result) return res.status(404).json({ error: 'Entreprise introuvable' });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/tenants/:id/expiry', authenticateToken, requireRole(['superadmin']), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const result = tenantService.updateTenantExpiry(req.params.id, req.body);
    if (!result) return res.status(404).json({ error: 'Entreprise introuvable' });
    res.json(result);
  } catch (error) { next(error); }
});

router.post('/tenants/:id/trial', authenticateToken, requireRole(['superadmin']), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { days } = req.body;
    const result = tenantService.grantTrial(req.params.id, days);
    if (!result) return res.status(404).json({ error: 'Entreprise introuvable' });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/tenants/:id/stats', authenticateToken, requireRole(['superadmin']), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const result = tenantService.getTenantStats(req.params.id);
    if (!result) return res.status(404).json({ error: 'Entreprise introuvable' });
    res.json(result);
  } catch (error) { next(error); }
});

router.get('/tenants/:id/logs', authenticateToken, requireRole(['superadmin']), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const result = tenantService.getTenantLogs(req.params.id);
    if (!result) return res.status(404).json({ error: 'Entreprise introuvable' });
    res.json(result);
  } catch (error) { next(error); }
});

router.delete('/tenants/:id', authenticateToken, requireRole(['superadmin']), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const result = tenantService.deleteTenant(req.params.id);
    if (!result) return res.status(404).json({ error: 'Entreprise introuvable' });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/my-tenant', authenticateToken, validate(tenantUpdateSchema), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const result = tenantService.updateMyTenant(tenantId, req.body);
    res.json(result);
  } catch (error) { next(error); }
});

router.put('/tenants/:id/subscription', authenticateToken, requireRole(['superadmin']), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const result = tenantService.updateSubscription(req.params.id, req.body);
    res.json(result);
  } catch (error) { next(error); }
});

router.get('/payments', authenticateToken, (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const payments = tenantService.getPayments(req.user!);
    res.json(payments);
  } catch (error) { next(error); }
});

router.post('/payments', authenticateToken, (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const result = tenantService.createPayment(req.body, req.user!);
    res.status(201).json(result);
  } catch (error) { next(error); }
});

router.put('/payments/:id/audit', authenticateToken, requireRole(['superadmin']), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const result = tenantService.auditPayment(req.params.id, req.body);
    if (!result) return res.status(404).json({ error: 'Déclaration de paiement introuvable.' });
    res.json(result);
  } catch (error) { next(error); }
});

export default router;
