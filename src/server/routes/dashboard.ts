import { Router, Response } from 'express';
import db from '../database/db.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// GET: Fetch consolidated dashboard metrics & charts data
router.get('/metrics', authenticateToken, (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;

    // 1. Total revenue
    const revenueStmt = db.prepare('SELECT SUM(total) as totalRevenue FROM sales WHERE tenantId = ?');
    const revenueResult = revenueStmt.get(tenantId) as { totalRevenue: number | null };
    const totalRevenue = revenueResult.totalRevenue || 0;

    // 2. Alert product counts
    const alertProductsStmt = db.prepare('SELECT COUNT(*) as alertCount FROM products WHERE tenantId = ? AND quantity <= alertThreshold');
    const alertResult = alertProductsStmt.get(tenantId) as { alertCount: number };
    const alertProductsCount = alertResult.alertCount;

    // 3. Outstanding client debt
    const debtStmt = db.prepare('SELECT SUM(outstandingDebt) as totalDebt FROM customers WHERE tenantId = ?');
    const debtResult = debtStmt.get(tenantId) as { totalDebt: number | null };
    const totalOutstandingDebt = debtResult.totalDebt || 0;

    // 4. Total outstanding loans
    const loanStmt = db.prepare('SELECT SUM(remainingBalance) as totalLoans FROM loans WHERE tenantId = ? AND status = "actif"');
    const loanResult = loanStmt.get(tenantId) as { totalLoans: number | null };
    const totalLoansBalance = loanResult.totalLoans || 0;

    // 5. Total Expenses
    const expenseStmt = db.prepare('SELECT SUM(amount) as totalExpenses FROM expenses WHERE tenantId = ? AND status = "paye"');
    const expenseResult = expenseStmt.get(tenantId) as { totalExpenses: number | null };
    const totalExpenses = expenseResult.totalExpenses || 0;

    // 6. Recent sales (latest 5)
    const recentSales = db.prepare('SELECT * FROM sales WHERE tenantId = ? ORDER BY date DESC LIMIT 5').all(tenantId) as any[];
    const salesWithItems = recentSales.map(s => {
      const items = db.prepare('SELECT * FROM sale_items WHERE saleId = ?').all(s.id);
      return { ...s, items };
    });

    // 7. Category distribution
    const categoryDistribution = db.prepare(`
      SELECT category, SUM(quantity) as stockCount, COUNT(*) as productCount 
      FROM products 
      WHERE tenantId = ? 
      GROUP BY category
    `).all(tenantId);

    // 8. Financial summary
    res.json({
      metrics: {
        totalRevenue,
        alertProductsCount,
        totalOutstandingDebt,
        totalLoansBalance,
        totalExpenses,
        netCashFlow: totalRevenue - totalExpenses
      },
      recentSales: salesWithItems,
      categoryDistribution,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

export default router;
