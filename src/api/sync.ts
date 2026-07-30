import type { DBState } from '../types';
import {
  enqueueBatch as dexieEnqueueBatch, dequeuePendingChanges, markProcessing, markCompleted,
  markFailed, setMeta, getMeta, removeMeta,
  getAllPending, getPendingCount as dexiePendingCount, clearCompleted, retryFailed,
} from '../lib/syncQueue';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('nexastock_token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export async function fetchServerState(): Promise<DBState> {
  const res = await fetch('/api/sync');
  if (!res.ok) throw new Error('Server sync failed');
  return res.json() as Promise<DBState>;
}

export async function syncWithServer(db: DBState): Promise<DBState> {
  const headers = getAuthHeaders();
  const res = await fetch('/api/sync', {
    method: 'POST',
    headers,
    body: JSON.stringify(db),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || 'Sync request failed');
  }
  return res.json() as Promise<DBState>;
}

export interface SyncChange {
  table: string;
  recordId: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  data: Record<string, unknown>;
  version?: number;
}

export interface PushResult {
  applied: number;
  conflicts: {
    table: string;
    recordId: string;
    clientVersion: number;
    serverVersion: number;
    clientData: Record<string, unknown>;
    serverData: Record<string, unknown>;
    resolvedData: Record<string, unknown>;
    strategy: string;
  }[];
  errors: { table: string; recordId: string; error: string }[];
}

export interface PullResult {
  changes: Record<string, unknown[]>;
  deletions: Record<string, string[]>;
  timestamp: string;
}

export async function pushChanges(changes: SyncChange[]): Promise<PushResult> {
  const headers = getAuthHeaders();
  const res = await fetch('/api/sync/push', {
    method: 'POST',
    headers,
    body: JSON.stringify({ changes }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || 'Push failed');
  }
  return res.json() as Promise<PushResult>;
}

export async function pullChanges(since: string): Promise<PullResult> {
  const headers = getAuthHeaders();
  const res = await fetch(`/api/sync/pull?since=${encodeURIComponent(since)}`, { headers });
  if (!res.ok) throw new Error('Pull failed');
  return res.json() as Promise<PullResult>;
}

const FIELD_TO_TABLE: Record<string, string> = {
  tenants: 'tenants', users: 'users', products: 'products', customers: 'customers',
  suppliers: 'suppliers', expenses: 'expenses', loans: 'loans',
  warehouses: 'warehouses', transfers: 'stock_transfers',
  auditLogs: 'audit_logs', subscriptionInvoices: 'subscription_invoices',
  variants: 'product_variants', subscriptionPayments: 'subscription_payments',
  pricingPlans: 'pricing_plans',
  invoices: 'invoices', deliveryOrders: 'delivery_orders',
  payments: 'payments', returns: 'returns',
  affiliates: 'affiliates', commissionRules: 'commission_rules',
  commissionLedger: 'commission_ledger', commissionPayments: 'commission_payments',
  commissionAudit: 'commission_audit', invoiceAuditLogs: 'invoice_audit_log',
  deliveryNoteAudit: 'delivery_note_audit',
  gdriveTokens: 'gdrive_tokens',
};

const ARRAY_FIELDS = Object.keys(FIELD_TO_TABLE);

export function extractChanges(prevDb: DBState, nextDb: DBState): SyncChange[] {
  const changes: SyncChange[] = [];

  for (const field of ARRAY_FIELDS) {
    const table = FIELD_TO_TABLE[field];
    const prev = ((prevDb as any)[field] || []) as any[];
    const next = ((nextDb as any)[field] || []) as any[];
    const prevMap = new Map(prev.map(r => [r.id, r]));
    const nextMap = new Map(next.map(r => [r.id, r]));

    for (const record of next) {
      const prevRecord = prevMap.get(record.id);
      if (!prevRecord) {
        changes.push({ table, recordId: record.id, operation: 'CREATE', data: record, version: record.version || 1 });
      } else if (JSON.stringify(prevRecord) !== JSON.stringify(record)) {
        changes.push({ table, recordId: record.id, operation: 'UPDATE', data: record, version: record.version || (prevRecord.version || 0) + 1 });
      }
    }

    for (const record of prev) {
      if (!nextMap.has(record.id)) {
        changes.push({ table, recordId: record.id, operation: 'DELETE', data: record, version: record.version });
      }
    }
  }

  const prevSettings = prevDb.globalSaaSSettings;
  const nextSettings = nextDb.globalSaaSSettings;
  if (JSON.stringify(prevSettings) !== JSON.stringify(nextSettings) && nextSettings) {
    changes.push({
      table: 'global_saas_settings', recordId: '1', operation: 'UPDATE',
      data: nextSettings as any, version: 1,
    });
  }

  return changes;
}

let pushInProgress = false;
let pullInProgress = false;
let lastPullTimestamp = new Date(0).toISOString();

export function enqueueChange(change: SyncChange) {
  dexieEnqueueBatch([change]).catch(err => console.error('[SYNC] enqueueChange error:', err));
}

export async function getPendingChanges(): Promise<SyncChange[]> {
  return getAllPending();
}

export async function clearPendingChanges() {
  await clearCompleted();
}

export async function getPendingCount(): Promise<number> {
  return dexiePendingCount();
}

export async function flushPendingChanges(flushBatchSize: number = 50): Promise<PushResult | null> {
  const changes = await dequeuePendingChanges(flushBatchSize);
  if (changes.length === 0) return null;
  if (pushInProgress) return null;
  pushInProgress = true;

  try {
    const batch = changes.map(c => ({
      table: c.table,
      recordId: c.recordId,
      operation: c.operation,
      data: c.data,
      version: c.version,
    }));

    for (const change of changes) {
      await markProcessing(change.id!);
    }

    const result = await pushChanges(batch);
    const appliedIds = changes.slice(0, result.applied).map(c => c.id!);
    const conflictIds = result.conflicts.map(c => c.recordId);
    const errorIds = result.errors.map(e => e.recordId);

    for (const id of appliedIds) {
      await markCompleted(id);
    }

    for (const change of changes) {
      if (conflictIds.includes(change.recordId)) {
        await markCompleted(change.id!);
      } else if (errorIds.includes(change.recordId)) {
        const err = result.errors.find(e => e.recordId === change.recordId);
        await markFailed(change.id!, err?.error || 'Unknown error');
      }
    }

    return result;
  } finally {
    pushInProgress = false;
  }
}

async function loadLastPullTimestamp(): Promise<string> {
  const stored = await getMeta('sync_last_pull');
  return stored || new Date(0).toISOString();
}

export async function pullRemoteChanges(): Promise<PullResult | null> {
  if (pullInProgress) return null;
  pullInProgress = true;

  try {
    const since = await loadLastPullTimestamp();
    const result = await pullChanges(since);
    if (result.timestamp) {
      await setMeta('sync_last_pull', result.timestamp);
    }
    return result;
  } finally {
    pullInProgress = false;
  }
}

export async function getLastPullTimestamp(): Promise<string> {
  return loadLastPullTimestamp();
}
