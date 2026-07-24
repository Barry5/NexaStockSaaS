import { Router, Response } from 'express';
import db from '../database/db.js';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import { hashPassword } from '../services/auth.js';

const router = Router();

// GET: List all users in tenant (Requires owner/gerant role or above)
router.get('/', authenticateToken, requireRole(['owner', 'admin', 'gerant']), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const users = db.prepare('SELECT id, name, email, role, tenantId, active, avatar, firstLoginReset FROM users WHERE tenantId = ?').all(tenantId);
    res.json(users);
  } catch (error) {
    next(error);
  }
});

// POST: Invite/Create User
router.post('/', authenticateToken, requireRole(['owner', 'admin', 'gerant']), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { name, email, role, active, avatar, password } = req.body;
    const id = req.body.id || `u-${Math.floor(Math.random() * 90000 + 10000)}`;

    const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(400).json({ error: 'Cette adresse email est déjà enregistrée.' });
    }

    const defaultHashedPassword = await hashPassword(password || 'Nexa2026!');
    const firstLoginReset = password ? 0 : 1;

    db.prepare(`
      INSERT INTO users (id, name, email, role, tenantId, active, avatar, password, firstLoginReset)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      name,
      email,
      role || 'vendeur',
      tenantId,
      active === false ? 0 : 1,
      avatar || '',
      defaultHashedPassword,
      firstLoginReset
    );

    const createdUser = db.prepare('SELECT id, name, email, role, tenantId, active, avatar, firstLoginReset FROM users WHERE id = ?').get(id);
    res.status(201).json(createdUser);
  } catch (error) {
    next(error);
  }
});

// PUT: Update User
router.put('/:id', authenticateToken, requireRole(['owner', 'admin', 'gerant']), async (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { name, email, role, active, avatar, password } = req.body;

    const existingUser = db.prepare('SELECT * FROM users WHERE id = ? AND tenantId = ?').get(id, tenantId) as any;
    if (!existingUser) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    // Hash password if updating
    let hashedPassword = existingUser.password;
    let firstLoginReset = existingUser.firstLoginReset;
    if (password) {
      hashedPassword = await hashPassword(password);
      firstLoginReset = 0;
    }

    db.prepare(`
      UPDATE users 
      SET name = ?, email = ?, role = ?, active = ?, avatar = ?, password = ?, firstLoginReset = ?
      WHERE id = ? AND tenantId = ?
    `).run(
      name || existingUser.name,
      email || existingUser.email,
      role || existingUser.role,
      active === false ? 0 : 1,
      avatar || existingUser.avatar,
      hashedPassword,
      firstLoginReset,
      id,
      tenantId
    );

    const updatedUser = db.prepare('SELECT id, name, email, role, tenantId, active, avatar, firstLoginReset FROM users WHERE id = ?').get(id);
    res.json(updatedUser);
  } catch (error) {
    next(error);
  }
});

// DELETE: Delete/Revoke user
router.delete('/:id', authenticateToken, requireRole(['owner', 'admin']), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    if (id === req.user!.id) {
      return res.status(400).json({ error: 'Vous ne pouvez pas révoquer votre propre compte.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ? AND tenantId = ?').get(id, tenantId);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    db.prepare('DELETE FROM users WHERE id = ? AND tenantId = ?').run(id, tenantId);
    res.json({ success: true, message: 'Le compte d\'accès de l\'utilisateur a été révoqué.' });
  } catch (error) {
    next(error);
  }
});

export default router;
