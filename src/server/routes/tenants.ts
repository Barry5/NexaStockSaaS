import { Router, Response } from 'express';
import db from '../database/db.js';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { tenantUpdateSchema } from '../schemas/index.js';

const router = Router();

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

// GET: Retrieve global SaaS settings & pricing plans (accessible to all authenticated users)
router.get('/settings', authenticateToken, (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const plans = db.prepare('SELECT * FROM pricing_plans WHERE active = 1 ORDER BY displayOrder ASC').all() as any[];
    const parsedPlans = plans.map(p => ({
      ...p,
      features: JSON.parse(p.features || '[]'),
      limits: JSON.parse(p.limits || '{}')
    }));

    const settings = db.prepare('SELECT * FROM global_saas_settings ORDER BY id DESC LIMIT 1').get() as any;
    const mappedSettings = settings ? {
      ...settings,
      automaticActivation: !!settings.automaticActivation
    } : null;

    res.json({
      plans: parsedPlans,
      settings: mappedSettings
    });
  } catch (error) {
    next(error);
  }
});

// PUT: Update global SaaS settings (Requires superadmin)
router.put('/settings', authenticateToken, requireRole(['superadmin']), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { trialDays, gracePeriodDays, revertToPlanOnExpiry, orangeMoneyNumber, orangeMoneyName, mobileMoneyNumber, mobileMoneyName, bankDetails, paymentInstructions, automaticActivation } = req.body;

    db.prepare(`
      UPDATE global_saas_settings
      SET trialDays = ?, gracePeriodDays = ?, revertToPlanOnExpiry = ?, orangeMoneyNumber = ?, orangeMoneyName = ?, mobileMoneyNumber = ?, mobileMoneyName = ?, bankDetails = ?, paymentInstructions = ?, automaticActivation = ?
      WHERE id = 1
    `).run(
      trialDays,
      gracePeriodDays,
      revertToPlanOnExpiry,
      orangeMoneyNumber || null,
      orangeMoneyName || null,
      mobileMoneyNumber || null,
      mobileMoneyName || null,
      bankDetails || null,
      paymentInstructions || null,
      automaticActivation ? 1 : 0
    );

    const updated = db.prepare('SELECT * FROM global_saas_settings WHERE id = 1').get() as any;
    res.json({
      ...updated,
      automaticActivation: !!updated.automaticActivation
    });
  } catch (error) {
    next(error);
  }
});

// GET: List all tenants (Requires superadmin)
router.get('/tenants', authenticateToken, requireRole(['superadmin']), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenants = db.prepare('SELECT * FROM tenants ORDER BY createdAt DESC').all() as any[];
    const mappedTenants = tenants.map(t => ({
      ...t,
      customCategories: JSON.parse(t.customCategories || '[]')
    }));
    res.json(mappedTenants);
  } catch (error) {
    next(error);
  }
});

// GET: Single tenant details with user count
router.get('/tenants/:id', authenticateToken, requireRole(['superadmin']), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const t = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.params.id) as any;
    if (!t) return res.status(404).json({ error: 'Entreprise introuvable' });
    const userCount = (db.prepare('SELECT COUNT(*) as cnt FROM users WHERE tenantId = ?').get(t.id) as any)?.cnt || 0;
    res.json({ ...t, userCount, customCategories: JSON.parse(t.customCategories || '[]') });
  } catch (error) { next(error); }
});

// POST: Create a new tenant with admin user
router.post('/tenants', authenticateToken, requireRole(['superadmin']), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { name, email, plan, phone, address, city, country, currency } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Nom et email requis' });

    const tenantId = `tenant-${Date.now()}`;
    const userId = genId('user');
    const password = generatePassword();
    const hashed = hashPassword(password);
    const settings = db.prepare('SELECT * FROM global_saas_settings ORDER BY id DESC LIMIT 1').get() as any;
    const trialDays = settings?.trialDays || 14;

    const startDate = now();
    const trialEnd = new Date(Date.now() + trialDays * 86400000).toISOString();

    db.transaction(() => {
      db.prepare(`
        INSERT INTO tenants (id, name, email, phone, address, city, country, currency, plan, subscriptionStatus, subscriptionStartDate, subscriptionEndDate, trialStartDate, trialEndDate, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'TRIAL', ?, ?, ?, ?, ?, ?)
      `).run(tenantId, name, email, phone || null, address || null, city || null, country || null, currency || 'GNF', plan || 'Free', startDate, trialEnd || null, startDate, trialEnd, startDate, startDate);

      db.prepare(`
        INSERT INTO users (id, name, email, password, role, tenantId, active, createdAt)
        VALUES (?, ?, ?, ?, 'owner', ?, 1, ?)
      `).run(userId, name, email, hashed, tenantId, startDate);

      db.prepare(`
        INSERT INTO audit_logs (id, timestamp, userId, userName, action, details, tenantId)
        VALUES (?, ?, ?, ?, 'TENANT_CREATED', ?, ?)
      `).run(genId('aud'), startDate, req.user?.id || null, req.user?.name || null, `Entreprise "${name}" créée avec le plan ${plan || 'Free'} (trial: ${trialDays}j)`, 'superadmin');
    })();

    const created = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);
    res.status(201).json({ tenant: created, adminEmail: email, adminPassword: password });
  } catch (error) { next(error); }
});

// PUT: Update tenant info
router.put('/tenants/:id', authenticateToken, requireRole(['superadmin']), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const t = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.params.id) as any;
    if (!t) return res.status(404).json({ error: 'Entreprise introuvable' });

    const { name, email, phone, address, city, country, currency, description, logo } = req.body;
    db.prepare(`
      UPDATE tenants SET name = COALESCE(?, name), email = COALESCE(?, email), phone = COALESCE(?, phone),
      address = COALESCE(?, address), city = COALESCE(?, city), country = COALESCE(?, country),
      currency = COALESCE(?, currency), description = COALESCE(?, description), logo = COALESCE(?, logo),
      updatedAt = ? WHERE id = ?
    `).run(name || null, email || null, phone || null, address || null, city || null, country || null,
      currency || null, description || null, logo || null, now(), t.id);

    const updated = db.prepare('SELECT * FROM tenants WHERE id = ?').get(t.id);
    res.json(updated);
  } catch (error) { next(error); }
});

// PUT: Change tenant status (suspend, reactivate, block, unblock)
router.put('/tenants/:id/status', authenticateToken, requireRole(['superadmin']), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const t = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.params.id) as any;
    if (!t) return res.status(404).json({ error: 'Entreprise introuvable' });

    const { status } = req.body;
    const valid = ['ACTIVE', 'SUSPENDED', 'BLOCKED', 'EXPIRED', 'TRIAL'];
    if (!valid.includes(status)) return res.status(400).json({ error: `Statut invalide. Utilisez: ${valid.join(', ')}` });

    db.prepare('UPDATE tenants SET subscriptionStatus = ?, updatedAt = ? WHERE id = ?').run(status, now(), t.id);
    const action = status === 'SUSPENDED' ? 'TENANT_SUSPENDED' : status === 'BLOCKED' ? 'TENANT_BLOCKED' : 'TENANT_REACTIVATED';
    db.prepare('INSERT INTO audit_logs (id, timestamp, userId, userName, action, details, tenantId) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(genId('aud'), now(), req.user?.id || null, req.user?.name || null, action, `Statut changé: ${t.subscriptionStatus} → ${status}`, t.id);

    res.json(db.prepare('SELECT * FROM tenants WHERE id = ?').get(t.id));
  } catch (error) { next(error); }
});

// PUT: Change tenant plan
router.put('/tenants/:id/plan', authenticateToken, requireRole(['superadmin']), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const t = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.params.id) as any;
    if (!t) return res.status(404).json({ error: 'Entreprise introuvable' });

    const { plan } = req.body;
    if (!plan) return res.status(400).json({ error: 'Plan requis' });

    const planRow = db.prepare('SELECT * FROM pricing_plans WHERE name = ? AND active = 1').get(plan) as any;
    if (!planRow) return res.status(400).json({ error: 'Plan introuvable ou inactif' });

    db.prepare('UPDATE tenants SET plan = ?, updatedAt = ? WHERE id = ?').run(plan, now(), t.id);
    db.prepare('INSERT INTO audit_logs (id, timestamp, userId, userName, action, details, tenantId) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(genId('aud'), now(), req.user?.id || null, req.user?.name || null, 'PLAN_CHANGED', `Plan changé: ${t.plan} → ${plan}`, t.id);

    res.json(db.prepare('SELECT * FROM tenants WHERE id = ?').get(t.id));
  } catch (error) { next(error); }
});

// PUT: Modify tenant subscription expiry
router.put('/tenants/:id/expiry', authenticateToken, requireRole(['superadmin']), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const t = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.params.id) as any;
    if (!t) return res.status(404).json({ error: 'Entreprise introuvable' });

    const { subscriptionEndDate, subscriptionStartDate } = req.body;
    if (subscriptionEndDate) {
      db.prepare('UPDATE tenants SET subscriptionEndDate = ?, updatedAt = ? WHERE id = ?').run(subscriptionEndDate, now(), t.id);
    }
    if (subscriptionStartDate) {
      db.prepare('UPDATE tenants SET subscriptionStartDate = ?, updatedAt = ? WHERE id = ?').run(subscriptionStartDate, now(), t.id);
    }

    db.prepare('INSERT INTO audit_logs (id, timestamp, userId, userName, action, details, tenantId) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(genId('aud'), now(), req.user?.id || null, req.user?.name || null, 'EXPIRY_MODIFIED',
        subscriptionEndDate ? `Date d'expiration modifiée en ${subscriptionEndDate.split('T')[0]}` : 'Date de début modifiée', t.id);

    res.json(db.prepare('SELECT * FROM tenants WHERE id = ?').get(t.id));
  } catch (error) { next(error); }
});

// POST: Grant trial days
router.post('/tenants/:id/trial', authenticateToken, requireRole(['superadmin']), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const t = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.params.id) as any;
    if (!t) return res.status(404).json({ error: 'Entreprise introuvable' });

    const { days } = req.body;
    if (!days || days <= 0) return res.status(400).json({ error: 'Nombre de jours valide requis' });

    const currentEnd = t.subscriptionEndDate ? new Date(t.subscriptionEndDate) : new Date();
    const newEnd = new Date(currentEnd.getTime() + days * 86400000).toISOString();
    const trialEnd = t.trialEndDate ? new Date(t.trialEndDate.getTime() + days * 86400000).toISOString() : newEnd;

    db.prepare('UPDATE tenants SET trialEndDate = ?, subscriptionEndDate = ?, subscriptionStatus = CASE WHEN subscriptionStatus IN (\'EXPIRED\',\'SUSPENDED\') THEN \'TRIAL\' ELSE subscriptionStatus END, updatedAt = ? WHERE id = ?')
      .run(trialEnd, newEnd, now(), t.id);

    db.prepare('INSERT INTO audit_logs (id, timestamp, userId, userName, action, details, tenantId) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(genId('aud'), now(), req.user?.id || null, req.user?.name || null, 'TRIAL_GRANTED', `${days} jours d'essai gratuits accordés`, t.id);

    res.json(db.prepare('SELECT * FROM tenants WHERE id = ?').get(t.id));
  } catch (error) { next(error); }
});

// GET: Tenant usage stats
router.get('/tenants/:id/stats', authenticateToken, requireRole(['superadmin']), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const t = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.params.id) as any;
    if (!t) return res.status(404).json({ error: 'Entreprise introuvable' });

    const tenantId = t.id;
    const productCount = (db.prepare('SELECT COUNT(*) as cnt FROM products WHERE tenantId = ?').get(tenantId) as any)?.cnt || 0;
    const saleCount = (db.prepare('SELECT COUNT(*) as cnt FROM sales WHERE tenantId = ?').get(tenantId) as any)?.cnt || 0;
    const invoiceCount = (db.prepare('SELECT COUNT(*) as cnt FROM invoices WHERE tenantId = ?').get(tenantId) as any)?.cnt || 0;
    const customerCount = (db.prepare('SELECT COUNT(*) as cnt FROM customers WHERE tenantId = ?').get(tenantId) as any)?.cnt || 0;
    const userCount = (db.prepare('SELECT COUNT(*) as cnt FROM users WHERE tenantId = ? AND active = 1').get(tenantId) as any)?.cnt || 0;
    const totalRevenue = (db.prepare("SELECT COALESCE(SUM(total),0) as rev FROM sales WHERE tenantId = ? AND paymentStatus != 'cancelled'").get(tenantId) as any)?.rev || 0;
    const totalSalesMonth = (db.prepare("SELECT COALESCE(SUM(total),0) as rev FROM sales WHERE tenantId = ? AND paymentStatus != 'cancelled' AND date >= date('now','-30 days')").get(tenantId) as any)?.rev || 0;
    const expenseCount = (db.prepare('SELECT COUNT(*) as cnt FROM expenses WHERE tenantId = ?').get(tenantId) as any)?.cnt || 0;

    res.json({ productCount, saleCount, invoiceCount, customerCount, userCount, totalRevenue, totalSalesMonth, expenseCount });
  } catch (error) { next(error); }
});

// GET: Tenant activity logs
router.get('/tenants/:id/logs', authenticateToken, requireRole(['superadmin']), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const t = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.params.id) as any;
    if (!t) return res.status(404).json({ error: 'Entreprise introuvable' });

    const logs = db.prepare('SELECT * FROM audit_logs WHERE tenantId = ? ORDER BY timestamp DESC LIMIT 100').all(t.id);
    res.json(logs);
  } catch (error) { next(error); }
});

// DELETE: Delete a tenant (with safety checks)
router.delete('/tenants/:id', authenticateToken, requireRole(['superadmin']), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const t = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.params.id) as any;
    if (!t) return res.status(404).json({ error: 'Entreprise introuvable' });

    const userCount = (db.prepare('SELECT COUNT(*) as cnt FROM users WHERE tenantId = ?').get(t.id) as any)?.cnt || 0;
    if (userCount > 0) return res.status(400).json({ error: `Supprimez d'abord les ${userCount} utilisateur(s) de cette entreprise.` });

    db.transaction(() => {
      db.prepare('DELETE FROM tenants WHERE id = ?').run(t.id);
      db.prepare('INSERT INTO audit_logs (id, timestamp, userId, userName, action, details, tenantId) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(genId('aud'), now(), req.user?.id || null, req.user?.name || null, 'TENANT_DELETED', `Entreprise "${t.name}" supprimée`, t.id);
    })();

    res.json({ success: true, message: `Entreprise "${t.name}" supprimée` });
  } catch (error) { next(error); }
});

// PUT: Update active tenant configuration
router.put('/my-tenant', authenticateToken, validate(tenantUpdateSchema), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { name, description, logo, address, phone, currency, taxRate } = req.body;

    db.prepare(`
      UPDATE tenants
      SET name = COALESCE(?, name),
          description = COALESCE(?, description),
          logo = COALESCE(?, logo),
          address = COALESCE(?, address),
          phone = COALESCE(?, phone),
          currency = COALESCE(?, currency),
          taxRate = COALESCE(?, taxRate)
      WHERE id = ?
    `).run(name || null, description || null, logo || null, address || null, phone || null, currency || null, taxRate !== undefined ? taxRate : null, tenantId);

    const updated = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// PUT: Admin update tenant subscription directly (Requires superadmin)
router.put('/tenants/:id/subscription', authenticateToken, requireRole(['superadmin']), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { id } = req.params;
    const { plan, subscriptionStatus, subscriptionStartDate, subscriptionEndDate } = req.body;

    db.prepare(`
      UPDATE tenants
      SET plan = ?, subscriptionStatus = ?, subscriptionStartDate = ?, subscriptionEndDate = ?
      WHERE id = ?
    `).run(plan, subscriptionStatus, subscriptionStartDate || null, subscriptionEndDate || null, id);

    const updated = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id);
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// GET: List subscription payments (Superadmin sees all, tenant sees theirs)
router.get('/payments', authenticateToken, (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { id, role, tenantId } = req.user!;
    let payments;

    if (role === 'superadmin') {
      payments = db.prepare('SELECT * FROM subscription_payments ORDER BY date DESC').all();
    } else {
      payments = db.prepare('SELECT * FROM subscription_payments WHERE tenantId = ? ORDER BY date DESC').all(tenantId);
    }

    res.json(payments);
  } catch (error) {
    next(error);
  }
});

// POST: Submit a subscription payment declaration
router.post('/payments', authenticateToken, (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { planId, planName, amount, currency, paymentMethod, reference, transactionNumber, comment, receiptImage } = req.body;
    const id = `pm-${Date.now()}`;
    const date = new Date().toISOString().split('T')[0];
    const timestamp = new Date().toISOString();

    const activeTenant = db.prepare('SELECT name FROM tenants WHERE id = ?').get(tenantId) as { name: string };

    db.transaction(() => {
      // 1. Insert payment record
      db.prepare(`
        INSERT INTO subscription_payments (id, tenantId, tenantName, planId, planName, amount, currency, paymentMethod, reference, transactionNumber, date, comment, receiptImage, status, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        tenantId,
        activeTenant.name,
        planId,
        planName,
        amount,
        currency || 'EUR',
        paymentMethod,
        reference,
        transactionNumber,
        date,
        comment || null,
        receiptImage || null,
        'PENDING',
        timestamp,
        timestamp
      );

      // 2. Set tenant subscription state to PENDING manually
      db.prepare(`
        UPDATE tenants
        SET subscriptionStatus = 'PENDING', subscriptionPlanId = ?
        WHERE id = ?
      `).run(planId, tenantId);

      // 3. Log audit
      const auditId = `aud-${Math.floor(Math.random() * 9000000 + 1000000)}`;
      db.prepare(`
        INSERT INTO audit_logs (id, timestamp, userId, userName, action, details, tenantId)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        auditId,
        timestamp,
        req.user!.id,
        req.user!.name,
        'ABONNEMENT_DECLARE',
        `Déclaration de paiement pour le plan ${planName} (${amount} EUR) par ${paymentMethod}`,
        tenantId
      );
    })();

    const created = db.prepare('SELECT * FROM subscription_payments WHERE id = ?').get(id);
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

// PUT: Audit offline payment status (Requires superadmin)
router.put('/payments/:id/audit', authenticateToken, requireRole(['superadmin']), (req: AuthenticatedRequest, res: Response, next) => {
  try {
    const { id } = req.params;
    const { status, adminComment } = req.body; // 'APPROVED' or 'REJECTED'
    const timestamp = new Date().toISOString();

    const payment = db.prepare('SELECT * FROM subscription_payments WHERE id = ?').get(id) as any;
    if (!payment) {
      return res.status(404).json({ error: 'Déclaration de paiement introuvable.' });
    }

    db.transaction(() => {
      // Update Payment Status
      db.prepare(`
        UPDATE subscription_payments
        SET status = ?, adminComment = ?, updatedAt = ?
        WHERE id = ?
      `).run(status, adminComment || null, timestamp, id);

      if (status === 'APPROVED') {
        const startDate = new Date().toISOString();
        const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 Days duration

        // Update Tenant Subscription plan to ACTIVE
        db.prepare(`
          UPDATE tenants
          SET plan = ?, subscriptionStatus = 'ACTIVE', subscriptionStartDate = ?, subscriptionEndDate = ?, subscriptionPlanId = ?
          WHERE id = ?
        `).run(payment.planName, startDate, endDate, payment.planId, payment.tenantId);

        // Record invoice
        const invId = `inv-${Date.now()}`;
        db.prepare(`
          INSERT INTO subscription_invoices (id, invoiceNumber, date, amount, plan, status, tenantId)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(invId, `INV-${Date.now()}`, startDate.split('T')[0], payment.amount, payment.planName, 'paye', payment.tenantId);
      } else if (status === 'REJECTED') {
        // Revert tenant subscription back to expired/trial based on plan
        db.prepare(`
          UPDATE tenants
          SET subscriptionStatus = 'EXPIRED'
          WHERE id = ?
        `).run(payment.tenantId);
      }
    })();

    const updatedPayment = db.prepare('SELECT * FROM subscription_payments WHERE id = ?').get(id);
    res.json(updatedPayment);
  } catch (error) {
    next(error);
  }
});

export default router;
