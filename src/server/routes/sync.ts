import { Router, Response } from 'express';
import db from '../database/db.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { requireRole } from '../middleware/auth.js';
import { hashPassword } from '../services/auth.js';
import { getAdminClient } from '../services/supabase/supabaseService.js';
import { syncService } from '../sync/syncService.js';
import { syncEngine } from '../sync/syncEngine.js';
import { supabaseWorker } from '../sync/supabaseWorker.js';
import * as SyncQueue from '../sync/syncQueue.js';
import { SYNC_TABLES, SYNC_TABLE_SET } from '../sync/syncTables.js';
import { TENANT_SCOPED_TABLES, CHILD_TENANT_PARENT, GLOBAL_TABLES, tenantWhereClause } from '../sync/tenantScope.js';
import { TABLE_TO_CLIENT_FIELD, EMBEDDED_CHILDREN, resolveChildId } from '../../shared/syncMappings.js';

const router = Router();

// ---------------------------------------------------------------------------
// SCOPE TENANT (SEC-1/2/3/10 de l'audit) : toutes les lectures /sync sont
// filtrées par le tenant de l'utilisateur (req.user.tenantId), et toutes les
// écritures (push / full-state) sont validées/étampées avec ce tenant.
// req.user.tenantId === null signifie superadmin → aucun filtre (tout visible).
// Les règles de scope (TENANT_SCOPED_TABLES, CHILD_TENANT_PARENT,
// GLOBAL_TABLES, tenantWhereClause) sont partagées avec syncEngine via
// ../sync/tenantScope.ts.
// ---------------------------------------------------------------------------

// Valide/étampe les changements entrants avec le tenant de l'utilisateur.
// Les changements illégitimes sont rejetés (jamais appliqués, jamais propagés).
function scopeChangesForTenant(userTenantId: string | null, changes: any[]): { changes: any[]; rejected: string[] } {
  if (!userTenantId) return { changes, rejected: [] }; // superadmin : aucun filtre
  const scoped: any[] = [];
  const rejected: string[] = [];

  // Parents créés dans le MÊME batch (vente + sale_items, produit + variants…) :
  // permet de scoper les enfants dont le parent n'existe pas encore en SQLite
  // au moment du scope (ils seront insérés dans la même transaction pushChanges).
  const batchParents = new Map<string, Map<string, string>>();
  for (const c of changes) {
    const d = c.data || {};
    if (d.tenantId) {
      let byId = batchParents.get(c.table);
      if (!byId) { byId = new Map(); batchParents.set(c.table, byId); }
      byId.set(c.recordId, d.tenantId);
    }
  }

  for (const c of changes) {
    const table = c.table;
    const d = c.data || {};

    // Écriture sur une table globale/système : superadmin uniquement.
    if (GLOBAL_TABLES.has(table)) {
      rejected.push(`${table}/${c.recordId}`);
      continue;
    }

    const rt = d.tenantId || d.tenant_id;
    if (rt) {
      if (rt !== userTenantId) {
        rejected.push(`${table}/${c.recordId}`);
      } else {
        scoped.push(c);
      }
      continue;
    }

    if (TENANT_SCOPED_TABLES.has(table)) {
      const existing = db.prepare(`SELECT tenantId FROM ${table} WHERE id = ?`).get(c.recordId) as { tenantId?: string } | undefined;
      if (existing) {
        if (existing.tenantId !== userTenantId) {
          rejected.push(`${table}/${c.recordId}`);
          continue;
        }
      } else if (c.operation !== 'DELETE') {
        // Nouvelle ligne sans tenantId : étampée avec le tenant du token
        // (un tenant ne peut pas créer une ligne sans tenant, ex. user global).
        d.tenantId = userTenantId;
      }
      scoped.push(c);
      continue;
    }

    const child = CHILD_TENANT_PARENT[table];
    if (child) {
      const parentId = d[child.column];
      if (parentId) {
        const parent = db.prepare(`SELECT tenantId FROM ${child.parent} WHERE id = ?`).get(parentId) as { tenantId?: string } | undefined;
        const batchTenant = batchParents.get(child.parent)?.get(parentId);
        // ✔ Création en cascade (même batch) : le parent sera inséré par la
        // même pushChanges — l'enfant est accepté si le parent du batch est
        // bien du même tenant (ou déjà présent localement).
        if (parent) {
          if (parent.tenantId !== userTenantId) {
            rejected.push(`${table}/${c.recordId}`);
            continue;
          }
        } else if (batchTenant) {
          if (batchTenant !== userTenantId) {
            rejected.push(`${table}/${c.recordId}`);
            continue;
          }
        } else {
          rejected.push(`${table}/${c.recordId}`);
          continue;
        }
      } else if (c.operation === 'DELETE') {
        const row = db.prepare(`SELECT ${child.column} AS parentId FROM ${table} WHERE id = ?`).get(c.recordId) as { parentId?: string } | undefined;
        if (row?.parentId) {
          const parent = db.prepare(`SELECT tenantId FROM ${child.parent} WHERE id = ?`).get(row.parentId) as { tenantId?: string } | undefined;
          if (!parent || parent.tenantId !== userTenantId) {
            rejected.push(`${table}/${c.recordId}`);
            continue;
          }
        }
      }
      scoped.push(c);
      continue;
    }

    // Table de sync non catégorisée : refusée (garde-fou).
    rejected.push(`${table}/${c.recordId}`);
  }

  return { changes: scoped, rejected };
}

// Helper: Compile complete DBState from SQLite (scopé au tenant si défini)
export function compileCompleteState(tenantId?: string | null): any {
  const scope = tenantId || null; // null = superadmin (toutes les données)

  // 1. Tenants
  const tenants = scope
    ? db.prepare('SELECT * FROM tenants WHERE id = ?').all(scope) as any[]
    : db.prepare('SELECT * FROM tenants').all() as any[];
  const formattedTenants = tenants.map(t => ({
    ...t,
    customCategories: JSON.parse(t.customCategories || '[]')
  }));

  // 2. Users
  // NOTE SEC-6 : le hash bcrypt `password` est conservé (le login hors-ligne du
  // client SaaSAuth en dépend), mais il est désormais SCOPÉ au tenant de
  // l'utilisateur — plus aucun hash d'un autre tenant n'est exposé.
  const users = scope
    ? db.prepare('SELECT id, name, email, role, tenantId, active, avatar, password, firstLoginReset FROM users WHERE tenantId = ?').all(scope) as any[]
    : db.prepare('SELECT id, name, email, role, tenantId, active, avatar, password, firstLoginReset FROM users').all() as any[];
  const formattedUsers = users.map(u => ({
    ...u,
    active: !!u.active,
    firstLoginReset: !!u.firstLoginReset
  }));

  // 3. Products
  const products = scope
    ? db.prepare('SELECT * FROM products WHERE tenantId = ?').all(scope) as any[]
    : db.prepare('SELECT * FROM products').all() as any[];
  const formattedProducts = products.map(p => {
    const variants = db.prepare('SELECT * FROM product_variants WHERE productId = ?').all(p.id);
    return {
      ...p,
      variants
    };
  });

  // 4. Customers
  const customers = scope
    ? db.prepare('SELECT * FROM customers WHERE tenantId = ?').all(scope)
    : db.prepare('SELECT * FROM customers').all();

  // 5. Suppliers
  const suppliers = scope
    ? db.prepare('SELECT * FROM suppliers WHERE tenantId = ?').all(scope)
    : db.prepare('SELECT * FROM suppliers').all();

  // 6. Expenses
  const expenses = scope
    ? db.prepare('SELECT * FROM expenses WHERE tenantId = ?').all(scope)
    : db.prepare('SELECT * FROM expenses').all();

  // 7. Loans
  const loans = scope
    ? db.prepare('SELECT * FROM loans WHERE tenantId = ?').all(scope) as any[]
    : db.prepare('SELECT * FROM loans').all() as any[];
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
  const sales = scope
    ? db.prepare('SELECT * FROM sales WHERE tenantId = ?').all(scope) as any[]
    : db.prepare('SELECT * FROM sales').all() as any[];
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
  const warehouses = scope
    ? db.prepare('SELECT * FROM warehouses WHERE tenantId = ?').all(scope)
    : db.prepare('SELECT * FROM warehouses').all();
  const transfers = scope
    ? db.prepare('SELECT * FROM stock_transfers WHERE tenantId = ?').all(scope)
    : db.prepare('SELECT * FROM stock_transfers').all();

  // 10. Audit Logs
  const auditLogs = scope
    ? db.prepare('SELECT * FROM audit_logs WHERE tenantId = ? ORDER BY timestamp DESC').all(scope)
    : db.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC').all();

  // 11. Invoices
  const subscriptionInvoices = scope
    ? db.prepare('SELECT * FROM subscription_invoices WHERE tenantId = ?').all(scope)
    : db.prepare('SELECT * FROM subscription_invoices').all();

  // 12. Variants (scopés via les produits du tenant)
  const variants = scope
    ? db.prepare('SELECT * FROM product_variants WHERE productId IN (SELECT id FROM products WHERE tenantId = ?)').all(scope)
    : db.prepare('SELECT * FROM product_variants').all();

  // 13. Pricing Plans
  const plans = db.prepare('SELECT * FROM pricing_plans ORDER BY displayOrder ASC').all() as any[];
  const formattedPlans = plans.map(p => ({
    ...p,
    features: JSON.parse(p.features || '[]'),
    limits: JSON.parse(p.limits || '{}'),
    active: !!p.active
  }));

  // 14. Payments
  const subscriptionPayments = scope
    ? db.prepare('SELECT * FROM subscription_payments WHERE tenantId = ? ORDER BY date DESC').all(scope)
    : db.prepare('SELECT * FROM subscription_payments ORDER BY date DESC').all();

  // 15. Settings
  const settings = db.prepare('SELECT * FROM global_saas_settings WHERE id = 1').get() as any;
  const formattedSettings = settings ? {
    ...settings,
    automaticActivation: !!settings.automaticActivation
  } : null;

  // 16. Invoices (new ERP module)
  const invoices = scope
    ? db.prepare('SELECT * FROM invoices WHERE tenantId = ? ORDER BY date DESC').all(scope) as any[]
    : db.prepare('SELECT * FROM invoices ORDER BY date DESC').all() as any[];
  const formattedInvoices = invoices.map(inv => {
    const items = db.prepare('SELECT * FROM invoice_items WHERE invoiceId = ?').all(inv.id);
    return { ...inv, items };
  });

  // 17. Delivery Orders
  const deliveryOrders = scope
    ? db.prepare('SELECT * FROM delivery_orders WHERE tenantId = ? ORDER BY createdAt DESC').all(scope) as any[]
    : db.prepare('SELECT * FROM delivery_orders ORDER BY createdAt DESC').all() as any[];
  const formattedDOs = deliveryOrders.map(do_ => {
    const items = db.prepare('SELECT * FROM delivery_order_items WHERE deliveryOrderId = ?').all(do_.id);
    return { ...do_, items };
  });

  // 18. Payments
  const payments = scope
    ? db.prepare('SELECT * FROM payments WHERE tenantId = ? ORDER BY date DESC').all(scope)
    : db.prepare('SELECT * FROM payments ORDER BY date DESC').all();

  // 19. Returns
  const returns = scope
    ? db.prepare('SELECT * FROM returns WHERE tenantId = ? ORDER BY createdAt DESC').all(scope) as any[]
    : db.prepare('SELECT * FROM returns ORDER BY createdAt DESC').all() as any[];
  const formattedReturns = returns.map(r => {
    const items = db.prepare('SELECT * FROM return_items WHERE returnId = ?').all(r.id);
    return { ...r, items };
  });

  // 20. Invoice Audit Logs (scopés via les factures du tenant)
  const invoiceAuditLogs = scope
    ? db.prepare('SELECT * FROM invoice_audit_log WHERE invoiceId IN (SELECT id FROM invoices WHERE tenantId = ?) ORDER BY timestamp DESC').all(scope)
    : db.prepare('SELECT * FROM invoice_audit_log ORDER BY timestamp DESC').all();

  // 21. Affiliates
  const affiliates = scope
    ? db.prepare('SELECT * FROM affiliates WHERE tenantId = ? ORDER BY createdAt DESC').all(scope)
    : db.prepare('SELECT * FROM affiliates ORDER BY createdAt DESC').all();

  // 22. Commission Rules
  const commissionRules = scope
    ? db.prepare('SELECT * FROM commission_rules WHERE tenantId = ? ORDER BY priority ASC').all(scope)
    : db.prepare('SELECT * FROM commission_rules ORDER BY priority ASC').all();

  // 23. Commission Ledger
  const commissionLedger = scope
    ? db.prepare('SELECT * FROM commission_ledger WHERE tenantId = ? ORDER BY createdAt DESC').all(scope)
    : db.prepare('SELECT * FROM commission_ledger ORDER BY createdAt DESC').all();

  // 24. Commission Payments
  const commissionPayments = scope
    ? db.prepare('SELECT * FROM commission_payments WHERE tenantId = ? ORDER BY createdAt DESC').all(scope)
    : db.prepare('SELECT * FROM commission_payments ORDER BY createdAt DESC').all();

  // 25. Commission Audit
  const commissionAudit = scope
    ? db.prepare('SELECT * FROM commission_audit WHERE tenantId = ? ORDER BY createdAt DESC').all(scope)
    : db.prepare('SELECT * FROM commission_audit ORDER BY createdAt DESC').all();

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



// Inverse mapping of FIELD_TO_TABLE (src/api/sync.ts): SQLite table name ->
// key in the client DBState. Used to compute deletions to propagate.
// ✔ Centralisé dans src/shared/syncMappings.ts : toute table ajoutée côté
// client (sales, moduleDefinitions, …) est automatiquement reconnue ici.
const CLIENT_FIELD_BY_TABLE: Record<string, string> = { ...TABLE_TO_CLIENT_FIELD };

// Phase 3 (C1) : l'inférence de suppression par snapshot client est SUPPRIMÉE —
// elle pouvait détruire des données (cache client partiel → suppression de masse
// locale puis PG). Les suppressions ne sont propagées que si le client les
// déclare EXPLICITEMENT (champ `deletions: [{ table, recordId }]`, ou via le
// chemin delta /api/sync/push).

// Champs enfants embarqués dans le DBState client (tables enfants dérivées).
// ✔ Centralisé dans src/shared/syncMappings.ts (utilisé par le full-state ET
// par le delta /api/sync/push, cf. expandEmbeddedChildren).

// Transforme l'état complet du client (full-state POST /api/sync) en deltas
// versionnés (SyncChange[]) traités par syncEngine.pushChanges : application
// versionnée (LWW par version, aucun écrasement par snapshot périmé),
// journalisation changelog -> propagation PG, tombstones pour les suppressions.
// Exporté pour les tests (Phase 5).
export function buildStateChanges(clientState: Record<string, unknown>): any[] {
  const changes: any[] = [];
  const tenantId = (clientState.__tenantId as string) || '';
  void tenantId;

  for (const [table, field] of Object.entries(CLIENT_FIELD_BY_TABLE)) {
    const records = (clientState[field] as any[] | undefined) || [];
    for (const record of records) {
      if (!record || !record.id) continue;
      const exists = db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(record.id) !== undefined;
      changes.push({
        table,
        recordId: record.id,
        operation: exists ? 'UPDATE' : 'CREATE',
        data: record,
        version: typeof record.version === 'number' ? record.version : 1,
      });

      // Enfants embarqués : delta uniquement (CREATE/UPDATE). Aucune
      // inférence de suppression des orphelins locaux : un snapshot client
      // périmé/partiel ferait détruire des enfants créés par un autre
      // appareil (donnée de B supprimée silencieusement, §2.3 audit). Les
      // DELETEs enfants passent exclusivement par /api/sync/push (explicite).
      const children = EMBEDDED_CHILDREN[table];
      if (children) {
        for (const child of children) {
          const childRows = (record[child.field] as any[] | undefined) || [];
          for (const childRow of childRows) {
            if (!childRow) continue;
            const childId = resolveChildId(record.id, childRow, childRows.indexOf(childRow));
            const childExists = db.prepare(`SELECT id FROM ${child.childTable} WHERE id = ?`).get(childId) !== undefined;
            changes.push({
              table: child.childTable,
              recordId: childId,
              operation: childExists ? 'UPDATE' : 'CREATE',
              data: { ...childRow, id: childId, [child.parentColumn]: record.id },
              version: typeof childRow.version === 'number' ? childRow.version : 1,
            });
          }
        }
      }
    }
  }

  // Paramètres SaaS globaux (table à clé fixe id = 1)
  const gs = clientState.globalSaaSSettings as Record<string, unknown> | undefined;
  if (gs && typeof gs === 'object') {
    changes.push({ table: 'global_saas_settings', recordId: '1', operation: 'UPDATE', data: { ...gs, id: '1' }, version: 1 });
  }

  return changes;
}

// ✔ P1/P2 : éclate les enfants embarqués du delta client (/api/sync/push).
// Le client porte les enfants DANS le parent (sales.items, loan.repayments…)
// ; sans cet éclatement les enfants ne seraient JAMAIS journalisés dans le
// changelog -> jamais poussés vers Supabase (ventes POS, articles de vente,
// remboursements de prêts). Les DELETEs parents ne propagent pas enfants
// (ils sont/CASCADE gérés côté PG — supprimer explicitement via /api/sync/push).
export function expandEmbeddedChildren(changes: any[]): any[] {
  const expanded: any[] = [];
  for (const c of changes) {
    expanded.push(c);
    const children = EMBEDDED_CHILDREN[c.table];
    if (!children || c.operation === 'DELETE') continue;
    const record = (c.data || {}) as Record<string, unknown>;
    for (const child of children) {
      const childRow = (record as any)[child.field];
      const childRows = Array.isArray(childRow) ? childRow as any[] : [];
      for (let i = 0; i < childRows.length; i++) {
        const row = childRows[i];
        if (!row) continue;
        const childId = resolveChildId(c.recordId, row, i);
        expanded.push({
          table: child.childTable,
          recordId: childId,
          operation: 'CREATE' as const,
          data: { ...row, id: childId, [child.parentColumn]: c.recordId },
          version: typeof row.version === 'number' ? row.version : 1,
        });
      }
    }
  }
  return expanded;
}

// GET /api/sync/changes?since=ISO_TIMESTAMP - Delta sync endpoint (scopé tenant)
router.get('/changes', authenticateToken, (req: AuthenticatedRequest, res, next) => {
  try {
    const since = req.query.since as string;
    if (!since) return res.status(400).json({ error: 'Paramètre since requis (ISO timestamp).' });

    const tenantId = req.user?.tenantId ?? null;

    const changes: Record<string, any[]> = {};
    for (const table of SYNC_TABLES) {
      const tableInfo = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      const hasUpdatedAt = tableInfo.some(c => c.name === 'updatedAt');
      const hasCreatedAt = tableInfo.some(c => c.name === 'createdAt');
      const scope = tenantId ? tenantWhereClause(table, tenantId) : null;

      if (hasUpdatedAt) {
        changes[table] = scope
          ? db.prepare(`SELECT * FROM ${table} WHERE updatedAt >= ? AND ${scope.clause}`).all(since, ...scope.params) as any[]
          : db.prepare(`SELECT * FROM ${table} WHERE updatedAt >= ?`).all(since) as any[];
      } else if (hasCreatedAt) {
        changes[table] = scope
          ? db.prepare(`SELECT * FROM ${table} WHERE createdAt >= ? AND ${scope.clause}`).all(since, ...scope.params) as any[]
          : db.prepare(`SELECT * FROM ${table} WHERE createdAt >= ?`).all(since) as any[];
      } else {
        changes[table] = [];
      }
    }

    // M4 : les tombstones de suppression sont lus depuis sync_deletions
    // (tombstones locaux effectifs), plus depuis la file legacy sync_queue —
    // qui n'est plus alimentée par le pipeline unique (changelog).
    const deleted = db.prepare(`
      SELECT table_name, record_id, deleted_at AS created_at FROM sync_deletions
      WHERE deleted_at >= ?
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

// GET /api/sync/reset-app?key=<RESET_KEY>
// ONE-CLICK reset — clear local + pull from Supabase (superadmin only).
// SEC-5 (audit) : plus AUCUNE clé par défaut en code. La clé doit être fournie
// via la variable d'environnement RESET_KEY ; à défaut, l'endpoint est désactivé.
const RESET_KEY = process.env.RESET_KEY;
router.get('/reset-app', authenticateToken, requireRole(['superadmin']), (req, res) => {
  try {
    if (!RESET_KEY) {
      return res.status(503).json({ error: 'RESET_KEY non configurée dans l\'environnement. Réinitialisation désactivée.' });
    }
    const key = req.query.key as string;
    if (key !== RESET_KEY) {
      return res.status(403).json({ error: 'Clé de réinitialisation invalide.' });
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

// GET /api/sync/overview: Detailed sync diagnostics for superadmin dashboard
router.get('/overview', authenticateToken, requireRole(['superadmin']), (req, res) => {
  const queueSummary = SyncQueue.getSummary();
  const pendingChanges = syncEngine.getPendingChangesSummary();
  const lastSyncTimestamps = SyncQueue.loadLastSyncTimestamps();
  const conflictsCount = (db.prepare(`SELECT COUNT(*) as c FROM sync_conflicts`).get() as any).c;

  res.json({
    service: syncService.getStatus(),
    worker: supabaseWorker.getStatus(),
    queueSummary,
    pendingChanges,
    lastSyncTimestamps,
    conflictsCount,
  });
});

// GET /api/sync/conflicts: conflits de sync persistés (§8.2.1 audit) — qui a
// gagné, pourquoi, avec quelles données. Purge automatique à 30 j.
router.get('/conflicts', authenticateToken, requireRole(['superadmin']), (req, res) => {
  const items = db.prepare(`
    SELECT id, table_name, record_id, client_version, server_version, strategy, created_at
    FROM sync_conflicts
    ORDER BY created_at DESC
    LIMIT 200
  `).all() as any[];
  res.json({ count: items.length, items });
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
  // Dead-letter du changelog (retry borné dépassé) : à rejouer via
  // /api/sync/retry-failed après correction.
  const changelogDead = syncEngine.getDeadChanges(200);
  res.json({ count: items.length, items, changelogDead, changelogDeadCount: changelogDead.length });
});

// POST /api/sync/retry-failed: remet en `pending` les items de file en échec
// (y compris au max de retries) pour les rejouer avec le code corrigé.
// Utile après un correctif transformant les colonnes/absentes. Option : ?table_name=.
// On remet retry_count à 0 pour offrir un quota de nouvelles tentatives (borné).
export function resetFailedItems(tableName?: string): number {
  if (tableName) {
    if (!SYNC_TABLE_SET.has(tableName)) {
      throw new Error(`Table inconnue pour la synchronisation: ${tableName}`);
    }
    return db.prepare(`
      UPDATE sync_queue
      SET status = 'pending', last_error = NULL, retry_count = 0
      WHERE status = 'failed' AND table_name = ?
    `).run(tableName).changes;
  }
  return db.prepare(`
    UPDATE sync_queue
    SET status = 'pending', last_error = NULL, retry_count = 0
    WHERE status = 'failed'
  `).run().changes;
}

router.post('/retry-failed', authenticateToken, requireRole(['superadmin']), (req, res, next) => {
  try {
    const tableName = req.body?.table_name as string | undefined;
    const reset = resetFailedItems(tableName);
    // Rejoue aussi les changements changelog en dead-letter (retry_count remis à 0).
    const resetDead = syncEngine.resetDeadChanges(tableName);
    res.json({ reset, resetDead });
  } catch (err: any) {
    next(err);
  }
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

const WIPE_SYNC_TABLES = ['sync_queue', 'sync_changelog', 'sync_deletions', 'sync_tracking'];
// NB: sync_uuid_map est VOLONTAIREMENT conservé : les tables système (rôles,
// permissions, forfaits...) gardent leurs UUID côté Supabase. Si le mapping
// était vidé, l'upsert régénérerait de nouveaux UUID et réécrirait les clés
// primaires référencées par role_permissions/user_roles (violation FK).

function wipeSupabaseData(): Promise<{ tables: number; errors: string[] }> {
  const admin = getAdminClient();
  const errors: string[] = [];
  let tables = 0;

  return WIPE_TABLES.reduce<Promise<number>>(async (acc, table) => {
    const count = await acc;
    try {
      // gdrive_tokens n'a pas de legacy_id (clé: tenant_id UUID NOT NULL) ;
      // tenant_modules n'a pas de legacy_id (clé: id UUID).
      let query: any;
      if (table === 'gdrive_tokens') {
        query = admin.from(table).delete().not('tenant_id', 'is', null);
      } else if (table === 'tenant_modules') {
        query = admin.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      } else {
        query = admin.from(table).delete().neq('legacy_id', '__never__');
      }
      const { error } = await query;
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
    const changelogResult = await syncService.syncUpFromChangelog();
    const downResult = await syncService.syncDown();
    const cleanupResult = syncEngine.cleanupPushedRecords();
    res.json({
      changelog: changelogResult,
      pull: downResult,
      cleanup: { removed: cleanupResult },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// GET: Compile and return full DB state (scopé au tenant de l'utilisateur)
router.get('/', authenticateToken, (req: AuthenticatedRequest, res, next) => {
  try {
    const state = compileCompleteState(req.user?.tenantId ?? null);
    res.json(state);
  } catch (error) {
    next(error);
  }
});

// GET /api/sync/pull?since=ISO_TIMESTAMP - Incremental pull (changes + deletions, scopé tenant)
router.get('/pull', authenticateToken, (req: AuthenticatedRequest, res, next) => {
  try {
    const since = req.query.since as string;
    if (!since) return res.status(400).json({ error: 'Paramètre since requis (ISO timestamp).' });
    const tableName = req.query.table as string | undefined;
    const result = syncEngine.pullChanges(since, tableName, req.user?.tenantId ?? null);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/sync/push - Incremental push with conflict resolution (tenant validé)
router.post('/push', authenticateToken, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { changes } = req.body;
    if (!changes || !Array.isArray(changes)) {
      return res.status(400).json({ error: 'Format invalide. Attendu: { changes: [...] }' });
    }

    const tenantId = req.user?.tenantId ?? null;
    const deviceId = req.headers['x-device-id'] as string || 'server';

    // ✔ P1 : éclatement des enfants embarqués (sales.items -> sale_items,
    // loan.repayments -> repayments, …) avant scope tenant + application.
    const expanded = expandEmbeddedChildren(changes);

    // SEC-2/10 : les changements d'un autre tenant (ou de tables globales pour
    // un tenant) sont rejetés avant toute écriture locale.
    const scoped = scopeChangesForTenant(tenantId, expanded);
    if (scoped.rejected.length > 0) {
      console.warn(`[SYNC PUSH] ${scoped.rejected.length} changement(s) rejetés (tenant/global): ${scoped.rejected.slice(0, 5).join(', ')}${scoped.rejected.length > 5 ? '…' : ''}`);
    }

    const result = syncEngine.pushChanges(scoped.changes.map((c: any) => ({
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

    // Phase 3 (C1/C3) : merge full-state VERSIONNÉ via le moteur commun.
    // Toutes les écritures passent par syncEngine.pushChanges :
    //  - LWW par version : un snapshot client périmé ne peut JAMAIS écraser
    //    une donnée locale plus récente (garde-fou anti-régression) ;
    //  - journalisation systématique dans sync_changelog -> propagation PG ;
    //  - plus d'INSERT OR REPLACE bruts qui effaçaient des colonnes
    //    (version, updatedAt, sync_status) sans rien journaliser.
    const stateChanges = buildStateChanges(clientState as Record<string, unknown>);
    // SEC-2/10 : scope tenant (rejet des tables globales et records d'autres
    // tenants) avant toute écriture locale.
    const scoped = scopeChangesForTenant(req.user?.tenantId ?? null, stateChanges);
    if (scoped.rejected.length > 0) {
      console.warn(`[SYNC POST] ${scoped.rejected.length} changement(s) rejetés (tenant/global): ${scoped.rejected.slice(0, 5).join(', ')}${scoped.rejected.length > 5 ? '…' : ''}`);
    }
    let applied = 0;
    let conflicts = 0;
    let mergeErrors: string[] = [];
    if (scoped.changes.length > 0) {
      const pushResult = syncEngine.pushChanges(scoped.changes);
      applied = pushResult.applied;
      conflicts = pushResult.conflicts.length;
      mergeErrors = pushResult.errors.map(e => `${e.table}/${e.recordId}: ${e.error}`);
      if (mergeErrors.length > 0) {
        console.warn('[SYNC POST] Erreurs de merge:', mergeErrors.join('; '));
      }
    }

    // Suppressions EXPLICITES déclarées par le client (jamais inférées depuis
    // un snapshot partiel - l'inférence de masse a été supprimée, Phase 3).
    // Le chemin delta /api/sync/push propage aussi les DELETEs.
    let deletionPushed = 0;
    const explicitDeletions = (clientState as any).deletions;
    if (Array.isArray(explicitDeletions) && explicitDeletions.length > 0) {
      const deleteChanges = explicitDeletions
        .filter((d: any) => d && typeof d.table === 'string' && typeof d.recordId === 'string')
        .map((d: any) => ({ table: d.table, recordId: d.recordId, operation: 'DELETE' as const, data: { id: d.recordId }, version: 1 }));
      const scopedDeletions = scopeChangesForTenant(req.user?.tenantId ?? null, deleteChanges);
      const deleteResult = syncEngine.pushChanges(scopedDeletions.changes);
      deletionPushed = deleteResult.applied;
    }

    // Compile and return the merged consolidated state back to the client
    const consolidatedState = compileCompleteState(req.user?.tenantId ?? null);
    res.json(consolidatedState);

    if (applied > 0 || conflicts > 0 || deletionPushed > 0) {
      console.log(`[SYNC POST] merge: ${applied} appliqués, ${conflicts} conflits (LWW), ${deletionPushed} suppressions explicites propagées`);
    }
    // Pas de syncUpFromChangelog fire-and-forget ici : le SupabaseWorker (15 s)
    // est l'UNIQUE planificateur (audit §6.2/14.6). Le changelog alimenté par
    // pushChanges est poussé par le prochain tick du worker.
  } catch (error) {
    next(error);
  }
});

export default router;
