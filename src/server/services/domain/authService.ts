import { BaseService } from './baseService.js';
import db from '../../database/db.js';
import { generateToken, comparePassword, hashPassword } from '../auth.js';
import { genId } from '../../utils/ids.js';

export class AuthService extends BaseService {
  constructor() {
    super('users', 'users', []);
  }

  async login(email: string, password: string): Promise<{ token: string; user: any; tenant: any } | { error: string; status: number }> {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
    if (!user) return { error: 'Identifiants invalides (email introuvable).', status: 401 };
    if (!user.active) return { error: 'Ce compte utilisateur a été désactivé par l\'administrateur.', status: 403 };

    if (user.password) {
      let isMatch: boolean;
      if (user.password.startsWith('$2')) {
        isMatch = await comparePassword(password, user.password);
      } else {
        isMatch = password === user.password;
        if (isMatch) {
          const hashed = await hashPassword(password);
          db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, user.id);
        }
      }
      if (!isMatch) return { error: 'Mot de passe incorrect.', status: 401 };
    }

    const tenant = user.tenantId ? db.prepare('SELECT * FROM tenants WHERE id = ?').get(user.tenantId) as any : null;
    const token = generateToken({ id: user.id, email: user.email, tenantId: user.tenantId || null, role: user.role, name: user.name });

    return {
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, tenantId: user.tenantId || null, avatar: user.avatar, firstLoginReset: !!user.firstLoginReset },
      tenant,
    };
  }

  async register(companyName: string, email: string, password: string, role?: string): Promise<{ token: string; user: any; tenant: any } | { error: string; status: number }> {
    const existingUser = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (existingUser) return { error: 'Cette adresse email est déjà utilisée.', status: 400 };

    const tenantId = `t-${companyName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Math.floor(Math.random() * 900 + 100)}`;
    const userId = genId('u');
    const trialDays = 14;
    const trialStartDate = new Date().toISOString();
    const trialEndDate = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString();
    const hashedPassword = password ? await hashPassword(password) : null;
    const firstLoginReset = password ? 0 : 1;

    this.runInTransaction(() => {
      db.prepare(`
        INSERT INTO tenants (id, name, description, plan, logo, address, phone, currency, createdAt, subscriptionStatus, trialStartDate, trialEndDate, subscriptionEndDate)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(tenantId, companyName, `Entreprise ${companyName}`, 'Free',
        'https://images.unsplash.com/photo-1542838132-92c53300491e?w=80&h=80&fit=crop&q=80',
        'Adresse de l\'entreprise', '+33 6 00 00 00 00', 'EUR', this.now(), 'TRIAL',
        trialStartDate, trialEndDate, trialEndDate);

      db.prepare(`
        INSERT INTO users (id, name, email, role, tenantId, active, avatar, password, firstLoginReset)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(userId, email.split('@')[0], email, role || 'owner', tenantId, 1,
        'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80&h=80&fit=crop&q=80',
        hashedPassword, firstLoginReset);

      const customCategories = JSON.stringify(['Général', 'Alimentation', 'Électronique', 'Services']);
      db.prepare('UPDATE tenants SET customCategories = ? WHERE id = ?').run(customCategories, tenantId);

      const productId = genId('p');
      db.prepare(`
        INSERT INTO products (id, name, sku, barcode, description, category, buyPrice, sellPrice, quantity, alertThreshold, tenantId, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(productId, 'Article Initial de Démo', 'ART-DEMO-01', '123456789012',
        'Ceci est votre premier article de démonstration, libre à vous de le supprimer.',
        'Général', 10.0, 19.99, 10, 2, tenantId, this.now());

      // S2 : tenant + user journalisés DANS la transaction de création
      // (avant : après runInTransaction → fenêtre de crash → enregistrement
      // local sans changelog → jamais propagé au cloud).
      this.enqueueSync('CREATE', tenantId, { id: tenantId, name: companyName, legacy_id: tenantId, _table: 'tenants' }, tenantId);
      this.enqueueSync('CREATE', userId, { id: userId, email, legacy_id: userId, _table: 'users' }, tenantId);
    });

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId) as any;
    const token = generateToken({ id: user.id, email: user.email, tenantId: user.tenantId, role: user.role, name: user.name });

    return {
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, tenantId: user.tenantId, avatar: user.avatar, firstLoginReset: !!user.firstLoginReset },
      tenant,
    };
  }

  getProfile(userId: string): { user: any; tenant: any } | null {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    if (!user) return null;
    const tenant = user.tenantId ? db.prepare('SELECT * FROM tenants WHERE id = ?').get(user.tenantId) as any : null;
    return {
      user: { id: user.id, name: user.name, email: user.email, role: user.role, tenantId: user.tenantId || null, avatar: user.avatar, firstLoginReset: !!user.firstLoginReset },
      tenant,
    };
  }
}

export const authService = new AuthService();
