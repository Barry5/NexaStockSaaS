import { Response, NextFunction } from 'express';
import db from '../database/db.js';
import { AuthenticatedRequest } from './auth.js';
import { AUTH_ERROR_MESSAGES, HTTP_STATUS } from '../constants/http.js';

export function requireActiveTenant(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: AUTH_ERROR_MESSAGES.UNAUTHENTICATED });
  if (req.user.role === 'superadmin') return next();

  const userId = req.user.id;
  const user = db.prepare('SELECT id, active, tenantId FROM users WHERE id = ?').get(userId) as any;
  if (!user) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: AUTH_ERROR_MESSAGES.USER_NOT_FOUND });
  if (!user.active) return res.status(HTTP_STATUS.FORBIDDEN).json({ error: AUTH_ERROR_MESSAGES.ACCOUNT_DISABLED });

  const tenantId = user.tenantId;
  if (!tenantId) return res.status(HTTP_STATUS.FORBIDDEN).json({ error: AUTH_ERROR_MESSAGES.NO_TENANT });

  const tenant = db.prepare('SELECT id, subscriptionStatus, subscriptionEndDate FROM tenants WHERE id = ?').get(tenantId) as any;
  if (!tenant) return res.status(HTTP_STATUS.FORBIDDEN).json({ error: AUTH_ERROR_MESSAGES.TENANT_NOT_FOUND });

  const validStatuses = ['ACTIVE', 'TRIAL'];
  if (!validStatuses.includes(tenant.subscriptionStatus)) {
    if (tenant.subscriptionStatus === 'SUSPENDED') {
      return res.status(HTTP_STATUS.LOCKED).json({ error: 'Abonnement suspendu. Contactez le support.', code: 'SUSPENDED' });
    }
    if (tenant.subscriptionStatus === 'EXPIRED' || tenant.subscriptionStatus === 'BLOCKED') {
      return res.status(HTTP_STATUS.PAYMENT_REQUIRED).json({ error: 'Abonnement expiré. Veuillez renouveler.', code: 'EXPIRED' });
    }
    return res.status(403).json({ error: `Statut d\'abonnement non valide: ${tenant.subscriptionStatus}` });
  }

  req.user.tenantId = tenantId;
  next();
}

export function getEffectivePlanId(tenant: { subscriptionPlanId?: string | null; plan?: string | null }): string | null {
  if (tenant?.subscriptionPlanId) return tenant.subscriptionPlanId;
  if (tenant?.plan) {
    const byName = db.prepare('SELECT id FROM pricing_plans WHERE name = ? AND active = 1').get(tenant.plan) as any;
    if (byName) return byName.id;
  }
  return null;
}

export function requireModuleAccess(moduleKey: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié.' });
    if (req.user.role === 'superadmin') return next();

    const tenantId = req.user.tenantId;
    if (!tenantId) return res.status(403).json({ error: 'Aucun abonnement associé.' });

    const tenant = db.prepare('SELECT subscriptionPlanId, plan FROM tenants WHERE id = ?').get(tenantId) as any;
    if (!tenant) return res.status(403).json({ error: 'Abonnement introuvable.' });

    // Check core module
    const moduleDef = db.prepare('SELECT is_core FROM module_definitions WHERE key = ?').get(moduleKey) as any;
    if (moduleDef && moduleDef.is_core) return next();

    // Check tenant override
    const tenantModule = db.prepare('SELECT enabled FROM tenant_modules WHERE tenantId = ? AND moduleKey = ?').get(tenantId, moduleKey) as any;
    if (tenantModule) {
      if (!tenantModule.enabled) return res.status(HTTP_STATUS.FORBIDDEN).json({ error: `Module "${moduleKey}" désactivé pour cet abonnement.` });
      return next();
    }

    const planId = getEffectivePlanId(tenant);
    if (!planId) return next();

    // Fail-open : un forfait sans aucune ligne plan_modules (ou non configuré)
    // ne retire jamais l'accès aux modules — un changement de forfait ne doit
    // rien changer à part le forfait.
    const planModuleCount = (db.prepare('SELECT COUNT(*) AS c FROM plan_modules WHERE planId = ?').get(planId) as any)?.c || 0;
    if (planModuleCount === 0) return next();

    // Check plan module
    const planModule = db.prepare('SELECT enabled FROM plan_modules WHERE planId = ? AND moduleKey = ?').get(planId, moduleKey) as any;
    if (!planModule) return res.status(HTTP_STATUS.FORBIDDEN).json({ error: `Module "${moduleKey}" non inclus dans votre formule.` });
    if (!planModule.enabled) return res.status(HTTP_STATUS.FORBIDDEN).json({ error: `Module "${moduleKey}" désactivé par l\'administrateur.` });

    next();
  };
}

export function requireActiveUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Non authentifié.' });
  if (req.user.role === 'superadmin') return next();

  const user = db.prepare('SELECT active FROM users WHERE id = ?').get(req.user.id) as any;
  if (!user || !user.active) return res.status(HTTP_STATUS.FORBIDDEN).json({ error: AUTH_ERROR_MESSAGES.ACCOUNT_DISABLED });

  next();
}

function allModuleKeys(): string[] {
  return (db.prepare('SELECT key FROM module_definitions ORDER BY display_order ASC').all() as any[]).map(r => r.key);
}

export function getTenantAvailableModules(tenantId: string): string[] {
  const tenant = db.prepare('SELECT subscriptionPlanId, plan FROM tenants WHERE id = ?').get(tenantId) as any;
  const planId = getEffectivePlanId(tenant);

  const planModules = planId
    ? (db.prepare('SELECT moduleKey FROM plan_modules WHERE planId = ? AND enabled = 1').all(planId) as any[]).map(p => p.moduleKey)
    : [];

  const tenantOverrides = db.prepare('SELECT moduleKey, enabled FROM tenant_modules WHERE tenantId = ?').all(tenantId) as any[];
  const disabledOverrides = tenantOverrides.filter(t => !t.enabled).map(t => t.moduleKey);

  // Fail-open : aucun module configuré pour ce forfait (forfait inconnu ou
  // plan_modules vide) -> on n'enlève jamais l'accès aux modules existants.
  // Un changement de forfait ne doit rien changer à part le forfait.
  if (planModules.length === 0) {
    return allModuleKeys().filter(k => !disabledOverrides.includes(k));
  }

  const planModuleKeys = new Set(planModules);
  for (const to of tenantOverrides) {
    if (to.enabled) {
      planModuleKeys.add(to.moduleKey);
    } else {
      planModuleKeys.delete(to.moduleKey);
    }
  }

  const coreModules = db.prepare('SELECT key FROM module_definitions WHERE is_core = 1').all() as any[];
  for (const cm of coreModules) {
    planModuleKeys.add(cm.key);
  }

  return Array.from(planModuleKeys);
}
