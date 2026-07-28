import { BaseService } from './baseService.js';
import db from '../../database/db.js';
import { getUserPermissions, getUserRoles } from '../../middleware/permissions.js';

export class RbacService extends BaseService {
  constructor() {
    super('roles', 'roles', []);
  }

  getPermissions(): { permissions: any[]; grouped: Record<string, any[]> } {
    const permissions = db.prepare('SELECT * FROM permissions ORDER BY module, key').all() as any[];
    const grouped: Record<string, any[]> = {};
    for (const p of permissions) {
      if (!grouped[p.module]) grouped[p.module] = [];
      grouped[p.module].push(p);
    }
    return { permissions, grouped };
  }

  getRoles(tenantId?: string): any[] {
    const roles = db.prepare(`
      SELECT * FROM roles WHERE tenantId IS NULL OR tenantId = ? ORDER BY is_system DESC, name
    `).all(tenantId) as any[];
    return roles.map(r => {
      const permCount = (db.prepare('SELECT COUNT(*) as count FROM role_permissions WHERE roleId = ? AND allowed = 1').get(r.id) as any)?.count || 0;
      const userCount = (db.prepare('SELECT COUNT(*) as count FROM user_roles WHERE roleId = ?').get(r.id) as any)?.count || 0;
      return { ...r, permissionCount: permCount, userCount };
    });
  }

  getRolePermissions(roleId: string): { role: any; permissions: any[]; permissionMap: Record<string, boolean> } | null {
    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId) as any;
    if (!role) return null;
    const rolePerms = db.prepare(`
      SELECT rp.*, p.key, p.module, p.label as permissionLabel, p.description as permissionDescription
      FROM role_permissions rp JOIN permissions p ON p.id = rp.permissionId
      WHERE rp.roleId = ?
    `).all(roleId) as any[];
    const permMap: Record<string, boolean> = {};
    for (const rp of rolePerms) permMap[rp.key] = !!rp.allowed;
    return { role, permissions: rolePerms, permissionMap: permMap };
  }

  updateRolePermissions(roleId: string, permissions: Record<string, boolean>): any[] | null {
    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId) as any;
    if (!role) return null;
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
    return db.prepare(`
      SELECT rp.*, p.key, p.module, p.label as permissionLabel
      FROM role_permissions rp JOIN permissions p ON p.id = rp.permissionId
      WHERE rp.roleId = ?
    `).all(roleId) as any[];
  }

  createRole(name: string, label: string, description: string | undefined, tenantId: string): any {
    const existing = db.prepare('SELECT id FROM roles WHERE name = ? AND tenantId = ?').get(name, tenantId) as any;
    if (existing) throw new Error('Un rôle avec ce nom existe déjà.');
    const roleId = `role-custom-${Date.now()}`;
    const now = new Date().toISOString();
    db.prepare('INSERT INTO roles (id, name, label, description, is_system, tenantId, createdAt) VALUES (?, ?, ?, ?, 0, ?, ?)').run(
      roleId, name, label, description || null, tenantId, now
    );
    const viewPerms = db.prepare("SELECT id FROM permissions WHERE key LIKE '%.view'").all() as any[];
    const insertRp = db.prepare('INSERT OR IGNORE INTO role_permissions (id, roleId, permissionId, allowed) VALUES (?, ?, ?, 1)');
    for (const vp of viewPerms) insertRp.run(`rp-${roleId}-${vp.id}`, roleId, vp.id);
    this.enqueueSync('CREATE', roleId, { id: roleId, name, label, description, tenantId, legacy_id: roleId }, tenantId);
    return db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId);
  }

  updateRole(roleId: string, data: { label?: string; description?: string }): any | null {
    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId) as any;
    if (!role) return null;
    db.prepare('UPDATE roles SET label = ?, description = ? WHERE id = ?').run(
      data.label || role.label, data.description || role.description, roleId
    );
    return db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId);
  }

  deleteRole(roleId: string): boolean {
    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId) as any;
    if (!role) return false;
    db.transaction(() => {
      db.prepare('DELETE FROM role_permissions WHERE roleId = ?').run(roleId);
      db.prepare('DELETE FROM user_roles WHERE roleId = ?').run(roleId);
      db.prepare('DELETE FROM roles WHERE id = ?').run(roleId);
    })();
    this.enqueueSync('DELETE', roleId, role, role.tenantId);
    return true;
  }

  getUserRolesAndPerms(userId: string): { roles: any[]; permissions: string[] } {
    const roles = getUserRoles(userId);
    const permissions = getUserPermissions(userId);
    return { roles, permissions };
  }

  setUserRoles(userId: string, roleIds: string[]): { roles: any[]; permissions: string[] } | null {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    if (!user) return null;
    for (const rid of roleIds) {
      const role = db.prepare('SELECT id FROM roles WHERE id = ?').get(rid) as any;
      if (!role) throw new Error(`Rôle introuvable : ${rid}`);
    }
    db.transaction(() => {
      db.prepare('DELETE FROM user_roles WHERE userId = ?').run(userId);
      const insert = db.prepare('INSERT INTO user_roles (id, userId, roleId) VALUES (?, ?, ?)');
      for (const rid of roleIds) insert.run(`ur-${userId}-${rid}`, userId, rid);
    })();
    return this.getUserRolesAndPerms(userId);
  }

  getUserEffectivePermissions(userId: string, role: string): string[] {
    if (role === 'superadmin') {
      return (db.prepare('SELECT key FROM permissions').all() as any[]).map(p => p.key);
    }
    return getUserPermissions(userId);
  }

  checkPermission(userId: string, permissionKey: string): boolean {
    const perm = db.prepare('SELECT id FROM permissions WHERE key = ?').get(permissionKey) as any;
    if (!perm) return false;
    const hasPermission = db.prepare(`
      SELECT 1 FROM user_roles ur
      JOIN role_permissions rp ON rp.roleId = ur.roleId
      WHERE ur.userId = ? AND rp.permissionId = ? AND rp.allowed = 1 LIMIT 1
    `).get(userId, perm.id);
    return !!hasPermission;
  }
}

export const rbacService = new RbacService();
