import { BaseService } from './baseService.js';
import db from '../../database/db.js';
import { hashPassword as hashPw } from '../auth.js';

const USER_COLUMNS = [
  { sqlite: 'id', pg: 'legacy_id' },
  { sqlite: 'name', pg: 'name' },
  { sqlite: 'email', pg: 'email' },
  { sqlite: 'role', pg: 'role' },
  { sqlite: 'tenantId', pg: 'tenant_id' },
  { sqlite: 'active', pg: 'active' },
  { sqlite: 'avatar', pg: 'avatar' },
  { sqlite: 'password', pg: 'password' },
  { sqlite: 'firstLoginReset', pg: 'first_login_reset' },
];

const PUBLIC_COLUMNS = ['id', 'name', 'email', 'role', 'tenantId', 'active', 'avatar', 'firstLoginReset'];

export class UserService extends BaseService {
  constructor() {
    super('users', 'users', USER_COLUMNS);
  }

  getAll(tenantId: string): any[] {
    const cols = PUBLIC_COLUMNS.join(', ');
    return db.prepare(`SELECT ${cols} FROM users WHERE tenantId = ?`).all(tenantId) as any[];
  }

  getById(id: string): any | undefined {
    return this.getByIdRaw(id);
  }

  async create(data: any, tenantId: string): Promise<any> {
    const id = data.id || `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(data.email);
    if (existing) {
      throw new Error('Cette adresse email est déjà enregistrée.');
    }

    const defaultHashedPassword = await hashPw(data.password || 'Nexa2026!');
    const firstLoginReset = data.password ? 0 : 1;

    const user = {
      id,
      name: data.name,
      email: data.email,
      role: data.role || 'vendeur',
      tenantId,
      active: data.active === false ? 0 : 1,
      avatar: data.avatar || '',
      password: defaultHashedPassword,
      firstLoginReset,
    };

    this.insertRaw(user);
    this.enqueueSync('CREATE', id, { ...user, password: undefined, legacy_id: id }, tenantId);

    const cols = PUBLIC_COLUMNS.join(', ');
    return db.prepare(`SELECT ${cols} FROM users WHERE id = ?`).get(id);
  }

  async update(id: string, data: any, tenantId: string): Promise<any | null> {
    const existing = db.prepare('SELECT * FROM users WHERE id = ? AND tenantId = ?').get(id, tenantId) as any | undefined;
    if (!existing) return null;

    let hashedPassword = existing.password;
    let firstLoginReset = existing.firstLoginReset;
    if (data.password) {
      hashedPassword = await hashPw(data.password);
      firstLoginReset = 0;
    }

    const updated: Record<string, any> = {
      name: data.name ?? existing.name,
      email: data.email ?? existing.email,
      role: data.role ?? existing.role,
      active: data.active === false ? 0 : 1,
      avatar: data.avatar ?? existing.avatar,
      password: hashedPassword,
      firstLoginReset,
    };

    this.updateRaw(id, updated);
    this.enqueueSync('UPDATE', id, { ...existing, ...updated, password: undefined, legacy_id: id }, tenantId);

    const cols = PUBLIC_COLUMNS.join(', ');
    return db.prepare(`SELECT ${cols} FROM users WHERE id = ?`).get(id);
  }

  delete(id: string, tenantId: string): boolean {
    const existing = db.prepare('SELECT * FROM users WHERE id = ? AND tenantId = ?').get(id, tenantId);
    if (!existing) return false;
    this.deleteRaw(id);
    this.enqueueSync('DELETE', id, { ...existing as any, password: undefined, legacy_id: id }, tenantId);
    return true;
  }
}

export const userService = new UserService();
