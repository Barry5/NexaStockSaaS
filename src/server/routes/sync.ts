import { Router, Response } from 'express';
import db from '../database/db.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { requireRole } from '../middleware/auth.js';
import { hashPassword } from '../services/auth.js';
import { getAdminClient } from '../services/supabase/supabaseService.js';
import { syncService } from '../sync/syncService.js';
import { syncEngine } from '../sync/syncEngine.js';
import { supabaseWorker } from '../sync/supabaseWorker.js';
import { SYNC_TABLES } from '../sync/syncTables.js';

const router = Router();

// Helper: Compile complete DBState from SQLite
export function compileCompleteState(): any {
  // 1. Tenants
  const tenants = db.prepare('SELECT * FROM tenants').all() as any[];
  const formattedTenants = tenants.map(t => ({
    ...t,
    customCategories: JSON.parse(t.customCategories || '[]')
  }));

  // 2. Users
  const users = db.prepare('SELECT id, name, email, role, tenantId, active, avatar, password, firstLoginReset FROM users').all() as any[];
  const formattedUsers = users.map(u => ({
    ...u,
    active: !!u.active,
    firstLoginReset: !!u.firstLoginReset
  }));

  // 3. Products
  const products = db.prepare('SELECT * FROM products').all() as any[];
  const formattedProducts = products.map(p => {
    const variants = db.prepare('SELECT * FROM product_variants WHERE productId = ?').all(p.id);
    return {
      ...p,
      variants
    };
  });

  // 4. Customers
  const customers = db.prepare('SELECT * FROM customers').all();

  // 5. Suppliers
  const suppliers = db.prepare('SELECT * FROM suppliers').all();

  // 6. Expenses
  const expenses = db.prepare('SELECT * FROM expenses').all();

  // 7. Loans
  const loans = db.prepare('SELECT * FROM loans').all() as any[];
  const formattedLoans = loans.map(l => {
    const repayments = db.prepare('SELECT * FROM repayments WHERE loanId = ?').all(l.id);
    const installments = db.prepare('SELECT * FROM loan_installments WHERE loanId = ?').all(l.id);
    return {
      ...l,
      repayments,
      installments
    };
  });

  // 8. Sales
  const sales = db.prepare('SELECT * FROM sales').all() as any[];
  const formattedSales = sales.map(s => {
    const items = db.prepare('SELECT * FROM sale_items WHERE saleId = ?').all(s.id) as any[];
    return {
      ...s,
      items: items.map(it => ({
        ...it,
        qtyDelivered: it.qtyDelivered !== null && it.qtyDelivered !== undefined ? it.qtyDelivered : it.quantity,
        qtyRemaining: Math.max(0, it.quantity - (it.qtyDelivered !== null && it.qtyDelivered !== undefined ? it.qtyDelivered : it.quantity)),
        qtyReturned: it.qtyReturned || 0
      })),
      payments: JSON.parse(s.payments || '[]'),
      returns: JSON.parse(s.returns || '[]'),
      creditComments: JSON.parse(s.creditComments || '[]')
    };
  });

  // 9. Warehouses & Transfers
  const warehouses = db.prepare('SELECT * FROM warehouses').all();
  const transfers = db.prepare('SELECT * FROM stock_transfers').all();

  // 10. Audit Logs
  const auditLogs = db.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC').all();

  // 11. Invoices
  const subscriptionInvoices = db.prepare('SELECT * FROM subscription_invoices').all();

  // 12. Variants
  const variants = db.prepare('SELECT * FROM product_variants').all();

  // 13. Pricing Plans
  const plans = db.prepare('SELECT * FROM pricing_plans ORDER BY displayOrder ASC').all() as any[];
  const formattedPlans = plans.map(p => ({
    ...p,
    features: JSON.parse(p.features || '[]'),
    limits: JSON.parse(p.limits || '{}'),
    active: !!p.active
  }));

  // 14. Payments
  const subscriptionPayments = db.prepare('SELECT * FROM subscription_payments ORDER BY date DESC').all();

  // 15. Settings
  const settings = db.prepare('SELECT * FROM global_saas_settings WHERE id = 1').get() as any;
  const formattedSettings = settings ? {
    ...settings,
    automaticActivation: !!settings.automaticActivation
  } : null;

  // 16. Invoices (new ERP module)
  const invoices = db.prepare('SELECT * FROM invoices ORDER BY date DESC').all() as any[];
  const formattedInvoices = invoices.map(inv => {
    const items = db.prepare('SELECT * FROM invoice_items WHERE invoiceId = ?').all(inv.id);
    return { ...inv, items };
  });

  // 17. Delivery Orders
  const deliveryOrders = db.prepare('SELECT * FROM delivery_orders ORDER BY createdAt DESC').all() as any[];
  const formattedDOs = deliveryOrders.map(do_ => {
    const items = db.prepare('SELECT * FROM delivery_order_items WHERE deliveryOrderId = ?').all(do_.id);
    return { ...do_, items };
  });

  // 18. Payments
  const payments = db.prepare('SELECT * FROM payments ORDER BY date DESC').all();

  // 19. Returns
  const returns = db.prepare('SELECT * FROM returns ORDER BY createdAt DESC').all() as any[];
  const formattedReturns = returns.map(r => {
    const items = db.prepare('SELECT * FROM return_items WHERE returnId = ?').all(r.id);
    return { ...r, items };
  });

  // 20. Invoice Audit Logs
  const invoiceAuditLogs = db.prepare('SELECT * FROM invoice_audit_log ORDER BY timestamp DESC').all();

  // 21. Affiliates
  const affiliates = db.prepare('SELECT * FROM affiliates ORDER BY createdAt DESC').all();

  // 22. Commission Rules
  const commissionRules = db.prepare('SELECT * FROM commission_rules ORDER BY priority ASC').all();

  // 23. Commission Ledger
  const commissionLedger = db.prepare('SELECT * FROM commission_ledger ORDER BY createdAt DESC').all();

  // 24. Commission Payments
  const commissionPayments = db.prepare('SELECT * FROM commission_payments ORDER BY createdAt DESC').all();

  // 25. Commission Audit
  const commissionAudit = db.prepare('SELECT * FROM commission_audit ORDER BY createdAt DESC').all();

  return {
    tenants: formattedTenants,
    users: formattedUsers,
    products: formattedProducts,
    sales: formattedSales,
    customers,
    suppliers,
    expenses,
    loans: formattedLoans,
    warehouses,
    transfers,
    auditLogs,
    subscriptionInvoices,
    variants,
    saasCurrency: formattedPlans[0]?.currency || formattedTenants[0]?.currency || 'EUR',
    pricingPlans: formattedPlans,
    subscriptionPayments,
    globalSaaSSettings: formattedSettings,
    invoices: formattedInvoices,
    deliveryOrders: formattedDOs,
    payments,
    returns: formattedReturns,
    invoiceAuditLogs,
    affiliates,
    commissionRules,
    commissionLedger,
    commissionPayments,
    commissionAudit
  };
}



// GET /api/sync/changes?since=ISO_TIMESTAMP - Delta sync endpoint
router.get('/changes', (req, res, next) => {
  try {
    const since = req.query.since as string;
    if (!since) return res.status(400).json({ error: 'Paramètre since requis (ISO timestamp).' });

    const changes: Record<string, any[]> = {};
    for (const table of SYNC_TABLES) {
      const tableInfo = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      const hasUpdatedAt = tableInfo.some(c => c.name === 'updated_at');
      const hasCreatedAt = tableInfo.some(c => c.name === 'created_at');

      if (hasUpdatedAt) {
        changes[table] = db.prepare(`SELECT * FROM ${table} WHERE updated_at >= ?`).all(since) as any[];
      } else if (hasCreatedAt) {
        changes[table] = db.prepare(`SELECT * FROM ${table} WHERE created_at >= ?`).all(since) as any[];
      } else {
        changes[table] = [];
      }
    }

    const deleted = db.prepare(`
      SELECT table_name, record_id, created_at FROM sync_queue
      WHERE operation = 'DELETE' AND created_at >= ? AND status = 'completed'
    `).all(since) as any[];

    res.json({ changes, deleted, since, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

// POST /api/sync/full-push: Push all local data to Supabase
router.post('/full-push', authenticateToken, requireRole(['superadmin']), async (req, res, next) => {
  try {
    const result = await syncService.fullPush();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/sync/reset-from-cloud: Clear local SQLite and pull all from Supabase
router.post('/reset-from-cloud', authenticateToken, requireRole(['superadmin']), async (req, res, next) => {
  try {
    const result = await syncService.fullPull();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/sync/reset-app?key=nexastock-reset-2026
// ONE-CLICK reset — clear local + pull from Supabase
// Paste this URL in the browser address bar (no console, no auth header needed)
const RESET_KEY = process.env.RESET_KEY || 'nexastock-reset-2026';
router.get('/reset-app', (req, res) => {
  try {
    const key = req.query.key as string;
    if (key !== RESET_KEY) {
      return res.status(403).json({ error: 'Clé de réinitialisation invalide. Utilisez ?key=nexastock-reset-2026' });
    }

    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'sync_%'`).all() as { name: string }[];
    for (const { name } of tables) db.prepare(`DELETE FROM ${name}`).run();

    const resultPromise = syncService.fullPull().then(pullResult => {
      res.json({
        success: true,
        tablesCleared: tables.length,
        pulled: pullResult.pulled,
        errors: pullResult.errors.length > 0 ? pullResult.errors : undefined,
        message: `SQLite vidé (${tables.length} tables), ${pullResult.pulled} enregistrements importés depuis Supabase`
      });
    });

    resultPromise.catch((err: any) => {
      res.status(500).json({ error: err.message });
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/sync/clear-local: Clear all local SQLite data (no Supabase dependency)
router.post('/clear-local', authenticateToken, requireRole(['superadmin']), (req, res) => {
  try {
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'sync_%'`).all() as { name: string }[];
    let cleared = 0;
    for (const { name } of tables) {
      db.prepare(`DELETE FROM ${name}`).run();
      cleared++;
    }
    res.json({ success: true, tablesCleared: cleared });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/sync/status: Get sync service + worker status
router.get('/status', authenticateToken, requireRole(['superadmin']), (req, res) => {
  res.json({
    ...syncService.getStatus(),
    worker: supabaseWorker.getStatus(),
  });
});

// GET /api/sync/failed: List failed sync queue items with their errors (superadmin debug)
router.get('/failed', authenticateToken, requireRole(['superadmin']), (req, res) => {
  const items = db.prepare(`
    SELECT id, table_name, record_id, operation, retry_count, max_retries, status, last_error, created_at, device_id, company_id
    FROM sync_queue
    WHERE status = 'failed'
    ORDER BY created_at ASC
    LIMIT 200
  `).all() as any[];
  res.json({ count: items.length, items });
});

// Tables métier à vider (ordre enfants -> parents pour respecter les FK).
// Sont CONSERVÉS : superadmin, roles/permissions/role_permissions/user_roles,
// pricing_plans, global_saas_settings, module_definitions, plan_modules.
const WIPE_TABLES = [
  'sale_affiliates', 'sale_commission_items', 'sale_items', 'return_items',
  'delivery_order_items', 'invoice_items', 'invoice_audit_log',
  'commission_ledger', 'commission_payments', 'commission_audit',
  'repayments', 'loan_installments', 'product_variants', 'delivery_note_audit',
  'audit_logs', 'returns', 'delivery_orders', 'invoices', 'payments',
  'sales', 'expenses', 'loans', 'customers', 'suppliers', 'products',
  'warehouses', 'stock_transfers', 'affiliates', 'commission_rules',
  'subscription_payments', 'subscription_invoices', 'tenant_modules',
  'gdrive_tokens', 'users', 'tenants',
];

const WIPE_SYNC_TABLES = ['sync_queue', 'sync_changelog', 'sync_deletions', 'sync_tracking', 'sync_uuid_map'];

function wipeSupabaseData(): Promise<{ tables: number; errors: string[] }> {
  const admin = getAdminClient();
  const errors: string[] = [];
  let tables = 0;

  return WIPE_TABLES.reduce<Promise<number>>(async (acc, table) => {
    const count = await acc;
    try {
      // gdrive_tokens n'a pas de legacy_id
      const column = table === 'gdrive_tokens' ? 'tenant_id' : 'legacy_id';
      const { error } = await admin.from(table).delete().neq(column, '__never__');
      if (error) errors.push(`${table}: ${error.message}`);
      else tables = count + 1;
    } catch (e: any) {
      errors.push(`${table}: ${e.message}`);
    }
    return tables;
  }, Promise.resolve(0)).then(() => ({ tables, errors }));
}

// Vide les tables métier SQLite + la file de sync, conserve le seed système.
export function wipeLocalData(): { tablesCleared: number } {
  let tablesCleared = 0;
  db.transaction(() => {
    for (const table of WIPE_TABLES) {
      if (table === 'users') {
        db.prepare(`DELETE FROM users WHERE id != 'u-1'`).run();
      } else {
        db.prepare(`DELETE FROM ${table}`).run();
      }
      tablesCleared++;
    }
    for (const table of WIPE_SYNC_TABLES) {
      try { db.prepare(`DELETE FROM ${table}`).run(); } catch { /* table absente */ }
    }
  })();
  return { tablesCleared };
}

// POST /api/sync/wipe-all: Supprime TOUTES les données métier (SQLite + Supabase).
// Ne conserve que : superadmin, rôles/permissions, forfaits, paramètres, modules.
router.post('/wipe-all', authenticateToken, requireRole(['superadmin']), async (req, res, next) => {
  try {
    const confirm = req.body?.confirm as string;
    if (confirm !== 'WIPE-ALL') {
      return res.status(400).json({ error: 'Confirmation requise: { confirm: "WIPE-ALL" }' });
    }

    // 1. Vider Supabase (données métier uniquement)
    const remote = await wipeSupabaseData();

    // 2. Vider SQLite (données métier + file de sync), garder le seed système
    const local = wipeLocalData();

    // 3. Repousser le seed système (superadmin, forfaits, paramètres, modules, RBAC)
    const push = await syncService.fullPush();

    res.json({
      success: true,
      message: 'Toutes les données métier ont été supprimées (Supabase + SQLite). Conserve: superadmin, rôles, forfaits, paramètres, modules.',
      remote: { tablesCleared: remote.tables, errors: remote.errors.length ? remote.errors : undefined },
      local: { tablesCleared: local.tablesCleared },
      seedPush: { pushed: push.pushed, failed: push.failed, errors: push.errors.length ? push.errors : undefined },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/sync/trigger: Manually trigger a sync cycle (push + pull)
router.post('/trigger', authenticateToken, requireRole(['superadmin']), async (req, res, next) => {
  try {
    const upResult = await syncService.syncUp();
    const changelogResult = await syncService.syncUpFromChangelog();
    const downResult = await syncService.syncDown();
    res.json({
      syncQueue: upResult,
      changelog: changelogResult,
      pull: downResult,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// GET: Compile and return full DB state
router.get('/', (req, res, next) => {
  try {
    const state = compileCompleteState();
    res.json(state);
  } catch (error) {
    next(error);
  }
});

// GET /api/sync/pull?since=ISO_TIMESTAMP - Incremental pull (changes + deletions)
router.get('/pull', (req, res, next) => {
  try {
    const since = req.query.since as string;
    if (!since) return res.status(400).json({ error: 'Paramètre since requis (ISO timestamp).' });
    const tableName = req.query.table as string | undefined;
    const result = syncEngine.pullChanges(since, tableName);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/sync/push - Incremental push with conflict resolution
router.post('/push', authenticateToken, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { changes } = req.body;
    if (!changes || !Array.isArray(changes)) {
      return res.status(400).json({ error: 'Format invalide. Attendu: { changes: [...] }' });
    }

    const tenantId = req.user?.tenantId;
    const deviceId = req.headers['x-device-id'] as string || 'server';

    const result = syncEngine.pushChanges(changes.map((c: any) => ({
      table: c.table,
      recordId: c.recordId,
      operation: c.operation,
      data: c.data || {},
      version: c.version,
      deviceId,
      companyId: tenantId,
    })));

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST: Sync incoming client state back into SQLite (with smart merges and upserts)
router.post('/', authenticateToken, async (req: AuthenticatedRequest, res, next) => {
  try {
    const clientState = req.body;
    if (!clientState || typeof clientState !== 'object') {
      return res.status(400).json({ error: 'État client invalide.' });
    }

    // Hash any plaintext passwords before storing (bcrypt required for login)
    if (clientState.users && Array.isArray(clientState.users)) {
      for (const u of clientState.users) {
        if (u.password && !u.password.startsWith('$2')) {
          u.password = await hashPassword(u.password);
        }
      }
    }

    db.transaction(() => {
      // 1. Sync Tenants
      if (clientState.tenants && Array.isArray(clientState.tenants)) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO tenants (
            id, name, description, plan, logo, address, phone, currency, taxRate, customCategories, createdAt,
            subscriptionPlanId, subscriptionStatus, subscriptionStartDate, subscriptionEndDate, subscriptionRenewalDate,
            trialStartDate, trialEndDate, gracePeriodEndDate, lastReminderSentDate, trialDaysConfigured,
            invoicePrefix, invoiceFooterMsg, invoiceSubFooterMsg, defaultExtraFeeLabel
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const t of clientState.tenants) {
          stmt.run(
            t.id, t.name, t.description || null, t.plan, t.logo || null, t.address || null, t.phone || null, t.currency || 'EUR',
            t.taxRate !== undefined ? t.taxRate : 20.0, JSON.stringify(t.customCategories || []), t.createdAt,
            t.subscriptionPlanId || null, t.subscriptionStatus || 'TRIAL', t.subscriptionStartDate || null,
            t.subscriptionEndDate || null, t.subscriptionRenewalDate || null, t.trialStartDate || null, t.trialEndDate || null,
            t.gracePeriodEndDate || null, t.lastReminderSentDate || null, t.trialDaysConfigured || 14,
            t.invoicePrefix !== undefined ? t.invoicePrefix : 'FAC-',
            t.invoiceFooterMsg !== undefined ? t.invoiceFooterMsg : 'MERCI DE VOTRE CONFIANCE !',
            t.invoiceSubFooterMsg !== undefined ? t.invoiceSubFooterMsg : 'NexaStock ERP Multi-tenant - Document officiel au format PDF',
            t.defaultExtraFeeLabel !== undefined ? t.defaultExtraFeeLabel : 'Frais de transport'
          );
        }
      }

      // 2. Sync Users
      if (clientState.users && Array.isArray(clientState.users)) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO users (id, name, email, role, tenantId, active, avatar, password, firstLoginReset)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const u of clientState.users) {
          stmt.run(
            u.id, u.name, u.email, u.role, u.tenantId, u.active ? 1 : 0, u.avatar || null, u.password || null, u.firstLoginReset ? 1 : 0
          );
        }
      }

      // 3. Sync Products
      if (clientState.products && Array.isArray(clientState.products)) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO products (id, name, sku, barcode, description, category, buyPrice, sellPrice, minPrice, quantity, alertThreshold, image, tenantId, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const p of clientState.products) {
          stmt.run(
            p.id, p.name, p.sku, p.barcode || null, p.description || null, p.category, p.buyPrice, p.sellPrice, p.minPrice || 0, p.quantity, p.alertThreshold, p.image || null, p.tenantId, p.createdAt
          );

          // Clear and sync product variants if embedded
          if (p.variants && Array.isArray(p.variants)) {
            db.prepare('DELETE FROM product_variants WHERE productId = ?').run(p.id);
            const varStmt = db.prepare(`
              INSERT OR REPLACE INTO product_variants (id, productId, name, sku, quantity, priceDelta)
              VALUES (?, ?, ?, ?, ?, ?)
            `);
            for (const v of p.variants) {
              varStmt.run(v.id, p.id, v.name, v.sku, v.quantity || 0, v.priceDelta || 0.0);
            }
          }
        }
      }

      // 4. Sync Customers
      if (clientState.customers && Array.isArray(clientState.customers)) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO customers (id, name, email, phone, loyaltyPoints, outstandingDebt, tenantId, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const c of clientState.customers) {
          stmt.run(
            c.id, c.name, c.email || null, c.phone || null, c.loyaltyPoints || 0, c.outstandingDebt || 0.0, c.tenantId, c.createdAt
          );
        }
      }

      // 5. Sync Suppliers
      if (clientState.suppliers && Array.isArray(clientState.suppliers)) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO suppliers (id, name, contactName, phone, email, tenantId, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const s of clientState.suppliers) {
          stmt.run(
            s.id, s.name, s.contactName || null, s.phone || null, s.email || null, s.tenantId, s.createdAt
          );
        }
      }

      // 6. Sync Expenses
      if (clientState.expenses && Array.isArray(clientState.expenses)) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO expenses (id, title, amount, category, date, description, recipient, paymentMethod, status, attachment, tenantId)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const e of clientState.expenses) {
          stmt.run(
            e.id, e.title, e.amount, e.category, e.date, e.description || null, e.recipient || null, e.paymentMethod, e.status, e.attachment || null, e.tenantId
          );
        }
      }

      // 7. Sync Loans
      if (clientState.loans && Array.isArray(clientState.loans)) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO loans (id, type, partnerName, amount, date, description, remainingBalance, status, tenantId)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const l of clientState.loans) {
          stmt.run(
            l.id, l.type, l.partnerName, l.amount, l.date, l.description || null, l.remainingBalance, l.status, l.tenantId
          );

          // Clear and sync repayments
          if (l.repayments && Array.isArray(l.repayments)) {
            db.prepare('DELETE FROM repayments WHERE loanId = ?').run(l.id);
            const repStmt = db.prepare(`
              INSERT OR REPLACE INTO repayments (id, loanId, amount, date, note)
              VALUES (?, ?, ?, ?, ?)
            `);
            for (const r of l.repayments) {
              repStmt.run(r.id, l.id, r.amount, r.date, r.note || null);
            }
          }

          // Clear and sync installments
          if (l.installments && Array.isArray(l.installments)) {
            db.prepare('DELETE FROM loan_installments WHERE loanId = ?').run(l.id);
            const instStmt = db.prepare(`
              INSERT OR REPLACE INTO loan_installments (id, loanId, dueDate, amount, status, paidDate, note)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            for (const inst of l.installments) {
              instStmt.run(inst.id, l.id, inst.dueDate, inst.amount, inst.status, inst.paidDate || null, inst.note || null);
            }
          }
        }
      }

      // 8. Sync Sales
      if (clientState.sales && Array.isArray(clientState.sales)) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO sales (
            id, invoiceNumber, date, subtotal, tax, taxRate, discount, total, paymentMethod, customerId, customerName, tenantId, employeeId, employeeName,
            status, creditDueDate, creditPaidAmount, creditInstallments, extraFees, deliveryFee, taxStamp, changeReturned, saleType, isReturned,
            customFeeLabel, deliveryStatus, abandonReason,
            invoiceStatus, paymentStatus, creditStatus, payments, returns, creditComments, creditRelances
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const s of clientState.sales) {
          stmt.run(
            s.id, s.invoiceNumber, s.date, s.subtotal, s.tax, s.taxRate !== undefined ? s.taxRate : 20.0, s.discount || 0, s.total, s.paymentMethod, s.customerId || null, s.customerName || null, s.tenantId, s.employeeId, s.employeeName,
            s.status || 'Payée', s.creditDueDate || null, s.creditPaidAmount || 0, s.creditInstallments || null, s.extraFees || 0, s.deliveryFee || 0, s.taxStamp || 0, s.changeReturned || 0, s.saleType || 'standard', s.isReturned ? 1 : 0,
            s.customFeeLabel || null, s.deliveryStatus || 'livré', s.abandonReason || null,
            s.invoiceStatus || 'Validée', s.paymentStatus || 'Payé', s.creditStatus || 'Pas de crédit',
            JSON.stringify(s.payments || []), JSON.stringify(s.returns || []), JSON.stringify(s.creditComments || []), s.creditRelances || 0
          );

          // Clear and sync items
          if (s.items && Array.isArray(s.items)) {
            db.prepare('DELETE FROM sale_items WHERE saleId = ?').run(s.id);
            const itemStmt = db.prepare(`
              INSERT OR REPLACE INTO sale_items (id, saleId, productId, productName, quantity, price, total, qtyDelivered, qtyReturned, commissionPerUnit, totalCommission)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            s.items.forEach((item, idx) => {
              itemStmt.run(
                `${s.id}-item-${idx}`,
                s.id,
                item.productId || null,
                item.productName,
                item.quantity,
                item.price,
                item.total,
                item.qtyDelivered !== undefined && item.qtyDelivered !== null ? item.qtyDelivered : item.quantity,
                item.qtyReturned || 0,
                item.commissionPerUnit || 0,
                item.totalCommission || 0
              );
            });
          }
        }
      }

      // 9. Sync Warehouses
      if (clientState.warehouses && Array.isArray(clientState.warehouses)) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO warehouses (id, name, location, tenantId)
          VALUES (?, ?, ?, ?)
        `);
        for (const w of clientState.warehouses) {
          stmt.run(w.id, w.name, w.location || null, w.tenantId);
        }
      }

      // 10. Sync Stock Transfers
      if (clientState.transfers && Array.isArray(clientState.transfers)) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO stock_transfers (id, productId, productName, fromWarehouseId, toWarehouseId, quantity, date, status, tenantId)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const tr of clientState.transfers) {
          stmt.run(tr.id, tr.productId, tr.productName, tr.fromWarehouseId, tr.toWarehouseId, tr.quantity, tr.date, tr.status, tr.tenantId);
        }
      }

      // 11. Sync Audit Logs
      if (clientState.auditLogs && Array.isArray(clientState.auditLogs)) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO audit_logs (id, timestamp, userId, userName, action, details, ipAddress, tenantId)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const log of clientState.auditLogs) {
          stmt.run(log.id, log.timestamp, log.userId, log.userName, log.action, log.details || null, log.ipAddress || null, log.tenantId);
        }
      }

      // 12. Sync Invoices
      if (clientState.subscriptionInvoices && Array.isArray(clientState.subscriptionInvoices)) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO subscription_invoices (id, invoiceNumber, date, amount, plan, status, tenantId)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const inv of clientState.subscriptionInvoices) {
          stmt.run(inv.id, inv.invoiceNumber, inv.date, inv.amount, inv.plan, inv.status, inv.tenantId);
        }
      }

      // 13. Sync Subscription Payments
      if (clientState.subscriptionPayments && Array.isArray(clientState.subscriptionPayments)) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO subscription_payments (id, tenantId, tenantName, planId, planName, amount, currency, paymentMethod, reference, transactionNumber, date, comment, receiptImage, status, adminComment, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const pm of clientState.subscriptionPayments) {
          stmt.run(
            pm.id, pm.tenantId, pm.tenantName, pm.planId, pm.planName, pm.amount, pm.currency || 'EUR', pm.paymentMethod,
            pm.reference, pm.transactionNumber, pm.date, pm.comment || null, pm.receiptImage || null, pm.status || 'PENDING',
            pm.adminComment || null, pm.createdAt, pm.updatedAt
          );
        }
      }

      // 14. Sync Global Settings
      if (clientState.globalSaaSSettings) {
        const gs = clientState.globalSaaSSettings;
        db.prepare(`
          INSERT OR REPLACE INTO global_saas_settings (id, trialDays, gracePeriodDays, revertToPlanOnExpiry, orangeMoneyNumber, orangeMoneyName, mobileMoneyNumber, mobileMoneyName, bankDetails, paymentInstructions, automaticActivation)
          VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          gs.trialDays, gs.gracePeriodDays, gs.revertToPlanOnExpiry, gs.orangeMoneyNumber || null, gs.orangeMoneyName || null,
          gs.mobileMoneyNumber || null, gs.mobileMoneyName || null, gs.bankDetails || null, gs.paymentInstructions || null,
          gs.automaticActivation ? 1 : 0
        );
      }

      // 15. Sync Invoices (new ERP module)
      if (clientState.invoices && Array.isArray(clientState.invoices)) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO invoices (id, invoiceNumber, type, date, dueDate, customerId, customerName, customerPhone, customerEmail, customerAddress, subtotal, taxRate, tax, discount, discountType, shipping, total, paidAmount, status, deliveryStatus, paymentStatus, notes, termsConditions, tenantId, employeeId, employeeName, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const inv of clientState.invoices) {
          stmt.run(
            inv.id, inv.invoiceNumber, inv.type || 'sale', inv.date, inv.dueDate || null,
            inv.customerId || null, inv.customerName || null, inv.customerPhone || null, inv.customerEmail || null, inv.customerAddress || null,
            inv.subtotal, inv.taxRate || 0, inv.tax || 0, inv.discount || 0, inv.discountType || 'percentage', inv.shipping || 0,
            inv.total, inv.paidAmount || 0, inv.status || 'draft', inv.deliveryStatus || 'not_delivered', inv.paymentStatus || 'unpaid',
            inv.notes || null, inv.termsConditions || null, inv.tenantId, inv.employeeId || null, inv.employeeName || null, inv.createdAt, inv.updatedAt || inv.createdAt
          );
          if (inv.items && Array.isArray(inv.items)) {
            db.prepare('DELETE FROM invoice_items WHERE invoiceId = ?').run(inv.id);
            const itemStmt = db.prepare(`
              INSERT OR REPLACE INTO invoice_items (id, invoiceId, productId, productName, productSku, quantity, price, total, qtyDelivered, qtyReturned)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            for (const item of inv.items) {
              itemStmt.run(item.id, inv.id, item.productId || null, item.productName, item.productSku || null, item.quantity, item.price, item.total, item.qtyDelivered || 0, item.qtyReturned || 0);
            }
          }
        }
      }

      // 16. Sync Delivery Orders
      if (clientState.deliveryOrders && Array.isArray(clientState.deliveryOrders)) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO delivery_orders (id, deliveryNumber, invoiceId, date, status, notes, createdBy, createdByName, tenantId, createdAt, validatedAt, cancelledAt, driverName, vehicleInfo, warehouseOrigin, deliveryAddress, deliveryPhone, deliveryDate, deliveryTime)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const do_ of clientState.deliveryOrders) {
          stmt.run(do_.id, do_.deliveryNumber, do_.invoiceId || null, do_.date, do_.status || 'draft', do_.notes || null, do_.createdBy || null, do_.createdByName || null, do_.tenantId, do_.createdAt, do_.validatedAt || null, do_.cancelledAt || null, do_.driverName || null, do_.vehicleInfo || null, do_.warehouseOrigin || null, do_.deliveryAddress || null, do_.deliveryPhone || null, do_.deliveryDate || null, do_.deliveryTime || null);
          if (do_.items && Array.isArray(do_.items)) {
            db.prepare('DELETE FROM delivery_order_items WHERE deliveryOrderId = ?').run(do_.id);
            const itemStmt = db.prepare(`
              INSERT OR REPLACE INTO delivery_order_items (id, deliveryOrderId, invoiceItemId, productId, productName, productSku, quantity, price, total)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            for (const item of do_.items) {
              itemStmt.run(item.id, do_.id, item.invoiceItemId, item.productId || null, item.productName, item.productSku || null, item.quantity, item.price, item.total);
            }
          }
        }
      }

      // 17. Sync Payments
      if (clientState.payments && Array.isArray(clientState.payments)) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO payments (id, invoiceId, date, amount, method, reference, notes, tenantId, createdBy, createdByName, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const p of clientState.payments) {
          stmt.run(p.id, p.invoiceId, p.date, p.amount, p.method, p.reference || null, p.notes || null, p.tenantId, p.createdBy || null, p.createdByName || null, p.createdAt);
        }
      }

      // 18. Sync Returns
      if (clientState.returns && Array.isArray(clientState.returns)) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO returns (id, returnNumber, invoiceId, date, status, reason, tenantId, createdBy, createdByName, createdAt, validatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const r of clientState.returns) {
          stmt.run(r.id, r.returnNumber, r.invoiceId, r.date, r.status || 'draft', r.reason || null, r.tenantId, r.createdBy || null, r.createdByName || null, r.createdAt, r.validatedAt || null);
          if (r.items && Array.isArray(r.items)) {
            db.prepare('DELETE FROM return_items WHERE returnId = ?').run(r.id);
            const itemStmt = db.prepare(`
              INSERT OR REPLACE INTO return_items (id, returnId, invoiceItemId, productId, productName, quantity, price, total, reason)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            for (const item of r.items) {
              itemStmt.run(item.id, r.id, item.invoiceItemId, item.productId || null, item.productName, item.quantity, item.price, item.total, item.reason || null);
            }
          }
        }
      }

      // 19. Sync Affiliates
      if (clientState.affiliates && Array.isArray(clientState.affiliates)) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO affiliates (id, code, firstName, lastName, photo, phone, email, address, city, country, company, idNumber, status, commissionRules, notes, tenantId, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const a of clientState.affiliates) {
          stmt.run(a.id, a.code, a.firstName, a.lastName, a.photo || null, a.phone || null, a.email || null, a.address || null, a.city || null, a.country || 'Guinée', a.company || null, a.idNumber || null, a.status || 'active', a.commissionRules || null, a.notes || null, a.tenantId, a.createdAt, a.updatedAt);
        }
      }

      // 20. Sync Commission Rules
      if (clientState.commissionRules && Array.isArray(clientState.commissionRules)) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO commission_rules (id, name, type, value, minValue, maxValue, productId, category, clientId, affiliateId, campaign, priority, active, tenantId, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const r of clientState.commissionRules) {
          stmt.run(r.id, r.name, r.type, r.value, r.minValue ?? null, r.maxValue ?? null, r.productId || null, r.category || null, r.clientId || null, r.affiliateId || null, r.campaign || null, r.priority || 0, r.active ? 1 : 0, r.tenantId, r.createdAt);
        }
      }

      // 21. Sync Commission Ledger
      if (clientState.commissionLedger && Array.isArray(clientState.commissionLedger)) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO commission_ledger (id, affiliateId, type, reference, referenceType, description, credit, debit, balance, status, invoiceId, invoiceNumber, customerName, productName, quantity, sellPrice, minPrice, commissionAmount, paymentId, userId, userName, tenantId, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const e of clientState.commissionLedger) {
          stmt.run(e.id, e.affiliateId, e.type, e.reference || null, e.referenceType || null, e.description || null, e.credit || 0, e.debit || 0, e.balance || 0, e.status || 'pending', e.invoiceId || null, e.invoiceNumber || null, e.customerName || null, e.productName || null, e.quantity || null, e.sellPrice || null, e.minPrice || null, e.commissionAmount || null, e.paymentId || null, e.userId || null, e.userName || null, e.tenantId, e.createdAt);
        }
      }

      // 22. Sync Commission Payments
      if (clientState.commissionPayments && Array.isArray(clientState.commissionPayments)) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO commission_payments (id, reference, affiliateId, affiliateName, amount, method, currency, notes, ledgerIds, userId, userName, tenantId, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const p of clientState.commissionPayments) {
          stmt.run(p.id, p.reference, p.affiliateId, p.affiliateName, p.amount, p.method || 'cash', p.currency || 'GNF', p.notes || null, JSON.stringify(p.ledgerIds || []), p.userId || null, p.userName || null, p.tenantId, p.createdAt);
        }
      }

      // 23. Sync Commission Audit
      if (clientState.commissionAudit && Array.isArray(clientState.commissionAudit)) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO commission_audit (id, affiliateId, action, details, oldValue, newValue, userId, userName, tenantId, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const a of clientState.commissionAudit) {
          stmt.run(a.id, a.affiliateId, a.action, a.details || null, a.oldValue || null, a.newValue || null, a.userId || null, a.userName || null, a.tenantId, a.createdAt);
        }
      }

      // 24. Sync Pricing Plans
      if (clientState.pricingPlans && Array.isArray(clientState.pricingPlans)) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO pricing_plans (id, name, description, price, currency, durationDays, features, limits, color, displayOrder, active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const p of clientState.pricingPlans) {
          stmt.run(
            p.id,
            p.name,
            p.description || null,
            p.price,
            p.currency || 'EUR',
            p.durationDays || 30,
            JSON.stringify(p.features || []),
            JSON.stringify(p.limits || {}),
            p.color || 'blue',
            p.displayOrder !== undefined ? p.displayOrder : 1,
            p.active ? 1 : 0
          );
        }
      }
    })();

    // Compile and return the merged consolidated state back to the client
    const consolidatedState = compileCompleteState();
    res.json(consolidatedState);

    // For backward-compat full-state sync: push to Supabase via both queue and changelog
    syncService.syncUp()
      .then(r1 => {
        if (r1.pushed > 0 || r1.failed > 0) {
          console.log(`[SYNC POST] syncUp: ${r1.pushed} pushed, ${r1.failed} failed`);
        }
        return syncService.syncUpFromChangelog();
      })
      .then(r2 => {
        if (r2.pushed > 0 || r2.failed > 0) {
          console.log(`[SYNC POST] changelog: ${r2.pushed} pushed, ${r2.failed} failed`);
        }
      })
      .catch(err => console.error('[SYNC POST] sync error:', err));
  } catch (error) {
    next(error);
  }
});

export default router;
