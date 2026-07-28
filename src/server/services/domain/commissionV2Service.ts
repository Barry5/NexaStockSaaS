import { BaseService } from './baseService.js';
import db from '../../database/db.js';

function genId(p: string) { return `${p}-${Date.now()}-${Math.floor(Math.random() * 10000)}`; }
function now() { return new Date().toISOString(); }
function today() { return now().split('T')[0]; }
function fmt(n: number): string { return new Intl.NumberFormat('fr-FR').format(n); }

export class CommissionV2Service extends BaseService {
  constructor() {
    super('sale_affiliates', 'sale_affiliates', []);
  }

  private getAffiliateBalance(affiliateId: string): number {
    const r = db.prepare('SELECT COALESCE(SUM(credit),0) - COALESCE(SUM(debit),0) as bal FROM commission_ledger WHERE affiliateId = ?').get(affiliateId) as any;
    return r?.bal || 0;
  }

  private addAudit(affiliateId: string, action: string, details: string, tenantId: string, userId?: string, userName?: string) {
    db.prepare(`INSERT INTO commission_audit (id, affiliateId, action, details, userId, userName, tenantId, createdAt) VALUES (?,?,?,?,?,?,?,?)`)
      .run(genId('aud'), affiliateId, action, details, userId || null, userName || null, tenantId, now());
  }

  recordSaleCommission(data: any, tenantId: string, userId?: string, userName?: string): any {
    const { saleId, affiliateId, invoiceNumber, customerName, items, paymentSchedule, immediatePayment } = data;
    if (!saleId || !affiliateId || !items) throw new Error('saleId, affiliateId et items requis');
    const aff = db.prepare('SELECT * FROM affiliates WHERE id = ? AND tenantId = ?').get(affiliateId, tenantId) as any;
    if (!aff) throw new Error('Apporteur introuvable');

    const schedule = paymentSchedule || 'immediate';
    let totalCommission = 0;
    const ledgerEntries: string[] = [];
    const commissionItems: any[] = [];

    this.runInTransaction(() => {
      for (const item of items) {
        const commPerUnit = item.commissionPerUnit || 0;
        if (commPerUnit <= 0) continue;
        const itemTotal = commPerUnit * item.quantity;
        totalCommission += itemTotal;

        const ciId = genId('sci');
        db.prepare(`
          INSERT INTO sale_commission_items (id, saleId, affiliateId, productId, productName, quantity, sellPrice, commissionPerUnit, totalCommission, tenantId, createdAt)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)
        `).run(ciId, saleId, affiliateId, item.productId || null, item.productName, item.quantity, item.sellPrice || 0, commPerUnit, itemTotal, tenantId, now());
        commissionItems.push({ id: ciId, ...item, totalCommission: itemTotal });

        const currentBalance = this.getAffiliateBalance(affiliateId);
        const ledgerId = genId('ledger');
        db.prepare(`
          INSERT INTO commission_ledger (id, affiliateId, type, reference, referenceType, description, credit, debit, balance, status, invoiceId, invoiceNumber, customerName, productName, quantity, sellPrice, commissionAmount, userId, userName, tenantId, createdAt)
          VALUES (?,?,'commission',?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(ledgerId, affiliateId, invoiceNumber || null, 'sale', `Commission ${item.productName} x${item.quantity}`, itemTotal, currentBalance + itemTotal, 'pending', saleId, invoiceNumber || null, customerName || null, item.productName, item.quantity, item.sellPrice || 0, itemTotal, userId || null, userName || null, tenantId, now());
        ledgerEntries.push(ledgerId);
      }

      if (totalCommission <= 0) throw new Error('Aucune commission à enregistrer');

      const saId = genId('sa');
      const balanceDue = totalCommission - (immediatePayment || 0);
      let dueDate: string | null = null;
      if (schedule === 'later') { const d = new Date(); d.setDate(d.getDate() + 30); dueDate = d.toISOString().split('T')[0]; }
      else if (schedule === 'weekly') { const d = new Date(); d.setDate(d.getDate() + 7); dueDate = d.toISOString().split('T')[0]; }
      else if (schedule === 'bi_weekly') { const d = new Date(); d.setDate(d.getDate() + 15); dueDate = d.toISOString().split('T')[0]; }
      else if (schedule === 'end_of_month') { const d = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0); dueDate = d.toISOString().split('T')[0]; }

      db.prepare(`
        INSERT INTO sale_affiliates (id, saleId, affiliateId, affiliateName, totalCommission, amountPaid, balanceDue, paymentSchedule, paymentDueDate, status, tenantId, createdAt)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(saId, saleId, affiliateId, `${aff.firstName} ${aff.lastName}`, totalCommission, immediatePayment || 0, balanceDue, schedule, dueDate || null, immediatePayment && immediatePayment >= totalCommission ? 'paid' : 'pending', tenantId, now());

      if (immediatePayment && immediatePayment > 0) {
        const payId = genId('cmpay');
        const ref = `CMP-${String(Date.now()).slice(-8)}`;
        const currentBalance = this.getAffiliateBalance(affiliateId);
        db.prepare(`
          INSERT INTO commission_payments (id, reference, affiliateId, affiliateName, amount, method, currency, notes, ledgerIds, userId, userName, tenantId, createdAt, saleId, paymentDate, schedule)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(payId, ref, affiliateId, `${aff.firstName} ${aff.lastName}`, immediatePayment, 'cash', 'GNF', 'Paiement immédiat', JSON.stringify(ledgerEntries), userId || null, userName || null, tenantId, now(), saleId, today(), 'immediate');
        const entryId = genId('ledger');
        db.prepare(`
          INSERT INTO commission_ledger (id, affiliateId, type, reference, referenceType, description, credit, debit, balance, status, paymentId, userId, userName, tenantId, createdAt)
          VALUES (?,?,'payment',?,?,?,0,?,?,?,?,?,?,?,?)
        `).run(entryId, affiliateId, ref, 'payment', `Paiement immédiat ${fmt(immediatePayment)}`, immediatePayment, currentBalance - immediatePayment, 'paid', payId, userId || null, userName || null, tenantId, now());
      }

      this.addAudit(affiliateId, 'SALE_COMMISSION_RECORDED', `Commission de ${fmt(totalCommission)} enregistrée pour vente ${invoiceNumber || saleId} (${schedule})`, tenantId, userId, userName);
    });

    this.enqueueSync('CREATE', saleId, { saleId, affiliateId, totalCommission, tenantId, legacy_id: saleId, _table: 'sale_affiliates' }, tenantId);
    const updatedBalance = this.getAffiliateBalance(affiliateId);
    return { saleAffiliateId: genId('sa'), totalCommission, immediatePayment: immediatePayment || 0, balanceDue: totalCommission - (immediatePayment || 0), schedule, commissionItems, balance: updatedBalance };
  }

  getSaleCommission(saleId: string, tenantId: string): { saleAffiliate: any; commissionItems: any[] } {
    const saleAffiliate = db.prepare('SELECT * FROM sale_affiliates WHERE saleId = ? AND tenantId = ?').get(saleId, tenantId) as any;
    const commissionItems = db.prepare('SELECT * FROM sale_commission_items WHERE saleId = ? AND tenantId = ?').all(saleId, tenantId);
    return { saleAffiliate, commissionItems };
  }

  getEnhancedDashboard(tenantId: string): any {
    const d = today();
    const monthStart = new Date(); monthStart.setDate(1);
    const ms = monthStart.toISOString().split('T')[0];
    const activeAffiliates = (db.prepare("SELECT COUNT(*) as cnt FROM affiliates WHERE tenantId = ? AND status='active'").get(tenantId) as any)?.cnt || 0;
    const todayComm = db.prepare("SELECT COALESCE(SUM(credit),0) as c, COALESCE(SUM(debit),0) as d FROM commission_ledger WHERE tenantId = ? AND createdAt >= ?").get(tenantId, d) as any;
    const todayCommission = (todayComm.c || 0) - (todayComm.d || 0);
    const monthComm = db.prepare("SELECT COALESCE(SUM(credit),0) as c, COALESCE(SUM(debit),0) as d FROM commission_ledger WHERE tenantId = ? AND createdAt >= ?").get(tenantId, ms) as any;
    const monthCommission = (monthComm.c || 0) - (monthComm.d || 0);
    const totalToPay = (db.prepare("SELECT COALESCE(SUM(balanceDue),0) as bal FROM sale_affiliates WHERE tenantId = ? AND status IN ('pending','partially_paid')").get(tenantId) as any)?.bal || 0;
    const totalPaid = (db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM commission_payments WHERE tenantId = ?").get(tenantId) as any)?.total || 0;
    const salesWithComm = (db.prepare("SELECT COUNT(DISTINCT saleId) as cnt FROM sale_affiliates WHERE tenantId = ? AND createdAt >= ?").get(tenantId, d) as any)?.cnt || 0;
    const totalSalesToday = (db.prepare("SELECT COUNT(*) as cnt FROM sales WHERE tenantId = ? AND date >= ?").get(tenantId, d) as any)?.cnt || 0;
    const topAffiliates = db.prepare(`
      SELECT a.id, a.firstName, a.lastName, a.photo, a.phone, a.city, COALESCE(l.total_comm,0) as totalCommission, COALESCE(l.total_paid,0) as totalPaid, COUNT(sa.id) as saleCount
      FROM affiliates a LEFT JOIN (SELECT affiliateId, SUM(credit) as total_comm, SUM(debit) as total_paid FROM commission_ledger WHERE tenantId = ? GROUP BY affiliateId) l ON a.id = l.affiliateId LEFT JOIN sale_affiliates sa ON a.id = sa.affiliateId
      WHERE a.tenantId = ? AND a.status = 'active' GROUP BY a.id ORDER BY totalCommission DESC LIMIT 10
    `).all(tenantId, tenantId) as any[];
    const topProducts = db.prepare(`
      SELECT productName, SUM(totalCommission) as totalComm, SUM(quantity) as totalQty, COUNT(*) as occurrenceCount
      FROM sale_commission_items WHERE tenantId = ? GROUP BY productName ORDER BY totalComm DESC LIMIT 10
    `).all(tenantId) as any[];
    const statusBreakdown = db.prepare(`
      SELECT status, COUNT(*) as cnt, SUM(totalCommission) as total FROM sale_affiliates WHERE tenantId = ? GROUP BY status
    `).all(tenantId) as any[];
    const monthlyStats = db.prepare(`
      SELECT strftime('%Y-%m', createdAt) as month, SUM(credit) as comm, SUM(debit) as paid
      FROM commission_ledger WHERE tenantId = ? AND createdAt >= date('now', '-12 months') GROUP BY month ORDER BY month ASC
    `).all(tenantId) as any[];
    return {
      stats: { activeAffiliates, todayCommission, monthCommission, totalToPay, totalPaid, salesWithCommission: salesWithComm, salesWithoutCommission: Math.max(0, totalSalesToday - salesWithComm), totalSalesToday },
      topAffiliates, topProducts, statusBreakdown, monthlyStats,
    };
  }

  search(tenantId: string, query: { q?: string; affiliateId?: string; product?: string; invoice?: string; status?: string; periodStart?: string; periodEnd?: string }): any {
    const q = query.q || '';
    const affiliateId = query.affiliateId;
    const productName = query.product;
    const status = query.status;
    const periodStart = query.periodStart;
    const periodEnd = query.periodEnd;
    let sql = 'SELECT sa.*, s.invoiceNumber, s.customerName, s.date as saleDate FROM sale_affiliates sa LEFT JOIN sales s ON sa.saleId = s.id WHERE sa.tenantId = ?';
    const params: any[] = [tenantId];
    if (q) { sql += ' AND (sa.affiliateName LIKE ? OR s.invoiceNumber LIKE ? OR s.customerName LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    if (affiliateId) { sql += ' AND sa.affiliateId = ?'; params.push(affiliateId); }
    if (status) { sql += ' AND sa.status = ?'; params.push(status); }
    if (periodStart) { sql += ' AND sa.createdAt >= ?'; params.push(periodStart); }
    if (periodEnd) { sql += ' AND sa.createdAt <= ?'; params.push(periodEnd); }
    sql += ' ORDER BY sa.createdAt DESC LIMIT 100';
    let results = db.prepare(sql).all(...params) as any[];
    if (productName) {
      const saleIds = results.map(r => r.saleId);
      if (saleIds.length > 0) {
        const placeholders = saleIds.map(() => '?').join(',');
        const matchingItems = db.prepare(`SELECT DISTINCT saleId FROM sale_commission_items WHERE tenantId = ? AND productName LIKE ? AND saleId IN (${placeholders})`).all(tenantId, `%${productName}%`, ...saleIds) as any[];
        const matchingSaleIds = new Set(matchingItems.map(m => m.saleId));
        results = results.filter(r => matchingSaleIds.has(r.saleId));
      } else { results = []; }
    }
    const enriched = results.map(r => {
      const items = db.prepare('SELECT * FROM sale_commission_items WHERE saleId = ? AND tenantId = ?').all(r.saleId, tenantId);
      return { ...r, items };
    });
    return { results: enriched, total: enriched.length };
  }

  updatePaymentSchedule(id: string, data: { paymentSchedule?: string; paymentDueDate?: string }, tenantId: string): any | null {
    const sa = db.prepare('SELECT * FROM sale_affiliates WHERE id = ? AND tenantId = ?').get(id, tenantId) as any;
    if (!sa) return null;
    if (sa.status === 'paid') throw new Error('Commission déjà soldée');
    const { paymentSchedule, paymentDueDate } = data;
    db.prepare('UPDATE sale_affiliates SET paymentSchedule = ?, paymentDueDate = ? WHERE id = ?').run(paymentSchedule || sa.paymentSchedule, paymentDueDate || sa.paymentDueDate, id);
    this.addAudit(sa.affiliateId, 'PAYMENT_SCHEDULE_UPDATED', `Échéance modifiée: ${paymentSchedule || sa.paymentSchedule}`, tenantId);
    return db.prepare('SELECT * FROM sale_affiliates WHERE id = ?').get(id);
  }

  batchPay(saleAffiliateIds: string[], method: string | undefined, campaignName: string | undefined, tenantId: string, userId?: string, userName?: string): any {
    if (!saleAffiliateIds || saleAffiliateIds.length === 0) throw new Error('Liste de commissions requise');
    const paymentMethod = method || 'cash';
    const results: any[] = [];
    let totalPaidAmount = 0;

    this.runInTransaction(() => {
      for (const saId of saleAffiliateIds) {
        const sa = db.prepare('SELECT * FROM sale_affiliates WHERE id = ? AND tenantId = ? AND status IN (?,?)').get(saId, tenantId, 'pending', 'partially_paid') as any;
        if (!sa || sa.balanceDue <= 0) continue;
        const payAmount = sa.balanceDue;
        const payId = genId('cmpay');
        const ref = `CMP-${String(Date.now()).slice(-8)}`;
        const aff = db.prepare('SELECT firstName, lastName FROM affiliates WHERE id = ?').get(sa.affiliateId) as any;
        db.prepare(`
          INSERT INTO commission_payments (id, reference, affiliateId, affiliateName, amount, method, currency, notes, userId, userName, tenantId, createdAt, saleId, paymentDate, schedule)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(payId, ref, sa.affiliateId, sa.affiliateName, payAmount, paymentMethod, 'GNF', campaignName ? `Campagne: ${campaignName}` : 'Paiement groupé', userId || null, userName || null, tenantId, now(), sa.saleId, today(), 'bulk');
        db.prepare('UPDATE sale_affiliates SET amountPaid = amountPaid + ?, balanceDue = 0, status = ? WHERE id = ?').run(payAmount, 'paid', saId);
        totalPaidAmount += payAmount;
        const currentBalance = this.getAffiliateBalance(sa.affiliateId);
        const entryId = genId('ledger');
        db.prepare(`
          INSERT INTO commission_ledger (id, affiliateId, type, reference, referenceType, description, credit, debit, balance, status, paymentId, userId, userName, tenantId, createdAt)
          VALUES (?,?,'payment',?,?,?,0,?,?,?,?,?,?,?,?)
        `).run(entryId, sa.affiliateId, ref, 'payment', campaignName ? `Paiement campagne: ${campaignName}` : `Paiement groupé ${fmt(payAmount)}`, payAmount, currentBalance - payAmount, 'paid', payId, userId || null, userName || null, tenantId, now());
        this.addAudit(sa.affiliateId, 'BATCH_PAYMENT', `Paiement groupé ${fmt(payAmount)} (${campaignName || 'standard'})`, tenantId, userId, userName);
        results.push({ saleAffiliateId: saId, affiliateName: sa.affiliateName, amount: payAmount, reference: ref });
      }
    });

    return { success: true, totalPaid: totalPaidAmount, count: results.length, results };
  }

  getPending(tenantId: string): any[] {
    return db.prepare(`
      SELECT sa.*, s.invoiceNumber, s.customerName, s.date as saleDate, aff.firstName, aff.lastName, aff.phone, aff.city
      FROM sale_affiliates sa LEFT JOIN sales s ON sa.saleId = s.id LEFT JOIN affiliates aff ON sa.affiliateId = aff.id
      WHERE sa.tenantId = ? AND sa.status IN ('pending','partially_paid') AND sa.balanceDue > 0 ORDER BY sa.createdAt DESC
    `).all(tenantId) as any[];
  }
}

export const commissionV2Service = new CommissionV2Service();
