import { Router, Response } from 'express';
import db from '../database/db.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { getTenantAvailableModules } from '../middleware/tenantAccess.js';

const router = Router();

router.get('/definitions', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const modules = db.prepare('SELECT * FROM module_definitions ORDER BY display_order').all();
    res.json({ modules });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors du chargement des modules.' });
  }
});

router.get('/plan/:planId', authenticateToken, requirePermission('settings.edit'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const modules = db.prepare('SELECT * FROM plan_modules WHERE planId = ?').all(req.params.planId);
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

    db.prepare('DELETE FROM plan_modules WHERE planId = ?').run(planId);

    const insert = db.prepare('INSERT INTO plan_modules (id, planId, moduleKey, enabled) VALUES (?, ?, ?, 1)');
    const now = Date.now();
    for (let i = 0; i < moduleKeys.length; i++) {
      insert.run(`pm-${now}-${i}`, planId, moduleKeys[i]);
    }

    const modules = db.prepare('SELECT * FROM plan_modules WHERE planId = ?').all(planId);
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
    const modules = getTenantAvailableModules(req.params.tenantId);
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

    const existing = db.prepare('SELECT id FROM tenant_modules WHERE tenantId = ? AND moduleKey = ?').get(tenantId, moduleKey) as any;
    if (existing) {
      db.prepare('UPDATE tenant_modules SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, existing.id);
    } else {
      db.prepare('INSERT INTO tenant_modules (id, tenantId, moduleKey, enabled) VALUES (?, ?, ?, ?)').run(
        `tm-${Date.now()}`, tenantId, moduleKey, enabled ? 1 : 0
      );
    }

    const modules = getTenantAvailableModules(tenantId);
    res.json({ success: true, modules });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la mise à jour.' });
  }
});

router.get('/my-modules', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié.' });
    if (req.user.role === 'superadmin') {
      const allModules = db.prepare('SELECT key, label, icon, is_core FROM module_definitions ORDER BY display_order').all();
      return res.json({ modules: allModules.map((m: any) => m.key), definitions: allModules });
    }
    const tenantId = req.user.tenantId;
    if (!tenantId) return res.status(403).json({ error: 'Aucun abonnement associé.' });

    const modules = getTenantAvailableModules(tenantId);
    const definitions = db.prepare('SELECT * FROM module_definitions ORDER BY display_order').all();
    res.json({ modules, definitions });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors du chargement.' });
  }
});

export default router;
