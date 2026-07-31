import { BaseService } from './baseService.js';
import db from '../../database/db.js';

function genId(p: string) { return `${p}-${Date.now()}-${Math.floor(Math.random() * 10000)}`; }
function now() { return new Date().toISOString(); }

function hashPassword(pw: string): string {
  let h = 0; for (let i = 0; i < pw.length; i++) { const c = pw.charCodeAt(i); h = ((h << 5) - h) + c; h |= 0; }
  return `simple_hash_${Math.abs(h)}`;
}

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let p = '';
  for (let i = 0; i < 10; i++) p += chars.charAt(Math.floor(Math.random() * chars.length));
  return p;
}

export class TenantService extends BaseService {
  constructor() {
    super('tenants', 'tenants', []);
  }

  getSettings(): { plans: any[]; settings: any } {
    const plans = db.prepare('SELECT * FROM pricing_plans WHERE active = 1 ORDER BY displayOrder ASC').all() as any[];
    const parsedPlans = plans.map(p => ({ ...p, features: JSON.parse(p.features || '[]'), limits: JSON.parse(p.limits || '{}') }));
    const settings = db.prepare('SELECT * FROM global_saas_settings ORDER BY id DESC LIMIT 1').get() as any;
    const mappedSettings = settings ? { ...settings, automaticActivation: !!settings.automaticActivation } : null;
    return { plans: parsedPlans, settings: mappedSettings };
  }

  updateSettings(data: any): any {
    const { trialDays, gracePeriodDays, revertToPlanOnExpiry, orangeMoneyNumber, orangeMoneyName, mobileMoneyNumber, mobileMoneyName, bankDetails, paymentInstructions, automaticActivation } = data;
    db.prepare(`
      UPDATE global_saas_settings SET trialDays = ?, gracePeriodDays = ?, revertToPlanOnExpiry = ?, orangeMoneyNumber = ?, orangeMoneyName = ?, mobileMoneyNumber = ?, mobileMoneyName = ?, bankDetails = ?, paymentInstructions = ?, automaticActivation = ? WHERE id = 1
    `).run(trialDays, gracePeriodDays, revertToPlanOnExpiry, orangeMoneyNumber || null, orangeMoneyName || null, mobileMoneyNumber || null, mobileMoneyName || null, bankDetails || null, paymentInstructions || null, automaticActivation ? 1 : 0);
    const updated = db.prepare('SELECT * FROM global_saas_settings WHERE id = 1').get() as any;
    const mapped = { ...updated, automaticActivation: !!updated.automaticActivation };
    this.enqueueSyncFor('global_saas_settings', '1', 'UPDATE', { ...mapped, id: 1 });
    return mapped;
  }

  private logAudit(action: string, details: string, tenantId: string, userId = 'system', userName = 'system') {
    const id = genId('aud');
    const timestamp = now();
    db.prepare('INSERT INTO audit_logs (id, timestamp, userId, userName, action, details, tenantId) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, timestamp, userId, userName, action, details, tenantId);
    // Enregistrer la trace uniquement si le tenant existe réellement (la pseudo-entreprise
    // 'superadmin' n'a pas de ligne PG correspondante et casserait la FK tenant_id).
    const tenantExists = db.prepare('SELECT 1 FROM tenants WHERE id = ?').get(tenantId);
    if (tenantExists) {
      this.enqueueSyncFor('audit_logs', id, 'CREATE', { id, timestamp, userId, userName, action, details, tenantId, legacy_id: id });
    }
  }

  getAllTenants(): any[] {
    const tenants = db.prepare('SELECT * FROM tenants ORDER BY createdAt DESC').all() as any[];
    return tenants.map(t => ({ ...t, customCategories: JSON.parse(t.customCategories || '[]') }));
  }

  getTenantById(id: string): any | null {
    const t = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id) as any;
    if (!t) return null;
    const userCount = (db.prepare('SELECT COUNT(*) as cnt FROM users WHERE tenantId = ?').get(t.id) as any)?.cnt || 0;
    return { ...t, userCount, customCategories: JSON.parse(t.customCategories || '[]') };
  }

  createTenant(data: any): any {
    const { name, email, plan, phone, address, city, country, currency } = data;
    if (!name || !email) throw new Error('Nom et email requis');
    const tenantId = `tenant-${Date.now()}`;
    const userId = genId('user');
    const password = generatePassword();
    const hashed = hashPassword(password);
    const settings = db.prepare('SELECT * FROM global_saas_settings ORDER BY id DESC LIMIT 1').get() as any;
    const trialDays = settings?.trialDays || 14;
    const startDate = now();
    const trialEnd = new Date(Date.now() + trialDays * 86400000).toISOString();
    this.runInTransaction(() => {
      db.prepare(`
        INSERT INTO tenants (id, name, email, phone, address, city, country, currency, plan, subscriptionStatus, subscriptionStartDate, subscriptionEndDate, trialStartDate, trialEndDate, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'TRIAL', ?, ?, ?, ?, ?, ?)
      `).run(tenantId, name, email, phone || null, address || null, city || null, country || null, currency || 'GNF', plan || 'Free', startDate, trialEnd || null, startDate, trialEnd, startDate, startDate);
      db.prepare(`INSERT INTO users (id, name, email, password, role, tenantId, active, createdAt) VALUES (?, ?, ?, ?, 'owner', ?, 1, ?)`).run(userId, name, email, hashed, tenantId, startDate);
      this.logAudit('TENANT_CREATED', `Entreprise "${name}" créée avec le plan ${plan || 'Free'} (trial: ${trialDays}j)`, 'superadmin', 'system', 'system');
    });
    this.enqueueSync('CREATE', tenantId, { id: tenantId, name, email, plan, legacy_id: tenantId }, tenantId);
    return { tenant: db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId), adminEmail: email, adminPassword: password };
  }

  updateTenant(id: string, data: any): any | null {
    const t = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id) as any;
    if (!t) return null;
    const { name, email, phone, address, city, country, currency, description, logo } = data;
    db.prepare(`
      UPDATE tenants SET name = COALESCE(?, name), email = COALESCE(?, email), phone = COALESCE(?, phone),
      address = COALESCE(?, address), city = COALESCE(?, city), country = COALESCE(?, country),
      currency = COALESCE(?, currency), description = COALESCE(?, description), logo = COALESCE(?, logo),
      updatedAt = ? WHERE id = ?
    `).run(name || null, email || null, phone || null, address || null, city || null, country || null, currency || null, description || null, logo || null, now(), t.id);
    this.enqueueSync('UPDATE', id, data, id);
    return db.prepare('SELECT * FROM tenants WHERE id = ?').get(t.id);
  }

  updateTenantStatus(id: string, status: string): any | null {
    const t = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id) as any;
    if (!t) return null;
    const valid = ['ACTIVE', 'SUSPENDED', 'BLOCKED', 'EXPIRED', 'TRIAL'];
    if (!valid.includes(status)) throw new Error(`Statut invalide. Utilisez: ${valid.join(', ')}`);
    db.prepare('UPDATE tenants SET subscriptionStatus = ?, updatedAt = ? WHERE id = ?').run(status, now(), t.id);
    const action = status === 'SUSPENDED' ? 'TENANT_SUSPENDED' : status === 'BLOCKED' ? 'TENANT_BLOCKED' : 'TENANT_REACTIVATED';
    this.logAudit(action, `Statut changé: ${t.subscriptionStatus} → ${status}`, t.id);
    this.enqueueSync('UPDATE', id, { subscriptionStatus: status, legacy_id: id }, t.id);
    return db.prepare('SELECT * FROM tenants WHERE id = ?').get(t.id);
  }

  updateTenantPlan(id: string, plan: string): any | null {
    const t = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id) as any;
    if (!t) return null;
    const planRow = db.prepare('SELECT * FROM pricing_plans WHERE name = ? AND active = 1').get(plan) as any;
    if (!planRow) throw new Error('Plan introuvable ou inactif');
    db.prepare('UPDATE tenants SET plan = ?, updatedAt = ? WHERE id = ?').run(plan, now(), t.id);
    this.logAudit('PLAN_CHANGED', `Plan changé: ${t.plan} → ${plan}`, t.id);
    this.enqueueSync('UPDATE', id, { plan, legacy_id: id }, t.id);
    return db.prepare('SELECT * FROM tenants WHERE id = ?').get(t.id);
  }

  updateTenantExpiry(id: string, data: { subscriptionEndDate?: string; subscriptionStartDate?: string }): any | null {
    const t = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id) as any;
    if (!t) return null;
    const { subscriptionEndDate, subscriptionStartDate } = data;
    if (subscriptionEndDate) db.prepare('UPDATE tenants SET subscriptionEndDate = ?, updatedAt = ? WHERE id = ?').run(subscriptionEndDate, now(), t.id);
    if (subscriptionStartDate) db.prepare('UPDATE tenants SET subscriptionStartDate = ?, updatedAt = ? WHERE id = ?').run(subscriptionStartDate, now(), t.id);
    this.logAudit('EXPIRY_MODIFIED', subscriptionEndDate ? `Date d'expiration modifiée en ${subscriptionEndDate.split('T')[0]}` : 'Date de début modifiée', t.id);
    this.enqueueSync('UPDATE', id, data, t.id);
    return db.prepare('SELECT * FROM tenants WHERE id = ?').get(t.id);
  }

  grantTrial(id: string, days: number): any | null {
    const t = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id) as any;
    if (!t) return null;
    if (!days || days <= 0) throw new Error('Nombre de jours valide requis');
    const currentEnd = t.subscriptionEndDate ? new Date(t.subscriptionEndDate) : new Date();
    const newEnd = new Date(currentEnd.getTime() + days * 86400000).toISOString();
    const trialEnd = t.trialEndDate ? new Date(new Date(t.trialEndDate).getTime() + days * 86400000).toISOString() : newEnd;
    db.prepare('UPDATE tenants SET trialEndDate = ?, subscriptionEndDate = ?, subscriptionStatus = CASE WHEN subscriptionStatus IN (\'EXPIRED\',\'SUSPENDED\') THEN \'TRIAL\' ELSE subscriptionStatus END, updatedAt = ? WHERE id = ?')
      .run(trialEnd, newEnd, now(), t.id);
    this.logAudit('TRIAL_GRANTED', `${days} jours d'essai gratuits accordés`, t.id);
    this.enqueueSync('UPDATE', id, { trialEndDate: trialEnd, subscriptionEndDate: newEnd, legacy_id: id }, t.id);
    return db.prepare('SELECT * FROM tenants WHERE id = ?').get(t.id);
  }

  getTenantStats(id: string): any | null {
    const t = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id) as any;
    if (!t) return null;
    const tenantId = t.id;
    const productCount = (db.prepare('SELECT COUNT(*) as cnt FROM products WHERE tenantId = ?').get(tenantId) as any)?.cnt || 0;
    const saleCount = (db.prepare('SELECT COUNT(*) as cnt FROM sales WHERE tenantId = ?').get(tenantId) as any)?.cnt || 0;
    const invoiceCount = (db.prepare('SELECT COUNT(*) as cnt FROM invoices WHERE tenantId = ?').get(tenantId) as any)?.cnt || 0;
    const customerCount = (db.prepare('SELECT COUNT(*) as cnt FROM customers WHERE tenantId = ?').get(tenantId) as any)?.cnt || 0;
    const userCount = (db.prepare('SELECT COUNT(*) as cnt FROM users WHERE tenantId = ? AND active = 1').get(tenantId) as any)?.cnt || 0;
    const totalRevenue = (db.prepare("SELECT COALESCE(SUM(total),0) as rev FROM sales WHERE tenantId = ? AND paymentStatus != 'cancelled'").get(tenantId) as any)?.rev || 0;
    const totalSalesMonth = (db.prepare("SELECT COALESCE(SUM(total),0) as rev FROM sales WHERE tenantId = ? AND paymentStatus != 'cancelled' AND date >= date('now','-30 days')").get(tenantId) as any)?.rev || 0;
    const expenseCount = (db.prepare('SELECT COUNT(*) as cnt FROM expenses WHERE tenantId = ?').get(tenantId) as any)?.cnt || 0;
    return { productCount, saleCount, invoiceCount, customerCount, userCount, totalRevenue, totalSalesMonth, expenseCount };
  }

  getTenantLogs(id: string): any[] | null {
    const t = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id) as any;
    if (!t) return null;
    return db.prepare('SELECT * FROM audit_logs WHERE tenantId = ? ORDER BY timestamp DESC LIMIT 100').all(t.id) as any[];
  }

  deleteTenant(id: string): { success: boolean; message: string } | null {
    const t = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id) as any;
    if (!t) return null;
    const userCount = (db.prepare('SELECT COUNT(*) as cnt FROM users WHERE tenantId = ?').get(t.id) as any)?.cnt || 0;
    if (userCount > 0) throw new Error(`Supprimez d'abord les ${userCount} utilisateur(s) de cette entreprise.`);
    this.runInTransaction(() => {
      db.prepare('DELETE FROM tenants WHERE id = ?').run(t.id);
      this.logAudit('TENANT_DELETED', `Entreprise "${t.name}" supprimée`, t.id);
    });
    this.enqueueSync('DELETE', id, t, id);
    return { success: true, message: `Entreprise "${t.name}" supprimée` };
  }

  updateMyTenant(tenantId: string, data: any): any {
    const { name, description, logo, address, phone, currency, taxRate } = data;
    db.prepare(`
      UPDATE tenants SET name = COALESCE(?, name), description = COALESCE(?, description), logo = COALESCE(?, logo),
      address = COALESCE(?, address), phone = COALESCE(?, phone), currency = COALESCE(?, currency),
      taxRate = COALESCE(?, taxRate) WHERE id = ?
    `).run(name || null, description || null, logo || null, address || null, phone || null, currency || null, taxRate !== undefined ? taxRate : null, tenantId);
    this.enqueueSync('UPDATE', tenantId, data, tenantId);
    return db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);
  }

  updateSubscription(id: string, data: { plan?: string; subscriptionStatus?: string; subscriptionStartDate?: string; subscriptionEndDate?: string }): any | null {
    const { plan, subscriptionStatus, subscriptionStartDate, subscriptionEndDate } = data;
    db.prepare(`UPDATE tenants SET plan = ?, subscriptionStatus = ?, subscriptionStartDate = ?, subscriptionEndDate = ? WHERE id = ?`)
      .run(plan, subscriptionStatus, subscriptionStartDate || null, subscriptionEndDate || null, id);
    this.enqueueSync('UPDATE', id, data, id);
    return db.prepare('SELECT * FROM tenants WHERE id = ?').get(id);
  }

  getPayments(user: { id: string; role: string; tenantId: string }): any[] {
    if (user.role === 'superadmin') {
      return db.prepare('SELECT * FROM subscription_payments ORDER BY date DESC').all() as any[];
    }
    return db.prepare('SELECT * FROM subscription_payments WHERE tenantId = ? ORDER BY date DESC').all(user.tenantId) as any[];
  }

  createPayment(data: any, user: { id: string; name: string; tenantId: string }): any {
    const tenantId = user.tenantId;
    const { planId, planName, amount, currency, paymentMethod, reference, transactionNumber, comment, receiptImage } = data;
    const id = `pm-${Date.now()}`;
    const date = new Date().toISOString().split('T')[0];
    const timestamp = new Date().toISOString();
    const activeTenant = db.prepare('SELECT name FROM tenants WHERE id = ?').get(tenantId) as { name: string };
    this.runInTransaction(() => {
      db.prepare(`
        INSERT INTO subscription_payments (id, tenantId, tenantName, planId, planName, amount, currency, paymentMethod, reference, transactionNumber, date, comment, receiptImage, status, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, tenantId, activeTenant.name, planId, planName, amount, currency || 'EUR', paymentMethod, reference, transactionNumber, date, comment || null, receiptImage || null, 'PENDING', timestamp, timestamp);
      db.prepare('UPDATE tenants SET subscriptionStatus = \'PENDING\', subscriptionPlanId = ? WHERE id = ?').run(planId, tenantId);
      this.logAudit('ABONNEMENT_DECLARE', `Déclaration de paiement pour le plan ${planName} (${amount} EUR) par ${paymentMethod}`, tenantId, user.id, user.name);
    });
    this.enqueueSync('CREATE', id, { id, tenantId, planName, amount, legacy_id: id, _table: 'subscription_payments' }, tenantId);
    return db.prepare('SELECT * FROM subscription_payments WHERE id = ?').get(id);
  }

  auditPayment(id: string, data: { status: string; adminComment?: string }): any | null {
    const { status, adminComment } = data;
    const timestamp = now();
    const payment = db.prepare('SELECT * FROM subscription_payments WHERE id = ?').get(id) as any;
    if (!payment) return null;
    this.runInTransaction(() => {
      db.prepare('UPDATE subscription_payments SET status = ?, adminComment = ?, updatedAt = ? WHERE id = ?').run(status, adminComment || null, timestamp, id);
      if (status === 'APPROVED') {
        const startDate = now();
        const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        db.prepare('UPDATE tenants SET plan = ?, subscriptionStatus = \'ACTIVE\', subscriptionStartDate = ?, subscriptionEndDate = ?, subscriptionPlanId = ? WHERE id = ?')
          .run(payment.planName, startDate, endDate, payment.planId, payment.tenantId);
        const invId = `inv-${Date.now()}`;
        db.prepare('INSERT INTO subscription_invoices (id, invoiceNumber, date, amount, plan, status, tenantId) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(invId, `INV-${Date.now()}`, startDate.split('T')[0], payment.amount, payment.planName, 'paye', payment.tenantId);
        this.enqueueSyncFor('subscription_invoices', invId, 'CREATE', {
          id: invId,
          invoiceNumber: invId,
          date: startDate,
          amount: payment.amount,
          plan: payment.planName,
          status: 'paye',
          tenantId: payment.tenantId,
          legacy_id: invId,
        }, payment.tenantId);
      } else if (status === 'REJECTED') {
        db.prepare('UPDATE tenants SET subscriptionStatus = \'EXPIRED\' WHERE id = ?').run(payment.tenantId);
      }
    });
    this.enqueueSync('UPDATE', id, { status, legacy_id: id }, payment.tenantId);
    return db.prepare('SELECT * FROM subscription_payments WHERE id = ?').get(id);
  }
}

export const tenantService = new TenantService();
