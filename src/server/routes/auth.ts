import { Router, Response } from 'express';
import db from '../database/db.js';
import { generateToken, comparePassword, hashPassword } from '../services/auth.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loginSchema, registerSchema, profileUpdateSchema } from '../schemas/index.js';

const router = Router();

// POST: Login
router.post('/login', validate(loginSchema), async (req, res, next) => {
  const { email, password } = req.body;

  try {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;

    if (!user) {
      return res.status(401).json({ error: 'Identifiants invalides (email introuvable).' });
    }

    if (!user.active) {
      return res.status(403).json({ error: 'Ce compte utilisateur a été désactivé par l\'administrateur.' });
    }

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
      if (!isMatch) {
        return res.status(401).json({ error: 'Mot de passe incorrect.' });
      }
    } else {
      // If no password exists, allow logging in (passwordless bypass), but they must configure one.
      // This supports the frictionless entry flow.
    }

    const tenant = user.tenantId ? db.prepare('SELECT * FROM tenants WHERE id = ?').get(user.tenantId) as any : null;

    const token = generateToken({
      id: user.id,
      email: user.email,
      tenantId: user.tenantId || null,
      role: user.role,
      name: user.name
    });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId || null,
        avatar: user.avatar,
        firstLoginReset: !!user.firstLoginReset
      },
      tenant
    });
  } catch (error) {
    next(error);
  }
});

// POST: Register a new organisation
router.post('/register', validate(registerSchema), async (req, res, next) => {
  const { companyName, email, password, role } = req.body;

  try {
    const existingUser = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Cette adresse email est déjà utilisée.' });
    }

    const tenantId = `t-${companyName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Math.floor(Math.random() * 900 + 100)}`;
    const userId = `u-${Math.floor(Math.random() * 90000 + 10000)}`;

    const trialDays = 14;
    const trialStartDate = new Date().toISOString();
    const trialEndDate = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString();

    const hashedPassword = password ? await hashPassword(password) : null;
    const firstLoginReset = password ? 0 : 1; // Require password config on first login if no password supplied

    db.transaction(() => {
      // Create Tenant
      db.prepare(`
        INSERT INTO tenants (id, name, description, plan, logo, address, phone, currency, createdAt, subscriptionStatus, trialStartDate, trialEndDate, subscriptionEndDate)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        tenantId,
        companyName,
        `Entreprise ${companyName}`,
        'Free',
        'https://images.unsplash.com/photo-1542838132-92c53300491e?w=80&h=80&fit=crop&q=80',
        'Adresse de l\'entreprise',
        '+33 6 00 00 00 00',
        'EUR',
        new Date().toISOString(),
        'TRIAL',
        trialStartDate,
        trialEndDate,
        trialEndDate
      );

      // Create Owner User
      db.prepare(`
        INSERT INTO users (id, name, email, role, tenantId, active, avatar, password, firstLoginReset)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        email.split('@')[0], // Use email prefix as default name
        email,
        role || 'owner',
        tenantId,
        1, // active
        'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=80&h=80&fit=crop&q=80',
        hashedPassword,
        firstLoginReset
      );

      // Seed standard categories as default setting in tenants
      const customCategories = JSON.stringify(['Général', 'Alimentation', 'Électronique', 'Services']);
      db.prepare('UPDATE tenants SET customCategories = ? WHERE id = ?').run(customCategories, tenantId);

      // Seed a default product so the workspace is not fully blank
      const productId = `p-${Math.floor(Math.random() * 90000 + 10000)}`;
      db.prepare(`
        INSERT INTO products (id, name, sku, barcode, description, category, buyPrice, sellPrice, quantity, alertThreshold, tenantId, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        productId,
        'Article Initial de Démo',
        'ART-DEMO-01',
        '123456789012',
        'Ceci est votre premier article de démonstration, libre à vous de le supprimer.',
        'Général',
        10.0,
        19.99,
        10,
        2,
        tenantId,
        new Date().toISOString()
      );
    })();

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId) as any;

    const token = generateToken({
      id: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
      name: user.name
    });

    res.status(210).json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        avatar: user.avatar,
        firstLoginReset: !!user.firstLoginReset
      },
      tenant
    });
  } catch (error) {
    next(error);
  }
});

// GET: Profile (me)
router.get('/me', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Non authentifié.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id) as any;
  if (!user) {
    return res.status(404).json({ error: 'Utilisateur non trouvé.' });
  }

  const tenant = user.tenantId ? db.prepare('SELECT * FROM tenants WHERE id = ?').get(user.tenantId) as any : null;

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId || null,
      avatar: user.avatar,
      firstLoginReset: !!user.firstLoginReset
    },
    tenant
  });
});

export default router;
