import { Router, Response } from 'express';
import db from '../database/db.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

function genId(p: string) { return `${p}-${Date.now()}-${Math.floor(Math.random() * 10000)}`; }
function now() { return new Date().toISOString(); }

function addAudit(affiliateId: string, action: string, details: string, oldVal: string | null, newVal: string | null, userId?: string, userName?: string, tenantId?: string) {
  db.prepare(`INSERT INTO commission_audit (id, affiliateId, action, details, oldValue, newValue, userId, userName, tenantId, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(genId('aud'), affiliateId, action, details, oldVal, newVal, userId || null, userName || null, tenantId || null, now());
}

function recalcBalance(affiliateId: string) {
  const entries = db.prepare('SELECT credit, debit FROM commission_ledger WHERE affiliateId = ? ORDER BY createdAt ASC, id ASC').all(affiliateId) as any[];
  let balance = 0;
  for (const e of entries) {
    balance = balance + e.credit - e.debit;
  }
  return balance;
}

function getAffiliateBalance(affiliateId: string): number {
  const r = db.prepare('SELECT COALESCE(SUM(credit),0) - COALESCE(SUM(debit),0) as bal FROM commission_ledger WHERE affiliateId = ?').get(affiliateId) as any;
  return r?.bal || 0;
}

function fmt(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n) + ' GNF';
}

router.get('/affiliates', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.query.tenantId as string || req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'tenantId requis' });
  const affiliates = db.prepare('SELECT * FROM affiliates WHERE tenantId = ? ORDER BY createdAt DESC').all(tenantId) as any[];
  const result = affiliates.map((a: any) => ({
    ...a,
    balance: getAffiliateBalance(a.id)
  }));
  res.json(result);
});

router.post('/affiliates', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'Aucun tenant actif' });
  const { firstName, lastName, phone, email, address, city, country, company, idNumber, notes, photo } = req.body;
  if (!firstName || !lastName) return res.status(400).json({ error: 'Prénom et nom requis' });
  const id = genId('aff');
  const code = `APP-${String(Date.now()).slice(-6)}`;
  const t = now();
  db.prepare(`
    INSERT INTO affiliates (id, code, firstName, lastName, photo, phone, email, address, city, country, company, idNumber, status, notes, tenantId, createdAt, updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?,?,?)
  `).run(id, code, firstName, lastName, photo || null, phone || null, email || null, address || null, city || null, country || 'Guinée', company || null, idNumber || null, notes || null, tenantId, t, t);
  addAudit(id, 'AFFILIATE_CREATED', `Apporteur ${firstName} ${lastName} créé`, null, null, req.user?.id, req.user?.name, tenantId);
  const aff = db.prepare('SELECT * FROM affiliates WHERE id = ?').get(id) as any;
  res.status(201).json({ ...aff, balance: 0, notification: { text: `✅ Apporteur ${firstName} ${lastName} (${code}) créé avec succès`, type: 'success' as const } });
});

router.put('/affiliates/:id', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const aff = db.prepare('SELECT * FROM affiliates WHERE id = ?').get(req.params.id) as any;
  if (!aff) return res.status(404).json({ error: 'Apporteur introuvable' });
  const { firstName, lastName, phone, email, address, city, country, company, idNumber, status, notes, photo } = req.body;
  const t = now();
  const oldStatus = aff.status;
  db.prepare(`UPDATE affiliates SET firstName=?, lastName=?, photo=?, phone=?, email=?, address=?, city=?, country=?, company=?, idNumber=?, status=?, notes=?, updatedAt=? WHERE id=?`)
    .run(firstName || aff.firstName, lastName || aff.lastName, photo !== undefined ? photo : aff.photo, phone !== undefined ? phone : aff.phone, email !== undefined ? email : aff.email, address !== undefined ? address : aff.address, city !== undefined ? city : aff.city, country || aff.country, company !== undefined ? company : aff.company, idNumber !== undefined ? idNumber : aff.idNumber, status || aff.status, notes !== undefined ? notes : aff.notes, t, aff.id);
  if (status && status !== oldStatus) {
    addAudit(aff.id, 'AFFILIATE_STATUS_CHANGED', `Statut changé: ${oldStatus} -> ${status}`, oldStatus, status, req.user?.id, req.user?.name, aff.tenantId);
  }
  addAudit(aff.id, 'AFFILIATE_UPDATED', 'Fiche apporteur modifiée', null, null, req.user?.id, req.user?.name, aff.tenantId);
  const updated = db.prepare('SELECT * FROM affiliates WHERE id = ?').get(aff.id) as any;
  res.json({ ...updated, balance: getAffiliateBalance(aff.id) });
});

router.get('/rules', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.query.tenantId as string || req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'tenantId requis' });
  const rules = db.prepare('SELECT * FROM commission_rules WHERE tenantId = ? ORDER BY priority ASC').all(tenantId);
  res.json(rules);
});

router.post('/rules', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'Aucun tenant actif' });
  const { name, type, value, minValue, maxValue, productId, category, clientId, affiliateId, campaign, priority } = req.body;
  if (!name || !type || value === undefined) return res.status(400).json({ error: 'Nom, type et valeur requis' });
  const id = genId('rule');
  db.prepare(`
    INSERT INTO commission_rules (id, name, type, value, minValue, maxValue, productId, category, clientId, affiliateId, campaign, priority, active, tenantId, createdAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)
  `).run(id, name, type, value, minValue ?? null, maxValue ?? null, productId || null, category || null, clientId || null, affiliateId || null, campaign || null, priority || 0, tenantId, now());
  const rule = db.prepare('SELECT * FROM commission_rules WHERE id = ?').get(id);
  res.status(201).json(rule);
});

router.put('/rules/:id', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const rule = db.prepare('SELECT * FROM commission_rules WHERE id = ?').get(req.params.id) as any;
  if (!rule) return res.status(404).json({ error: 'Règle introuvable' });
  const { name, type, value, minValue, maxValue, productId, category, clientId, affiliateId, campaign, priority, active } = req.body;
  db.prepare(`UPDATE commission_rules SET name=?, type=?, value=?, minValue=?, maxValue=?, productId=?, category=?, clientId=?, affiliateId=?, campaign=?, priority=?, active=? WHERE id=?`)
    .run(name || rule.name, type || rule.type, value !== undefined ? value : rule.value, minValue !== undefined ? minValue : rule.minValue, maxValue !== undefined ? maxValue : rule.maxValue, productId !== undefined ? productId : rule.productId, category !== undefined ? category : rule.category, clientId !== undefined ? clientId : rule.clientId, affiliateId !== undefined ? affiliateId : rule.affiliateId, campaign !== undefined ? campaign : rule.campaign, priority !== undefined ? priority : rule.priority, active !== undefined ? (active ? 1 : 0) : rule.active, rule.id);
  const updated = db.prepare('SELECT * FROM commission_rules WHERE id = ?').get(rule.id);
  res.json(updated);
});

router.delete('/rules/:id', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const rule = db.prepare('SELECT * FROM commission_rules WHERE id = ?').get(req.params.id) as any;
  if (!rule) return res.status(404).json({ error: 'Règle introuvable' });
  db.prepare('DELETE FROM commission_rules WHERE id = ?').run(rule.id);
  res.json({ success: true });
});

router.get('/ledger/:affiliateId', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const entries = db.prepare('SELECT * FROM commission_ledger WHERE affiliateId = ? ORDER BY createdAt DESC').all(req.params.affiliateId);
  const balance = getAffiliateBalance(req.params.affiliateId);
  res.json({ entries, balance });
});

router.post('/ledger', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'Aucun tenant actif' });
  const { affiliateId, type, reference, referenceType, description, credit, debit, invoiceId, invoiceNumber, customerName, productName, quantity, sellPrice, minPrice, commissionAmount, status } = req.body;
  const aff = db.prepare('SELECT * FROM affiliates WHERE id = ?').get(affiliateId) as any;
  if (!aff) return res.status(404).json({ error: 'Apporteur introuvable' });
  if (aff.tenantId !== tenantId) return res.status(403).json({ error: 'Non autorisé' });
  const id = genId('ledger');
  const currentBalance = getAffiliateBalance(affiliateId);
  const entryCredit = credit || 0;
  const entryDebit = debit || 0;
  const newBalance = currentBalance + entryCredit - entryDebit;
  const st = status || 'pending';
  db.prepare(`
    INSERT INTO commission_ledger (id, affiliateId, type, reference, referenceType, description, credit, debit, balance, status, invoiceId, invoiceNumber, customerName, productName, quantity, sellPrice, minPrice, commissionAmount, userId, userName, tenantId, createdAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(id, affiliateId, type, reference || null, referenceType || null, description || null, entryCredit, entryDebit, newBalance, st, invoiceId || null, invoiceNumber || null, customerName || null, productName || null, quantity || null, sellPrice || null, minPrice || null, commissionAmount || null, req.user?.id || null, req.user?.name || null, tenantId, now());
  addAudit(affiliateId, 'LEDGER_ENTRY_CREATED', `${type}: ${description || ''} (${entryCredit > 0 ? '+' + entryCredit : '-' + entryDebit})`, null, null, req.user?.id, req.user?.name, tenantId);
  const entry = db.prepare('SELECT * FROM commission_ledger WHERE id = ?').get(id);
  res.status(201).json(entry);
});

router.post('/calculate', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const { affiliateId, invoiceId, invoiceNumber, customerName, items } = req.body;
  if (!affiliateId || !invoiceId) return res.status(400).json({ error: 'affiliateId et invoiceId requis' });
  const aff = db.prepare('SELECT * FROM affiliates WHERE id = ?').get(affiliateId) as any;
  if (!aff) return res.status(404).json({ error: 'Apporteur introuvable' });
  const tenantId = aff.tenantId;
  const rules = db.prepare('SELECT * FROM commission_rules WHERE tenantId = ? AND active = 1 ORDER BY priority ASC').all(tenantId) as any[];
  const entries: any[] = [];
  const productList = items || [];

  for (const item of productList) {
    const prod = db.prepare('SELECT * FROM products WHERE id = ?').get(item.productId) as any;
    const sellPrice = item.price || 0;
    const buyPrice = prod?.buyPrice || 0;
    const margin = sellPrice - buyPrice;
    let commissionAmount = 0;
    let ruleApplied = '';

    for (const rule of rules) {
      let match = false;
      if (rule.type === 'fixed_product' && rule.productId === item.productId) match = true;
      else if (rule.type === 'fixed_category' && rule.category === prod?.category) match = true;
      else if (rule.type === 'percentage') match = true;
      else if (rule.type === 'margin' && margin >= (rule.minValue ?? 0)) match = true;
      else if (rule.type === 'per_affiliate' && rule.affiliateId === affiliateId) match = true;
      else if (rule.type === 'per_client' && rule.clientId === customerName) match = true;
      else if (rule.type === 'per_quantity' && item.quantity >= (rule.minValue ?? 0)) match = true;
      else if (rule.type === 'campaign' && rule.campaign) match = true;
      if (match) {
        if (rule.type === 'percentage') commissionAmount = sellPrice * (rule.value / 100);
        else if (rule.type === 'margin') commissionAmount = margin * (rule.value / 100);
        else commissionAmount = rule.value * item.quantity;
        ruleApplied = rule.name;
        break;
      }
    }

    if (commissionAmount > 0) {
      const currentBalance = getAffiliateBalance(affiliateId);
      entries.push({
        affiliateId, type: 'commission', reference: invoiceNumber, referenceType: 'invoice',
        description: `Commission ${ruleApplied || ''} - ${item.productName || ''}`.trim(),
        credit: commissionAmount, debit: 0, balance: currentBalance + commissionAmount,
        status: 'pending', invoiceId, invoiceNumber, customerName,
        productName: item.productName, quantity: item.quantity,
        sellPrice, minPrice: prod?.buyPrice || 0, commissionAmount
      });
    }
  }

  for (const e of entries) {
    const id = genId('ledger');
    const bal = getAffiliateBalance(affiliateId);
    db.prepare(`
      INSERT INTO commission_ledger (id, affiliateId, type, reference, referenceType, description, credit, debit, balance, status, invoiceId, invoiceNumber, customerName, productName, quantity, sellPrice, minPrice, commissionAmount, userId, userName, tenantId, createdAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(id, e.affiliateId, e.type, e.reference, e.referenceType, e.description, e.credit, e.debit, bal + e.credit, e.status, e.invoiceId, e.invoiceNumber, e.customerName, e.productName, e.quantity, e.sellPrice, e.minPrice, e.commissionAmount, req.user?.id || null, req.user?.name || null, tenantId, now());
  }

  addAudit(affiliateId, 'COMMISSION_CALCULATED', `${entries.length} commission(s) calculée(s) pour facture ${invoiceNumber}`, null, null, req.user?.id, req.user?.name, tenantId);
  const affName = `${aff.firstName} ${aff.lastName}`;
  const updatedBalance = getAffiliateBalance(affiliateId);
  const oldBalance = updatedBalance - entries.reduce((s, e) => s + e.credit, 0);
  const thresholds = [100000, 200000, 500000, 1000000, 2000000, 5000000, 10000000];
  const crossed = thresholds.find(t => oldBalance < t && updatedBalance >= t);
  let notif: { text: string; type: string };
  if (entries.length > 0) {
    notif = { text: `💰 ${entries.length} commission(s) pour ${affName} sur facture ${invoiceNumber}`, type: 'success' };
    if (crossed) notif.text = `🎯 Seuil des ${fmt(crossed)} atteint ! ${notif.text}`;
  } else {
    notif = { text: `ℹ️ Aucune commission pour ${affName} sur facture ${invoiceNumber}`, type: 'info' };
  }
  res.json({ count: entries.length, entries, notification: notif, balance: updatedBalance });
});

router.get('/payments', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.query.tenantId as string || req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'tenantId requis' });
  const payments = db.prepare('SELECT * FROM commission_payments WHERE tenantId = ? ORDER BY createdAt DESC').all(tenantId);
  res.json(payments);
});

router.post('/payments', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'Aucun tenant actif' });
  const { affiliateId, amount, method, currency, notes, ledgerIds } = req.body;
  if (!affiliateId || !amount || amount <= 0) return res.status(400).json({ error: 'Apporteur et montant requis' });
  const aff = db.prepare('SELECT * FROM affiliates WHERE id = ?').get(affiliateId) as any;
  if (!aff) return res.status(404).json({ error: 'Apporteur introuvable' });
  if (aff.tenantId !== tenantId) return res.status(403).json({ error: 'Non autorisé' });

  const ids = ledgerIds || [];
  const balance = getAffiliateBalance(affiliateId);
  if (amount > balance) return res.status(400).json({ error: `Solde insuffisant: ${balance} < ${amount}` });

  const payId = genId('cmpay');
  const ref = `CMP-${String(Date.now()).slice(-8)}`;
  const t = now();

  db.transaction(() => {
    db.prepare(`INSERT INTO commission_payments (id, reference, affiliateId, affiliateName, amount, method, currency, notes, ledgerIds, userId, userName, tenantId, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(payId, ref, affiliateId, `${aff.firstName} ${aff.lastName}`, amount, method || 'cash', currency || 'GNF', notes || null, JSON.stringify(ids), req.user?.id || null, req.user?.name || null, tenantId, t);

    const currentBalance = getAffiliateBalance(affiliateId);
    const entryId = genId('ledger');
    db.prepare(`
      INSERT INTO commission_ledger (id, affiliateId, type, reference, referenceType, description, credit, debit, balance, status, paymentId, userId, userName, tenantId, createdAt)
      VALUES (?,?,'payment',?,?,?,0,?,?,?,?,?,?,?,?)
    `).run(entryId, affiliateId, ref, 'payment', notes || `Paiement commission (${method})`, amount, currentBalance - amount, 'paid', payId, req.user?.id || null, req.user?.name || null, tenantId, t);

    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      db.prepare(`UPDATE commission_ledger SET status = 'paid', paymentId = ? WHERE id IN (${placeholders})`).run(payId, ...ids);
    }

    addAudit(affiliateId, 'PAYMENT_MADE', `Paiement de ${amount} (${method}) ref: ${ref}`, null, null, req.user?.id, req.user?.name, tenantId);
  })();

  const payment = db.prepare('SELECT * FROM commission_payments WHERE id = ?').get(payId);
  const affName = `${aff.firstName} ${aff.lastName}`;
  res.status(201).json({ ...payment, notification: { text: `✅ Paiement commission : ${fmt(amount)} versés à ${affName} (${method})`, type: 'success' as const } });
});

router.get('/dashboard', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.query.tenantId as string || req.user?.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'tenantId requis' });
  const today = now().split('T')[0];
  const monthStart = new Date(); monthStart.setDate(1); const ms = monthStart.toISOString().split('T')[0];

  const todaySales = db.prepare("SELECT COUNT(*) as cnt, COALESCE(SUM(total),0) as rev FROM invoices WHERE tenantId = ? AND date >= ? AND status='validated'").get(tenantId, today) as any;
  const monthSales = db.prepare("SELECT COUNT(*) as cnt, COALESCE(SUM(total),0) as rev FROM invoices WHERE tenantId = ? AND date >= ? AND status='validated'").get(tenantId, ms) as any;
  const todayComm = db.prepare("SELECT COALESCE(SUM(credit),0) as c, COALESCE(SUM(debit),0) as d FROM commission_ledger WHERE tenantId = ? AND createdAt >= ?").get(tenantId, today) as any;
  const monthComm = db.prepare("SELECT COALESCE(SUM(credit),0) as c, COALESCE(SUM(debit),0) as d FROM commission_ledger WHERE tenantId = ? AND createdAt >= ?").get(tenantId, ms) as any;
  const totalToPay = db.prepare("SELECT COALESCE(SUM(credit - debit),0) as bal FROM commission_ledger WHERE tenantId = ? AND status IN ('pending','available','to_pay','partially_paid')").get(tenantId) as any;
  const totalPaid = db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM commission_payments WHERE tenantId = ?").get(tenantId) as any;
  const affiliateCount = db.prepare("SELECT COUNT(*) as cnt FROM affiliates WHERE tenantId = ? AND status='active'").get(tenantId) as any;

  const topAffiliates = db.prepare(`
    SELECT a.id, a.firstName, a.lastName, a.photo, COALESCE(SUM(l.credit),0) as total_comm, COALESCE(SUM(l.debit),0) as total_paid
    FROM affiliates a LEFT JOIN commission_ledger l ON a.id = l.affiliateId
    WHERE a.tenantId = ? GROUP BY a.id ORDER BY total_comm DESC LIMIT 10
  `).all(tenantId) as any[];

  const monthlyStats = db.prepare(`
    SELECT strftime('%Y-%m', createdAt) as month, SUM(credit) as comm, SUM(debit) as paid
    FROM commission_ledger WHERE tenantId = ? AND createdAt >= date('now', '-12 months')
    GROUP BY month ORDER BY month ASC
  `).all(tenantId) as any[];

  res.json({
    today: { sales: todaySales.cnt, revenue: todaySales.rev, commission: (todayComm.c || 0) - (todayComm.d || 0), paid: todayComm.d || 0 },
    month: { sales: monthSales.cnt, revenue: monthSales.rev, commission: (monthComm.c || 0) - (monthComm.d || 0), paid: monthComm.d || 0 },
    totalToPay: totalToPay.bal || 0,
    totalPaid: totalPaid.total || 0,
    activeAffiliates: affiliateCount.cnt,
    topAffiliates,
    monthlyStats
  });
});

router.get('/affiliates/:id/statement', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const entries = db.prepare('SELECT * FROM commission_ledger WHERE affiliateId = ? ORDER BY createdAt ASC').all(req.params.id);
  const balance = getAffiliateBalance(req.params.id);
  res.json({ entries, balance });
});

export default router;
