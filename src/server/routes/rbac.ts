import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { rbacService } from '../services/domain/rbacService.js';

const router = Router();

router.get('/permissions', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = rbacService.getPermissions();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la récupération des permissions.' });
  }
});

router.get('/roles', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const roles = rbacService.getRoles(tenantId);
    res.json({ roles });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la récupération des rôles.' });
  }
});

router.get('/roles/:roleId/permissions', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = rbacService.getRolePermissions(req.params.roleId);
    if (!result) return res.status(404).json({ error: 'Rôle introuvable.' });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la récupération des permissions du rôle.' });
  }
});

router.put('/roles/:roleId/permissions', authenticateToken, requirePermission('users.permissions'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roleId } = req.params;
    const { permissions } = req.body;
    if (!permissions || typeof permissions !== 'object') {
      return res.status(400).json({ error: 'Format de permissions invalide.' });
    }
    const result = rbacService.updateRolePermissions(roleId, permissions);
    if (!result) return res.status(404).json({ error: 'Rôle introuvable.' });
    res.json({ success: true, permissions: result });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la mise à jour des permissions.' });
  }
});

router.post('/roles', authenticateToken, requirePermission('users.permissions'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, label, description } = req.body;
    if (!name || !label) return res.status(400).json({ error: 'Nom et libellé requis.' });
    const role = rbacService.createRole(name, label, description, req.user!.tenantId);
    res.status(201).json({ success: true, role });
  } catch (error: any) {
    if (error.message === 'Un rôle avec ce nom existe déjà.') {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erreur lors de la création du rôle.' });
  }
});

router.put('/roles/:roleId', authenticateToken, requirePermission('users.permissions'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roleId } = req.params;
    const role = rbacService.getRolePermissions(roleId)?.role;
    if (!role) return res.status(404).json({ error: 'Rôle introuvable.' });
    if (role.is_system) return res.status(403).json({ error: 'Les rôles système ne peuvent pas être modifiés.' });
    const updated = rbacService.updateRole(roleId, req.body);
    res.json({ success: true, role: updated });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la mise à jour du rôle.' });
  }
});

router.delete('/roles/:roleId', authenticateToken, requirePermission('users.permissions'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roleId } = req.params;
    const role = rbacService.getRolePermissions(roleId)?.role;
    if (!role) return res.status(404).json({ error: 'Rôle introuvable.' });
    if (role.is_system) return res.status(403).json({ error: 'Les rôles système ne peuvent pas être supprimés.' });
    const userCount = role.userCount || 0;
    if (userCount > 0) {
      return res.status(409).json({ error: `Ce rôle est attribué à ${userCount} utilisateur(s). Veuillez d'abord réaffecter ces utilisateurs.` });
    }
    rbacService.deleteRole(roleId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la suppression du rôle.' });
  }
});

router.get('/users/:userId/roles', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = rbacService.getUserRolesAndPerms(req.params.userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la récupération des rôles utilisateur.' });
  }
});

router.put('/users/:userId/roles', authenticateToken, requirePermission('users.edit'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { roleIds } = req.body;
    if (!Array.isArray(roleIds)) return res.status(400).json({ error: 'Format de rôle invalide.' });
    const result = rbacService.setUserRoles(userId, roleIds);
    if (!result) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Erreur lors de la mise à jour des rôles.' });
  }
});

router.get('/me', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié.' });
    const roles = rbacService.getUserRolesAndPerms(req.user.id).roles;
    const permissions = rbacService.getUserEffectivePermissions(req.user.id, req.user.role);
    res.json({ roles, permissions });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la récupération des permissions.' });
  }
});

router.get('/check/:permissionKey', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié.' });
    if (req.user.role === 'superadmin') return res.json({ allowed: true });
    const allowed = rbacService.checkPermission(req.user.id, req.params.permissionKey);
    res.json({ allowed });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la vérification.' });
  }
});

export default router;
