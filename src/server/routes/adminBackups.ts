import { Router, Response } from 'express';
import path from 'path';
import { authenticateToken, requireRole, type AuthenticatedRequest } from '../middleware/auth.js';
import { BACKUP_DIR } from '../database/db.js';
import {
  createSqliteBackup,
  createSupabaseBackup,
  listBackups,
  getBackup,
  verifyBackup,
  deleteBackup,
  restoreSqliteBackup,
  restoreSupabaseBackup,
  getBackupFilePath,
} from '../services/adminBackupService.js';
import { runCoherenceCheck, runCoherenceQuickStatus } from '../services/coherenceService.js';

// ============================================================================
// Console Super Admin — Sauvegardes & Restauration + Contrôle de cohérence.
// Toutes les routes exigent le rôle superadmin. Chaque opération est
// journalisée dans audit_logs (immutable) et n'expose JAMAIS les secrets
// (SERVICE_ROLE_KEY reste côté serveur via getAdminClient).
// ============================================================================

const router = Router();

function actor(req: AuthenticatedRequest): string {
  return req.user?.name || req.user?.email || req.user?.id || 'superadmin';
}

// --- Sauvegardes -----------------------------------------------------------

router.post('/backups/sqlite', authenticateToken, requireRole(['superadmin']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const label = req.body?.label || 'Sauvegarde SQLite manuelle';
    const backup = await createSqliteBackup(label, actor(req));
    res.json({ success: true, backup });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/backups/supabase', authenticateToken, requireRole(['superadmin']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const label = req.body?.label || 'Sauvegarde Supabase manuelle';
    const backup = await createSupabaseBackup(label, actor(req));
    res.json({ success: true, backup });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/backups/managed', authenticateToken, requireRole(['superadmin']), (_req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ success: true, backups: listBackups() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/backups/managed/:id/download', authenticateToken, requireRole(['superadmin']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const filePath = getBackupFilePath(req.params.id);
    const rec = getBackup(req.params.id);
    if (!filePath || !rec) return res.status(404).json({ error: 'Sauvegarde introuvable.' });
    res.download(filePath, path.basename(filePath), (err) => {
      if (err) res.status(500).json({ error: 'Téléchargement impossible.' });
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/backups/managed/:id', authenticateToken, requireRole(['superadmin']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = deleteBackup(req.params.id);
    if (result.refused) return res.status(409).json({ error: result.reason });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/backups/managed/:id/verify', authenticateToken, requireRole(['superadmin']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = verifyBackup(req.params.id);
    res.json({ success: result.ok, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Restauration ----------------------------------------------------------

router.post('/restore/sqlite/:id', authenticateToken, requireRole(['superadmin']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const report = await restoreSqliteBackup(req.params.id, actor(req));
    res.json({ success: report.success, report });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/restore/supabase/:id', authenticateToken, requireRole(['superadmin']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const report = await restoreSupabaseBackup(req.params.id, actor(req));
    res.json({ success: report.success, report });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Contrôle de cohérence (diagnostic uniquement) -------------------------

router.post('/coherence/check', authenticateToken, requireRole(['superadmin']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deep = req.body?.deep !== false;
    const report = await runCoherenceCheck({ deep });
    res.json({ success: true, report });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/coherence/status', authenticateToken, requireRole(['superadmin']), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const status = await runCoherenceQuickStatus();
    res.json({ success: true, status });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
export { BACKUP_DIR };
