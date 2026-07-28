import { BaseService } from './baseService.js';
import db from '../../database/db.js';

export class DashboardService extends BaseService {
  constructor() {
    super('sales', 'sales', []);
  }

  getMetrics(tenantId: string) {
    const revenueResult = db.prepare('SELECT SUM(total) as totalRevenue FROM sales WHERE tenantId = ?').get(tenantId) as { totalRevenue: number | null };
    const totalRevenue = revenueResult.totalRevenue || 0;

    const alertResult = db.prepare('SELECT COUNT(*) as alertCount FROM products WHERE tenantId = ? AND quantity <= alertThreshold').get(tenantId) as { alertCount: number };
    const alertProductsCount = alertResult.alertCount;

    const debtResult = db.prepare('SELECT SUM(outstandingDebt) as totalDebt FROM customers WHERE tenantId = ?').get(tenantId) as { totalDebt: number | null };
    const totalOutstandingDebt = debtResult.totalDebt || 0;

    const loanResult = db.prepare('SELECT SUM(remainingBalance) as totalLoans FROM loans WHERE tenantId = ? AND status = "actif"').get(tenantId) as { totalLoans: number | null };
    const totalLoansBalance = loanResult.totalLoans || 0;

    const expenseResult = db.prepare('SELECT SUM(amount) as totalExpenses FROM expenses WHERE tenantId = ? AND status = "paye"').get(tenantId) as { totalExpenses: number | null };
    const totalExpenses = expenseResult.totalExpenses || 0;

    return {
      totalRevenue,
      alertProductsCount,
      totalOutstandingDebt,
      totalLoansBalance,
      totalExpenses,
      netCashFlow: totalRevenue - totalExpenses,
    };
  }

  getRecentSales(tenantId: string, limit = 5): any[] {
    const sales = db.prepare('SELECT * FROM sales WHERE tenantId = ? ORDER BY date DESC LIMIT ?').all(tenantId, limit) as any[];
    return sales.map(s => ({
      ...s,
      items: db.prepare('SELECT * FROM sale_items WHERE saleId = ?').all(s.id),
    }));
  }

  getCategoryDistribution(tenantId: string): any[] {
    return db.prepare(`
      SELECT category, SUM(quantity) as stockCount, COUNT(*) as productCount 
      FROM products WHERE tenantId = ? GROUP BY category
    `).all(tenantId) as any[];
  }
}

export const dashboardService = new DashboardService();
