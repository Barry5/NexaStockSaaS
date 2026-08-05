import { BaseService } from './baseService.js';
import db from '../../database/db.js';
import { genId } from '../../utils/ids.js';

function now() { return new Date().toISOString(); }

export class CommissionService extends BaseService {
  constructor() {
    super('commission_ledger', 'commission_ledger', []);
  }

  private addAudit(affiliateId: string, action: string, details: string, oldVal: string | null, newVal: string | null, userId?: string, userName?: string, tenantId?: string) {
    db.prepare(`INSERT INTO commission_audit (id, affiliateId, action, details, oldValue, newValue, userId, userName, tenantId, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(genId('aud'), affiliateId, action, details, oldVal, newVal, userId || null, userName || null, tenantId || null, now());
  }

  private getAffiliateBalance(affiliateId: string): number {
    const r = db.prepare('SELECT COALESCE(SUM(credit),0) - COALESCE(SUM(debit),0) as bal FROM commission_ledger WHERE affiliateId = ?').get(affiliateId) as any;
    return r?.bal || 0;
  }

  getAffiliates(tenantId: string): any[] {
    const affiliates = db.prepare('SELECT * FROM affiliates WHERE tenantId = ? ORDER BY createdAt DESC').all(tenantId) as any[];
    return affiliates.map((a: any) => ({ ...a, balance: this.getAffiliateBalance(a.id) }));
  }

  createAffiliate(data: any, tenantId: string, userId?: string, userName?: string): any {
    const { firstName, lastName, phone, email, address, city, country, company, idNumber, notes, photo } = data;
    if (!firstName || !lastName) throw new Error('PrÃ©nom et nom requis');
    const id = genId('aff');
    const code = `APP-${String(Date.now()).slice(-6)}`;
    const t = now();
    db.prepare(`
      INSERT INTO affiliates (id, code, firstName, lastName, photo, phone, email, address, city, country, company, idNumber, status, notes, tenantId, createdAt, updatedAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?,?,?)
    `).run(id, code, firstName, lastName, photo || null, phone || null, email || null, address || null, city || null, country || 'GuinÃ©e', company || null, idNumber || null, notes || null, tenantId, t, t);
    this.addAudit(id, 'AFFILIATE_CREATED', `Apporteur ${firstName} ${lastName} crÃ©Ã©`, null, null, userId, userName, tenantId);
    this.enqueueSync('CREATE', id, { id, code, firstName, lastName, tenantId, legacy_id: id, _table: 'affiliates' }, tenantId);
    const aff = db.prepare('SELECT * FROM affiliates WHERE id = ?').get(id) as any;
    return { ...aff, balance: 0, notification: { text: `âœ… Apporteur ${firstName} ${lastName} (${code}) crÃ©Ã© avec succÃ¨s`, type: 'success' as const } };
  }

  updateAffiliate(id: string, data: any, userId?: string, userName?: string): any | null {
    const aff = db.prepare('SELECT * FROM affiliates WHERE id = ?').get(id) as any;
    if (!aff) return null;
    const { firstName, lastName, phone, email, address, city, country, company, idNumber, status, notes, photo } = data;
    const t = now();
    const oldStatus = aff.status;
    db.prepare(`UPDATE affiliates SET firstName=?, lastName=?, photo=?, phone=?, email=?, address=?, city=?, country=?, company=?, idNumber=?, status=?, notes=?, updatedAt=? WHERE id=?`)
      .run(firstName || aff.firstName, lastName || aff.lastName, photo !== undefined ? photo : aff.photo, phone !== undefined ? phone : aff.phone, email !== undefined ? email : aff.email, address !== undefined ? address : aff.address, city !== undefined ? city : aff.city, country || aff.country, company !== undefined ? company : aff.company, idNumber !== undefined ? idNumber : aff.idNumber, status || aff.status, notes !== undefined ? notes : aff.notes, t, aff.id);
    if (status && status !== oldStatus) {
      this.addAudit(aff.id, 'AFFILIATE_STATUS_CHANGED', `Statut changÃ©: ${oldStatus} -> ${status}`, oldStatus, status, userId, userName, aff.tenantId);
    }
    this.addAudit(aff.id, 'AFFILIATE_UPDATED', 'Fiche apporteur modifiÃ©e', null, null, userId, userName, aff.tenantId);
    this.enqueueSync('UPDATE', id, { ...data, legacy_id: id }, aff.tenantId);
    const updated = db.prepare('SELECT * FROM affiliates WHERE id = ?').get(aff.id) as any;
    return { ...updated, balance: this.getAffiliateBalance(aff.id) };
  }

  getRules(tenantId: string): any[] {
    return db.prepare('SELECT * FROM commission_rules WHERE tenantId = ? ORDER BY priority ASC').all(tenantId) as any[];
  }

  createRule(data: any, tenantId: string): any {
    const { name, type, value, minValue, maxValue, productId, category, clientId, affiliateId, campaign, priority } = data;
    if (!name || !type || value === undefined) throw new Error('Nom, type et valeur requis');
    const id = genId('rule');
    db.prepare(`
      INSERT INTO commission_rules (id, name, type, value, minValue, maxValue, productId, category, clientId, affiliateId, campaign, priority, active, tenantId, createdAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)
    `).run(id, name, type, value, minValue ?? null, maxValue ?? null, productId || null, category || null, clientId || null, affiliateId || null, campaign || null, priority || 0, tenantId, now());
    this.enqueueSync('CREATE', id, { id, name, type, value, tenantId, legacy_id: id, _table: 'commission_rules' }, tenantId);
    return db.prepare('SELECT * FROM commission_rules WHERE id = ?').get(id);
  }

  updateRule(id: string, data: any): any | null {
    const rule = db.prepare('SELECT * FROM commission_rules WHERE id = ?').get(id) as any;
    if (!rule) return null;
    const { name, type, value, minValue, maxValue, productId, category, clientId, affiliateId, campaign, priority, active } = data;
    db.prepare(`UPDATE commission_rules SET name=?, type=?, value=?, minValue=?, maxValue=?, productId=?, category=?, clientId=?, affiliateId=?, campaign=?, priority=?, active=? WHERE id=?`)
      .run(name || rule.name, type || rule.type, value !== undefined ? value : rule.value, minValue !== undefined ? minValue : rule.minValue, maxValue !== undefined ? maxValue : rule.maxValue, productId !== undefined ? productId : rule.productId, category !== undefined ? category : rule.category, clientId !== undefined ? clientId : rule.clientId, affiliateId !== undefined ? affiliateId : rule.affiliateId, campaign !== undefined ? campaign : rule.campaign, priority !== undefined ? priority : rule.priority, active !== undefined ? (active ? 1 : 0) : rule.active, rule.id);
    this.enqueueSync('UPDATE', id, { ...data, legacy_id: id }, rule.tenantId);
    return db.prepare('SELECT * FROM commission_rules WHERE id = ?').get(rule.id);
  }

  deleteRule(id: string): boolean {
    const rule = db.prepare('SELECT * FROM commission_rules WHERE id = ?').get(id) as any;
    if (!rule) return false;
    db.prepare('DELETE FROM commission_rules WHERE id = ?').run(rule.id);
    this.enqueueSync('DELETE', id, rule, rule.tenantId);
    return true;
  }

  getLedger(affiliateId: string): { entries: any[]; balance: number } {
    const entries = db.prepare('SELECT * FROM commission_ledger WHERE affiliateId = ? ORDER BY createdAt DESC').all(affiliateId);
    const balance = this.getAffiliateBalance(affiliateId);
    return { entries, balance };
  }

  createLedgerEntry(data: any, tenantId: string, userId?: string, userName?: string): any {
    const { affiliateId, type, reference, referenceType, description, credit, debit, invoiceId, invoiceNumber, customerName, productName, quantity, sellPrice, minPrice, commissionAmount, status } = data;
    const aff = db.prepare('SELECT * FROM affiliates WHERE id = ?').get(affiliateId) as any;
    if (!aff) throw new Error('Apporteur introuvable');
    if (aff.tenantId !== tenantId) throw new Error('Non autorisÃ©');
    const id = genId('ledger');
    const currentBalance = this.getAffiliateBalance(affiliateId);
    const entryCredit = credit || 0;
    const entryDebit = debit || 0;
    const newBalance = currentBalance + entryCredit - entryDebit;
    const st = status || 'pending';
    db.prepare(`
      INSERT INTO commission_ledger (id, affiliateId, type, reference, referenceType, description, credit, debit, balance, status, invoiceId, invoiceNumber, customerName, productName, quantity, sellPrice, minPrice, commissionAmount, userId, userName, tenantId, createdAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(id, affiliateId, type, reference || null, referenceType || null, description || null, entryCredit, entryDebit, newBalance, st, invoiceId || null, invoiceNumber || null, customerName || null, productName || null, quantity || null, sellPrice || null, minPrice || null, commissionAmount || null, userId || null, userName || null, tenantId, now());
    this.addAudit(affiliateId, 'LEDGER_ENTRY_CREATED', `${type}: ${description || ''} (${entryCredit > 0 ? '+' + entryCredit : '-' + entryDebit})`, null, null, userId, userName, tenantId);
    this.enqueueSync('CREATE', id, { id, affiliateId, type, credit: entryCredit, debit: entryDebit, tenantId, legacy_id: id, _table: 'commission_ledger' }, tenantId);
    return db.prepare('SELECT * FROM commission_ledger WHERE id = ?').get(id);
  }

  calculateCommissions(data: any, userId?: string, userName?: string): any {
    const { affiliateId, invoiceId, invoiceNumber, customerName, items } = data;
    if (!affiliateId || !invoiceId) throw new Error('affiliateId et invoiceId requis');
    const aff = db.prepare('SELECT * FROM affiliates WHERE id = ?').get(affiliateId) as any;
    if (!aff) throw new Error('Apporteur introuvable');
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
        entries.push({
          affiliateId, type: 'commission', reference: invoiceNumber, referenceType: 'invoice',
          description: `Commission ${ruleApplied || ''} - ${item.productName || ''}`.trim(),
          credit: commissionAmount, debit: 0, status: 'pending', invoiceId, invoiceNumber, customerName,
          productName: item.productName, quantity: item.quantity, sellPrice, minPrice: prod?.buyPrice || 0, commissionAmount,
        });
      }
    }

    for (const e of entries) {
      const id = genId('ledger');
      const bal = this.getAffiliateBalance(affiliateId);
      db.prepare(`
        INSERT INTO commission_ledger (id, affiliateId, type, reference, referenceType, description, credit, debit, balance, status, invoiceId, invoiceNumber, customerName, productName, quantity, sellPrice, minPrice, commissionAmount, userId, userName, tenantId, createdAt)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(id, e.affiliateId, e.type, e.reference, e.referenceType, e.description, e.credit, e.debit, bal + e.credit, e.status, e.invoiceId, e.invoiceNumber, e.customerName, e.productName, e.quantity, e.sellPrice, e.minPrice, e.commissionAmount, userId || null, userName || null, tenantId, now());
      this.enqueueSync('CREATE', id, { id, ...e, tenantId, legacy_id: id, _table: 'commission_ledger' }, tenantId);
    }

    this.addAudit(affiliateId, 'COMMISSION_CALCULATED', `${entries.length} commission(s) calculÃ©e(s) pour facture ${invoiceNumber}`, null, null, userId, userName, tenantId);
    const affName = `${aff.firstName} ${aff.lastName}`;
    const updatedBalance = this.getAffiliateBalance(affiliateId);
    const oldBalance = updatedBalance - entries.reduce((s, e) => s + e.credit, 0);
    const thresholds = [100000, 200000, 500000, 1000000, 2000000, 5000000, 10000000];
    const crossed = thresholds.find(t => oldBalance < t && updatedBalance >= t);
    let notif: { text: string; type: string };
    if (entries.length > 0) {
      notif = { text: `ðŸ’° ${entries.length} commission(s) pour ${affName} sur facture ${invoiceNumber}`, type: 'success' };
      if (crossed) notif.text = `ðŸŽ¯ Seuil des ${new Intl.NumberFormat('fr-FR').format(crossed)} GNF atteint ! ${notif.text}`;
    } else {
      notif = { text: `â„¹ï¸ Aucune commission pour ${affName} sur facture ${invoiceNumber}`, type: 'info' };
    }
    return { count: entries.length, entries, notification: notif, balance: updatedBalance };
  }

  getPayments(tenantId: string): any[] {
    return db.prepare('SELECT * FROM commission_payments WHERE tenantId = ? ORDER BY createdAt DESC').all(tenantId) as any[];
  }

  recordPayment(data: any, tenantId: string, userId?: string, userName?: string): any {
    const { affiliateId, amount, method, currency, notes, ledgerIds } = data;
    if (!affiliateId || !amount || amount <= 0) throw new Error('Apporteur et montant requis');
    const aff = db.prepare('SELECT * FROM affiliates WHERE id = ?').get(affiliateId) as any;
    if (!aff) throw new Error('Apporteur introuvable');
    if (aff.tenantId !== tenantId) throw new Error('Non autorisÃ©');

    const ids = ledgerIds || [];
    const balance = this.getAffiliateBalance(affiliateId);
    if (amount > balance) throw new Error(`Solde insuffisant: ${balance} < ${amount}`);

    const payId = genId('cmpay');
    const ref = `CMP-${String(Date.now()).slice(-8)}`;
    const t = now();

    this.runInTransaction(() => {
      db.prepare(`INSERT INTO commission_payments (id, reference, affiliateId, affiliateName, amount, method, currency, notes, ledgerIds, userId, userName, tenantId, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(payId, ref, affiliateId, `${aff.firstName} ${aff.lastName}`, amount, method || 'cash', currency || 'GNF', notes || null, JSON.stringify(ids), userId || null, userName || null, tenantId, t);

      const currentBalance = this.getAffiliateBalance(affiliateId);
      const entryId = genId('ledger');
      db.prepare(`
        INSERT INTO commission_ledger (id, affiliateId, type, reference, referenceType, description, credit, debit, balance, status, paymentId, userId, userName, tenantId, createdAt)
        VALUES (?,?,'payment',?,?,?,0,?,?,?,?,?,?,?,?)
      `).run(entryId, affiliateId, ref, 'payment', notes || `Paiement commission (${method})`, amount, currentBalance - amount, 'paid', payId, userId || null, userName || null, tenantId, t);

      if (ids.length > 0) {
        const placeholders = ids.map(() => '?').join(',');
        db.prepare(`UPDATE commission_ledger SET status = 'paid', paymentId = ? WHERE id IN (${placeholders})`).run(payId, ...ids);
      }

      this.addAudit(affiliateId, 'PAYMENT_MADE', `Paiement de ${amount} (${method}) ref: ${ref}`, null, null, userId, userName, tenantId);
    });

    this.enqueueSync('CREATE', payId, { id: payId, reference: ref, affiliateId, amount, tenantId, legacy_id: payId, _table: 'commission_payments' }, tenantId);
    const payment = db.prepare('SELECT * FROM commission_payments WHERE id = ?').get(payId) as Record<string, unknown>;
    const affName = `${aff.firstName} ${aff.lastName}`;
    return { ...payment, notification: { text: `âœ… Paiement commission : ${new Intl.NumberFormat('fr-FR').format(amount)} GNF versÃ©s Ã  ${affName} (${method})`, type: 'success' as const } };
  }

  getDashboard(tenantId: string): any {
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

    return {
      today: { sales: todaySales.cnt, revenue: todaySales.rev, commission: (todayComm.c || 0) - (todayComm.d || 0), paid: todayComm.d || 0 },
      month: { sales: monthSales.cnt, revenue: monthSales.rev, commission: (monthComm.c || 0) - (monthComm.d || 0), paid: monthComm.d || 0 },
      totalToPay: totalToPay.bal || 0, totalPaid: totalPaid.total || 0, activeAffiliates: affiliateCount.cnt, topAffiliates, monthlyStats,
    };
  }

  getAffiliateStatement(affiliateId: string): { entries: any[]; balance: number } {
    const entries = db.prepare('SELECT * FROM commission_ledger WHERE affiliateId = ? ORDER BY createdAt ASC').all(affiliateId);
    const balance = this.getAffiliateBalance(affiliateId);
    return { entries, balance };
  }
}

export const commissionService = new CommissionService();
