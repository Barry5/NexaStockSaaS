import { Router, Response } from 'express';
import db from '../database/db.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { requirePermission, getUserPermissions, getUserRoles } from '../middleware/permissions.js';

const router = Router();

// GET: List all permissions (grouped by module)
router.get('/permissions', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const permissions = db.prepare('SELECT * FROM permissions ORDER BY module, key').all();
    const grouped: Record<string, any[]> = {};
    for (const p of permissions as any[]) {
      if (!grouped[p.module]) grouped[p.module] = [];
      grouped[p.module].push(p);
    }
    res.json({ permissions, grouped });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la récupération des permissions.' });
  }
});

// GET: List roles (for tenant, or system roles)
router.get('/roles', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const roles = db.prepare(`
      SELECT * FROM roles WHERE tenantId IS NULL OR tenantId = ? ORDER BY is_system DESC, name
    `).all(tenantId) as any[];

    // Attach permission count for each role
    const enriched = roles.map(r => {
      const permCount = (db.prepare('SELECT COUNT(*) as count FROM role_permissions WHERE roleId = ? AND allowed = 1').get(r.id) as any)?.count || 0;
      const userCount = (db.prepare('SELECT COUNT(*) as count FROM user_roles WHERE roleId = ?').get(r.id) as any)?.count || 0;
      return { ...r, permissionCount: permCount, userCount };
    });

    res.json({ roles: enriched });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la récupération des rôles.' });
  }
});

// GET: Permissions for a specific role
router.get('/roles/:roleId/permissions', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roleId } = req.params;
    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId) as any;
    if (!role) return res.status(404).json({ error: 'Rôle introuvable.' });

    const rolePerms = db.prepare(`
      SELECT rp.*, p.key, p.module, p.label as permissionLabel, p.description as permissionDescription
      FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permissionId
      WHERE rp.roleId = ?
    `).all(roleId) as any[];

    const permMap: Record<string, boolean> = {};
    for (const rp of rolePerms) {
      permMap[rp.key] = !!rp.allowed;
    }

    res.json({ role, permissions: rolePerms, permissionMap: permMap });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la récupération des permissions du rôle.' });
  }
});

// PUT: Update permissions for a role
router.put('/roles/:roleId/permissions', authenticateToken, requirePermission('users.permissions'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roleId } = req.params;
    const { permissions } = req.body; // { [permissionKey]: boolean }

    if (!permissions || typeof permissions !== 'object') {
      return res.status(400).json({ error: 'Format de permissions invalide.' });
    }

    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId) as any;
    if (!role) return res.status(404).json({ error: 'Rôle introuvable.' });

    // Prevent editing system role names but allow permission changes
    if (role.is_system && role.tenantId !== req.user?.tenantId && req.user?.role !== 'superadmin') {
      return res.status(403).json({ error: 'Modification des rôles système non autorisée.' });
    }

    db.transaction(() => {
      for (const [key, allowed] of Object.entries(permissions)) {
        const perm = db.prepare('SELECT id FROM permissions WHERE key = ?').get(key) as any;
        if (!perm) continue;

        const existing = db.prepare('SELECT id FROM role_permissions WHERE roleId = ? AND permissionId = ?').get(roleId, perm.id) as any;
        if (existing) {
          db.prepare('UPDATE role_permissions SET allowed = ? WHERE id = ?').run(allowed ? 1 : 0, existing.id);
        } else if (allowed) {
          db.prepare('INSERT INTO role_permissions (id, roleId, permissionId, allowed) VALUES (?, ?, ?, 1)').run(
            `rp-${roleId}-${perm.id}`, roleId, perm.id
          );
        }
      }
    })();

    // Return updated permissions
    const updatedPerms = db.prepare(`
      SELECT rp.*, p.key, p.module, p.label as permissionLabel
      FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permissionId
      WHERE rp.roleId = ?
    `).all(roleId);

    res.json({ success: true, permissions: updatedPerms });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la mise à jour des permissions.' });
  }
});

// POST: Create a custom role
router.post('/roles', authenticateToken, requirePermission('users.permissions'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, label, description } = req.body;
    if (!name || !label) return res.status(400).json({ error: 'Nom et libellé requis.' });

    const existing = db.prepare('SELECT id FROM roles WHERE name = ? AND tenantId = ?').get(name, req.user?.tenantId) as any;
    if (existing) return res.status(409).json({ error: 'Un rôle avec ce nom existe déjà.' });

    const roleId = `role-custom-${Date.now()}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO roles (id, name, label, description, is_system, tenantId, createdAt)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `).run(roleId, name, label, description || null, req.user?.tenantId, now);

    // Copy view permissions from the default minimal role
    const viewPerms = db.prepare("SELECT id FROM permissions WHERE key LIKE '%.view'").all() as any[];
    const insertRp = db.prepare('INSERT OR IGNORE INTO role_permissions (id, roleId, permissionId, allowed) VALUES (?, ?, ?, 1)');
    for (const vp of viewPerms) {
      insertRp.run(`rp-${roleId}-${vp.id}`, roleId, vp.id);
    }

    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId);
    res.status(201).json({ success: true, role });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la création du rôle.' });
  }
});

// PUT: Update a role
router.put('/roles/:roleId', authenticateToken, requirePermission('users.permissions'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roleId } = req.params;
    const { label, description } = req.body;

    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId) as any;
    if (!role) return res.status(404).json({ error: 'Rôle introuvable.' });
    if (role.is_system) return res.status(403).json({ error: 'Les rôles système ne peuvent pas être modifiés.' });

    db.prepare('UPDATE roles SET label = ?, description = ? WHERE id = ?').run(label || role.label, description || role.description, roleId);
    const updated = db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId);
    res.json({ success: true, role: updated });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la mise à jour du rôle.' });
  }
});

// DELETE: Delete a custom role
router.delete('/roles/:roleId', authenticateToken, requirePermission('users.permissions'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roleId } = req.params;
    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId) as any;
    if (!role) return res.status(404).json({ error: 'Rôle introuvable.' });
    if (role.is_system) return res.status(403).json({ error: 'Les rôles système ne peuvent pas être supprimés.' });

    const userCount = (db.prepare('SELECT COUNT(*) as count FROM user_roles WHERE roleId = ?').get(roleId) as any)?.count || 0;
    if (userCount > 0) {
      return res.status(409).json({ error: `Ce rôle est attribué à ${userCount} utilisateur(s). Veuillez d'abord réaffecter ces utilisateurs.` });
    }

    db.transaction(() => {
      db.prepare('DELETE FROM role_permissions WHERE roleId = ?').run(roleId);
      db.prepare('DELETE FROM user_roles WHERE roleId = ?').run(roleId);
      db.prepare('DELETE FROM roles WHERE id = ?').run(roleId);
    })();

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la suppression du rôle.' });
  }
});

// GET: Roles for a specific user
router.get('/users/:userId/roles', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const roles = getUserRoles(req.params.userId);
    const permissions = getUserPermissions(req.params.userId);
    res.json({ roles, permissions });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la récupération des rôles utilisateur.' });
  }
});

// PUT: Update roles for a user
router.put('/users/:userId/roles', authenticateToken, requirePermission('users.edit'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { roleIds } = req.body; // string[]

    if (!Array.isArray(roleIds)) {
      return res.status(400).json({ error: 'Format de rôle invalide.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

    // Validate all roleIds exist
    for (const rid of roleIds) {
      const role = db.prepare('SELECT id FROM roles WHERE id = ?').get(rid) as any;
      if (!role) return res.status(400).json({ error: `Rôle introuvable : ${rid}` });
    }

    db.transaction(() => {
      db.prepare('DELETE FROM user_roles WHERE userId = ?').run(userId);
      const insert = db.prepare('INSERT INTO user_roles (id, userId, roleId) VALUES (?, ?, ?)');
      for (const rid of roleIds) {
        insert.run(`ur-${userId}-${rid}`, userId, rid);
      }
    })();

    const roles = getUserRoles(userId);
    const permissions = getUserPermissions(userId);
    res.json({ success: true, roles, permissions });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la mise à jour des rôles.' });
  }
});

// GET: Current user's effective permissions
router.get('/me', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié.' });

    const roles = getUserRoles(req.user.id);
    const permissions = req.user.role === 'superadmin'
      ? (db.prepare('SELECT key FROM permissions').all() as any[]).map(p => p.key)
      : getUserPermissions(req.user.id);

    res.json({ roles, permissions });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la récupération des permissions.' });
  }
});

// GET: Check a specific permission for current user
router.get('/check/:permissionKey', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié.' });
    if (req.user.role === 'superadmin') return res.json({ allowed: true });

    const { permissionKey } = req.params;
    const perm = db.prepare('SELECT id FROM permissions WHERE key = ?').get(permissionKey) as any;
    if (!perm) return res.status(404).json({ error: 'Permission inconnue.' });

    const hasPermission = db.prepare(`
      SELECT 1 FROM user_roles ur
      JOIN role_permissions rp ON rp.roleId = ur.roleId
      WHERE ur.userId = ? AND rp.permissionId = ? AND rp.allowed = 1
      LIMIT 1
    `).get(req.user.id, perm.id);

    res.json({ allowed: !!hasPermission });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la vérification.' });
  }
});

export default router;
