import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import db from '../database/db.js';

const router = Router();

function requireAffiliateRole(req: AuthenticatedRequest, res: Response, next: () => void) {
  if (!req.user) {
    return res.status(401).json({ error: 'Non authentifié.' });
  }
  if (req.user.role !== 'affiliate') {
    return res.status(403).json({ error: 'Accès réservé aux affiliés.' });
  }
  next();
}

router.get('/me', authenticateToken, requireAffiliateRole, (req: AuthenticatedRequest, res: Response) => {
  const affiliate = db.prepare(`
    SELECT id, code, firstName, lastName, photo, phone, email, address, city, country, company, status, createdAt
    FROM affiliates WHERE id = ?
  `).get(req.user!.id) as any;
  if (!affiliate) return res.status(404).json({ error: 'Profil affilié introuvable.' });
  res.json(affiliate);
});

router.get('/commissions', authenticateToken, requireAffiliateRole, (req: AuthenticatedRequest, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  const total = (db.prepare(`SELECT COUNT(*) as count FROM commission_ledger WHERE affiliateId = ?`).get(req.user!.id) as any).count;
  const rows = db.prepare(`
    SELECT id, type, reference, description, credit, debit, balance, status, createdAt
    FROM commission_ledger WHERE affiliateId = ?
    ORDER BY createdAt DESC LIMIT ? OFFSET ?
  `).all(req.user!.id, limit, offset);

  res.json({ data: rows, total, page, limit, totalPages: Math.ceil(total / limit) });
});

router.get('/stats', authenticateToken, requireAffiliateRole, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const stats = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN status = 'paid' THEN credit ELSE 0 END), 0) as totalEarned,
      COALESCE(SUM(CASE WHEN status = 'pending' THEN credit ELSE 0 END), 0) as totalPending,
      COALESCE(SUM(CASE WHEN status = 'paid' THEN debit ELSE 0 END), 0) as totalPaid,
      COUNT(*) as totalEntries
    FROM commission_ledger WHERE affiliateId = ?
  `).get(userId) as any;

  res.json(stats);
});

export default router;
