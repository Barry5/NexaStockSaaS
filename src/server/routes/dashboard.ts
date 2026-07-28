import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { dashboardService } from '../services/domain/dashboardService.js';

const router = Router();

router.get('/metrics', authenticateToken, (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const metrics = dashboardService.getMetrics(tenantId);
    const recentSales = dashboardService.getRecentSales(tenantId);
    const categoryDistribution = dashboardService.getCategoryDistribution(tenantId);
    res.json({ metrics, recentSales, categoryDistribution, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

export default router;
