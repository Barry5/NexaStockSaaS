import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { moduleService } from '../services/domain/moduleService.js';

const router = Router();

router.get('/definitions', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const modules = moduleService.getDefinitions();
    res.json({ modules });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors du chargement des modules.' });
  }
});

router.get('/plan/:planId', authenticateToken, requirePermission('settings.edit'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const modules = moduleService.getPlanModules(req.params.planId);
    res.json({ modules });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors du chargement.' });
  }
});

router.put('/plan/:planId', authenticateToken, requirePermission('settings.edit'), (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user?.role !== 'superadmin') return res.status(403).json({ error: 'Réservé au super administrateur.' });
    const { planId } = req.params;
    const { modules: moduleKeys }: { modules: string[] } = req.body;
    if (!Array.isArray(moduleKeys)) return res.status(400).json({ error: 'Liste de modules requise.' });
    const modules = moduleService.setPlanModules(planId, moduleKeys);
    res.json({ success: true, modules });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la mise à jour.' });
  }
});

router.get('/tenant/:tenantId', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user?.role !== 'superadmin' && req.user?.tenantId !== req.params.tenantId) {
      return res.status(403).json({ error: 'Accès refusé.' });
    }
    const modules = moduleService.getTenantModules(req.params.tenantId);
    res.json({ modules });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors du chargement.' });
  }
});

router.put('/tenant/:tenantId/override', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user?.role !== 'superadmin') return res.status(403).json({ error: 'Réservé au super administrateur.' });
    const { tenantId } = req.params;
    const { moduleKey, enabled }: { moduleKey: string; enabled: boolean } = req.body;
    if (!moduleKey) return res.status(400).json({ error: 'moduleKey requis.' });
    const modules = moduleService.setTenantModuleOverride(tenantId, moduleKey, enabled);
    res.json({ success: true, modules });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la mise à jour.' });
  }
});

router.get('/my-modules', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié.' });
    if (req.user.role === 'superadmin') {
      const allModules = moduleService.getDefinitions();
      return res.json({ modules: allModules.map((m: any) => m.key), definitions: allModules });
    }
    const tenantId = req.user.tenantId;
    if (!tenantId) return res.status(403).json({ error: 'Aucun abonnement associé.' });
    const result = moduleService.getUserModules(tenantId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors du chargement.' });
  }
});

export default router;
