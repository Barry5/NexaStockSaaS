import { Router, Response } from 'express';
import db from '../database/db.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

function genId(p: string) { return `${p}-${Date.now()}-${Math.floor(Math.random() * 10000)}`; }
function now() { return new Date().toISOString(); }
function today() { return now().split('T')[0]; }
function fmt(n: number): string { return new Intl.NumberFormat('fr-FR').format(n); }

function getAffiliateBalance(affiliateId: string): number {
  const r = db.prepare('SELECT COALESCE(SUM(credit),0) - COALESCE(SUM(debit),0) as bal FROM commission_ledger WHERE affiliateId = ?').get(affiliateId) as any;
  return r?.bal || 0;
}

function addAudit(affiliateId: string, action: string, details: string, tenantId: string, userId?: string, userName?: string) {
  db.prepare(`INSERT INTO commission_audit (id, affiliateId, action, details, userId, userName, tenantId, createdAt) VALUES (?,?,?,?,?,?,?,?)`)
    .run(genId('aud'), affiliateId, action, details, userId || null, userName || null, tenantId, now());
}

// Record commission for a sale (called after checkout)
router.post('/sale/record', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'Aucun tenant actif' });
    const { saleId, affiliateId, invoiceNumber, customerName, items, paymentSchedule, immediatePayment } = req.body;
    if (!saleId || !affiliateId || !items) return res.status(400).json({ error: 'saleId, affiliateId et items requis' });

    const aff = db.prepare('SELECT * FROM affiliates WHERE id = ? AND tenantId = ?').get(affiliateId, tenantId) as any;
    if (!aff) return res.status(404).json({ error: 'Apporteur introuvable' });

    const schedule = paymentSchedule || 'immediate';
    let totalCommission = 0;
    const ledgerEntries: any[] = [];
    const commissionItems: any[] = [];

    db.transaction(() => {
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

        const currentBalance = getAffiliateBalance(affiliateId);
        const ledgerId = genId('ledger');
        db.prepare(`
          INSERT INTO commission_ledger (id, affiliateId, type, reference, referenceType, description, credit, debit, balance, status, invoiceId, invoiceNumber, customerName, productName, quantity, sellPrice, commissionAmount, userId, userName, tenantId, createdAt)
          VALUES (?,?,'commission',?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(ledgerId, affiliateId, invoiceNumber || null, 'sale', `Commission ${item.productName} x${item.quantity}`, itemTotal, currentBalance + itemTotal, 'pending', saleId, invoiceNumber || null, customerName || null, item.productName, item.quantity, item.sellPrice || 0, itemTotal, req.user?.id || null, req.user?.name || null, tenantId, now());
        ledgerEntries.push(ledgerId);
      }

      if (totalCommission <= 0) {
        throw new Error('Aucune commission à enregistrer');
      }

      const saId = genId('sa');
      const balanceDue = totalCommission - (immediatePayment || 0);
      let dueDate: string | null = null;
      if (schedule === 'later') {
        const d = new Date(); d.setDate(d.getDate() + 30); dueDate = d.toISOString().split('T')[0];
      } else if (schedule === 'weekly') {
        const d = new Date(); d.setDate(d.getDate() + 7); dueDate = d.toISOString().split('T')[0];
      } else if (schedule === 'bi_weekly') {
        const d = new Date(); d.setDate(d.getDate() + 15); dueDate = d.toISOString().split('T')[0];
      } else if (schedule === 'end_of_month') {
        const d = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0); dueDate = d.toISOString().split('T')[0];
      }

      db.prepare(`
        INSERT INTO sale_affiliates (id, saleId, affiliateId, affiliateName, totalCommission, amountPaid, balanceDue, paymentSchedule, paymentDueDate, status, tenantId, createdAt)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(saId, saleId, affiliateId, `${aff.firstName} ${aff.lastName}`, totalCommission, immediatePayment || 0, balanceDue, schedule, dueDate || null, immediatePayment && immediatePayment >= totalCommission ? 'paid' : 'pending', tenantId, now());

      // Handle immediate payment
      if (immediatePayment && immediatePayment > 0) {
        const payId = genId('cmpay');
        const ref = `CMP-${String(Date.now()).slice(-8)}`;
        const currentBalance = getAffiliateBalance(affiliateId);
        db.prepare(`
          INSERT INTO commission_payments (id, reference, affiliateId, affiliateName, amount, method, currency, notes, ledgerIds, userId, userName, tenantId, createdAt, saleId, paymentDate, schedule)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(payId, ref, affiliateId, `${aff.firstName} ${aff.lastName}`, immediatePayment, 'cash', 'GNF', 'Paiement immédiat', JSON.stringify(ledgerEntries), req.user?.id || null, req.user?.name || null, tenantId, now(), saleId, today(), 'immediate');
        const entryId = genId('ledger');
        db.prepare(`
          INSERT INTO commission_ledger (id, affiliateId, type, reference, referenceType, description, credit, debit, balance, status, paymentId, userId, userName, tenantId, createdAt)
          VALUES (?,?,'payment',?,?,?,0,?,?,?,?,?,?,?,?)
        `).run(entryId, affiliateId, ref, 'payment', `Paiement immédiat ${fmt(immediatePayment)}`, immediatePayment, currentBalance - immediatePayment, 'paid', payId, req.user?.id || null, req.user?.name || null, tenantId, now());
      }

      addAudit(affiliateId, 'SALE_COMMISSION_RECORDED', `Commission de ${fmt(totalCommission)} enregistrée pour vente ${invoiceNumber || saleId} (${schedule})`, tenantId, req.user?.id, req.user?.name);
    })();

    const updatedBalance = getAffiliateBalance(affiliateId);
    res.status(201).json({
      saleAffiliateId: genId('sa'),
      totalCommission,
      immediatePayment: immediatePayment || 0,
      balanceDue: totalCommission - (immediatePayment || 0),
      schedule,
      commissionItems,
      balance: updatedBalance,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Erreur lors de l\'enregistrement de la commission' });
  }
});

// Get commission data for a sale
router.get('/sale/:saleId', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const saleAffiliate = db.prepare('SELECT * FROM sale_affiliates WHERE saleId = ? AND tenantId = ?').get(req.params.saleId, tenantId) as any;
    const commissionItems = db.prepare('SELECT * FROM sale_commission_items WHERE saleId = ? AND tenantId = ?').all(req.params.saleId, tenantId);
    res.json({ saleAffiliate, commissionItems });
  } catch (error) {
    res.status(500).json({ error: 'Erreur de chargement' });
  }
});

// Enhanced dashboard
router.get('/dashboard/enhanced', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.query.tenantId as string || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'tenantId requis' });

    const d = today();
    const monthStart = new Date(); monthStart.setDate(1);
    const ms = monthStart.toISOString().split('T')[0];

    // Active affiliates
    const activeAffiliates = (db.prepare("SELECT COUNT(*) as cnt FROM affiliates WHERE tenantId = ? AND status='active'").get(tenantId) as any)?.cnt || 0;

    // Today's commissions
    const todayComm = db.prepare("SELECT COALESCE(SUM(credit),0) as c, COALESCE(SUM(debit),0) as d FROM commission_ledger WHERE tenantId = ? AND createdAt >= ?").get(tenantId, d) as any;
    const todayCommission = (todayComm.c || 0) - (todayComm.d || 0);

    // Month commissions
    const monthComm = db.prepare("SELECT COALESCE(SUM(credit),0) as c, COALESCE(SUM(debit),0) as d FROM commission_ledger WHERE tenantId = ? AND createdAt >= ?").get(tenantId, ms) as any;
    const monthCommission = (monthComm.c || 0) - (monthComm.d || 0);

    // Total to pay (pending)
    const totalToPay = (db.prepare("SELECT COALESCE(SUM(balanceDue),0) as bal FROM sale_affiliates WHERE tenantId = ? AND status IN ('pending','partially_paid')").get(tenantId) as any)?.bal || 0;

    // Total paid
    const totalPaid = (db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM commission_payments WHERE tenantId = ?").get(tenantId) as any)?.total || 0;

    // Sales with/without commission today
    const salesWithComm = (db.prepare("SELECT COUNT(DISTINCT saleId) as cnt FROM sale_affiliates WHERE tenantId = ? AND createdAt >= ?").get(tenantId, d) as any)?.cnt || 0;
    const totalSalesToday = (db.prepare("SELECT COUNT(*) as cnt FROM sales WHERE tenantId = ? AND date >= ?").get(tenantId, d) as any)?.cnt || 0;

    // Top 10 affiliates
    const topAffiliates = db.prepare(`
      SELECT a.id, a.firstName, a.lastName, a.photo, a.phone, a.city,
        COALESCE(l.total_comm,0) as totalCommission,
        COALESCE(l.total_paid,0) as totalPaid,
        COUNT(sa.id) as saleCount
      FROM affiliates a
      LEFT JOIN (SELECT affiliateId, SUM(credit) as total_comm, SUM(debit) as total_paid FROM commission_ledger WHERE tenantId = ? GROUP BY affiliateId) l ON a.id = l.affiliateId
      LEFT JOIN sale_affiliates sa ON a.id = sa.affiliateId
      WHERE a.tenantId = ? AND a.status = 'active'
      GROUP BY a.id ORDER BY totalCommission DESC LIMIT 10
    `).all(tenantId, tenantId) as any[];

    // Top products by commission
    const topProducts = db.prepare(`
      SELECT productName, SUM(totalCommission) as totalComm, SUM(quantity) as totalQty, COUNT(*) as occurrenceCount
      FROM sale_commission_items WHERE tenantId = ?
      GROUP BY productName ORDER BY totalComm DESC LIMIT 10
    `).all(tenantId) as any[];

    // Commission status breakdown
    const statusBreakdown = db.prepare(`
      SELECT status, COUNT(*) as cnt, SUM(totalCommission) as total
      FROM sale_affiliates WHERE tenantId = ?
      GROUP BY status
    `).all(tenantId) as any[];

    // Monthly evolution (last 12 months)
    const monthlyStats = db.prepare(`
      SELECT strftime('%Y-%m', createdAt) as month, SUM(credit) as comm, SUM(debit) as paid
      FROM commission_ledger WHERE tenantId = ? AND createdAt >= date('now', '-12 months')
      GROUP BY month ORDER BY month ASC
    `).all(tenantId) as any[];

    res.json({
      stats: {
        activeAffiliates,
        todayCommission,
        monthCommission,
        totalToPay,
        totalPaid,
        salesWithCommission: salesWithComm,
        salesWithoutCommission: Math.max(0, totalSalesToday - salesWithComm),
        totalSalesToday,
      },
      topAffiliates,
      topProducts,
      statusBreakdown,
      monthlyStats,
    });
  } catch (error) {
    res.status(500).json({ error: 'Erreur du tableau de bord' });
  }
});

// Search commissions
router.get('/search', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.query.tenantId as string || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'tenantId requis' });

    const q = req.query.q as string || '';
    const affiliateId = req.query.affiliateId as string;
    const productName = req.query.product as string;
    const invoiceNum = req.query.invoice as string;
    const status = req.query.status as string;
    const periodStart = req.query.periodStart as string;
    const periodEnd = req.query.periodEnd as string;

    let query = 'SELECT sa.*, s.invoiceNumber, s.customerName, s.date as saleDate FROM sale_affiliates sa LEFT JOIN sales s ON sa.saleId = s.id WHERE sa.tenantId = ?';
    const params: any[] = [tenantId];

    if (q) { query += ' AND (sa.affiliateName LIKE ? OR s.invoiceNumber LIKE ? OR s.customerName LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    if (affiliateId) { query += ' AND sa.affiliateId = ?'; params.push(affiliateId); }
    if (status) { query += ' AND sa.status = ?'; params.push(status); }
    if (periodStart) { query += ' AND sa.createdAt >= ?'; params.push(periodStart); }
    if (periodEnd) { query += ' AND sa.createdAt <= ?'; params.push(periodEnd); }

    query += ' ORDER BY sa.createdAt DESC LIMIT 100';
    const results = db.prepare(query).all(...params) as any[];

    // If searching by product, filter
    let finalResults = results;
    if (productName) {
      const saleIds = results.map(r => r.saleId);
      if (saleIds.length > 0) {
        const placeholders = saleIds.map(() => '?').join(',');
        const matchingItems = db.prepare(`SELECT DISTINCT saleId FROM sale_commission_items WHERE tenantId = ? AND productName LIKE ? AND saleId IN (${placeholders})`).all(tenantId, `%${productName}%`, ...saleIds) as any[];
        const matchingSaleIds = new Set(matchingItems.map(m => m.saleId));
        finalResults = results.filter(r => matchingSaleIds.has(r.saleId));
      } else {
        finalResults = [];
      }
    }

    // Attach items
    const enriched = finalResults.map(r => {
      const items = db.prepare('SELECT * FROM sale_commission_items WHERE saleId = ? AND tenantId = ?').all(r.saleId, tenantId);
      return { ...r, items };
    });

    res.json({ results: enriched, total: enriched.length });
  } catch (error) {
    res.status(500).json({ error: 'Erreur de recherche' });
  }
});

// Update payment schedule for a sale commission
router.put('/sale-commission/:id/schedule', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const { id } = req.params;
    const { paymentSchedule, paymentDueDate } = req.body;
    const sa = db.prepare('SELECT * FROM sale_affiliates WHERE id = ? AND tenantId = ?').get(id, tenantId) as any;
    if (!sa) return res.status(404).json({ error: 'Commission vente introuvable' });
    if (sa.status === 'paid') return res.status(400).json({ error: 'Commission déjà soldée' });

    db.prepare('UPDATE sale_affiliates SET paymentSchedule = ?, paymentDueDate = ? WHERE id = ?').run(paymentSchedule || sa.paymentSchedule, paymentDueDate || sa.paymentDueDate, id);
    addAudit(sa.affiliateId, 'PAYMENT_SCHEDULE_UPDATED', `Échéance modifiée: ${paymentSchedule || sa.paymentSchedule}`, tenantId, req.user?.id, req.user?.name);
    const updated = db.prepare('SELECT * FROM sale_affiliates WHERE id = ?').get(id);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Erreur de mise à jour' });
  }
});

// Batch payment campaign
router.post('/batch-pay', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'Aucun tenant actif' });

    const { saleAffiliateIds, method, campaignName } = req.body;
    if (!saleAffiliateIds || !Array.isArray(saleAffiliateIds) || saleAffiliateIds.length === 0) {
      return res.status(400).json({ error: 'Liste de commissions requise' });
    }

    const paymentMethod = method || 'cash';
    const results: any[] = [];
    let totalPaidAmount = 0;

    db.transaction(() => {
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
        `).run(payId, ref, sa.affiliateId, sa.affiliateName, payAmount, paymentMethod, 'GNF', campaignName ? `Campagne: ${campaignName}` : 'Paiement groupé', req.user?.id || null, req.user?.name || null, tenantId, now(), sa.saleId, today(), 'bulk');

        db.prepare('UPDATE sale_affiliates SET amountPaid = amountPaid + ?, balanceDue = 0, status = ? WHERE id = ?').run(payAmount, 'paid', saId);
        totalPaidAmount += payAmount;

        const currentBalance = getAffiliateBalance(sa.affiliateId);
        const entryId = genId('ledger');
        db.prepare(`
          INSERT INTO commission_ledger (id, affiliateId, type, reference, referenceType, description, credit, debit, balance, status, paymentId, userId, userName, tenantId, createdAt)
          VALUES (?,?,'payment',?,?,?,0,?,?,?,?,?,?,?,?)
        `).run(entryId, sa.affiliateId, ref, 'payment', campaignName ? `Paiement campagne: ${campaignName}` : `Paiement groupé ${fmt(payAmount)}`, payAmount, currentBalance - payAmount, 'paid', payId, req.user?.id || null, req.user?.name || null, tenantId, now());

        addAudit(sa.affiliateId, 'BATCH_PAYMENT', `Paiement groupé ${fmt(payAmount)} (${campaignName || 'standard'})`, tenantId, req.user?.id, req.user?.name);

        results.push({ saleAffiliateId: saId, affiliateName: sa.affiliateName, amount: payAmount, reference: ref });
      }
    })();

    res.json({ success: true, totalPaid: totalPaidAmount, count: results.length, results });
  } catch (error) {
    res.status(500).json({ error: 'Erreur de paiement groupé' });
  }
});

// Get pending commissions for batch payment
router.get('/pending', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.query.tenantId as string || req.user?.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'tenantId requis' });
    const pending = db.prepare(`
      SELECT sa.*, s.invoiceNumber, s.customerName, s.date as saleDate,
        aff.firstName, aff.lastName, aff.phone, aff.city
      FROM sale_affiliates sa
      LEFT JOIN sales s ON sa.saleId = s.id
      LEFT JOIN affiliates aff ON sa.affiliateId = aff.id
      WHERE sa.tenantId = ? AND sa.status IN ('pending','partially_paid')
        AND sa.balanceDue > 0
      ORDER BY sa.createdAt DESC
    `).all(tenantId);
    res.json(pending);
  } catch (error) {
    res.status(500).json({ error: 'Erreur de chargement' });
  }
});

export default router;
