import { Response, NextFunction } from 'express';
import db from '../database/db.js';
import { AuthenticatedRequest } from './auth.js';
import { AUTH_ERROR_MESSAGES, HTTP_STATUS } from '../constants/http.js';

const PERMISSIONS_CACHE: Record<string, string> = {};

function getPermissionId(key: string): string | null {
  if (PERMISSIONS_CACHE[key]) return PERMISSIONS_CACHE[key];
  const row = db.prepare('SELECT id FROM permissions WHERE key = ?').get(key) as any;
  if (row) {
    PERMISSIONS_CACHE[key] = row.id;
    return row.id;
  }
  return null;
}

export function requirePermission(permissionKey: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Non authentifié.' });
    }

    // superadmin bypasses all permission checks
    if (req.user.role === 'superadmin') {
      return next();
    }

    const permId = getPermissionId(permissionKey);
    if (!permId) {
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: `Permission inconnue : ${permissionKey}` });
    }

    // Check: user has at least one role with this permission
    const hasPermission = db.prepare(`
      SELECT 1 FROM user_roles ur
      JOIN role_permissions rp ON rp.roleId = ur.roleId
      WHERE ur.userId = ? AND rp.permissionId = ? AND rp.allowed = 1
      LIMIT 1
    `).get(req.user.id, permId);

    if (!hasPermission) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({ error: AUTH_ERROR_MESSAGES.ACCESS_DENIED });
    }

    next();
  };
}

export function requireAnyPermission(permissionKeys: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Non authentifié.' });
    }

    if (req.user.role === 'superadmin') {
      return next();
    }

    const permIds: string[] = [];
    for (const key of permissionKeys) {
      const id = getPermissionId(key);
      if (id) permIds.push(id);
    }

    if (permIds.length === 0) {
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Permissions inconnues.' });
    }

    const placeholders = permIds.map(() => '?').join(',');
    const hasAny = db.prepare(`
      SELECT 1 FROM user_roles ur
      JOIN role_permissions rp ON rp.roleId = ur.roleId
      WHERE ur.userId = ? AND rp.permissionId IN (${placeholders}) AND rp.allowed = 1
      LIMIT 1
    `).get(req.user.id, ...permIds);

    if (!hasAny) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({ error: AUTH_ERROR_MESSAGES.ACCESS_DENIED });
    }

    next();
  };
}

// Récupère toutes les permissions d'un utilisateur
export function getUserPermissions(userId: string): string[] {
  const rows = db.prepare(`
    SELECT DISTINCT p.key FROM permissions p
    JOIN role_permissions rp ON rp.permissionId = p.id
    JOIN user_roles ur ON ur.roleId = rp.roleId
    WHERE ur.userId = ? AND rp.allowed = 1
  `).all(userId) as any[];
  return rows.map(r => r.key);
}

// Récupère tous les rôles d'un utilisateur
export function getUserRoles(userId: string): any[] {
  return db.prepare(`
    SELECT r.* FROM roles r
    JOIN user_roles ur ON ur.roleId = r.id
    WHERE ur.userId = ?
  `).all(userId);
}
