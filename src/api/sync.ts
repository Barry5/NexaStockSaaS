import type { DBState } from '../types';

const SYNC_TABLES = [
  'tenants', 'users', 'products', 'product_variants', 'customers', 'suppliers',
  'sales', 'sale_items', 'expenses', 'loans', 'repayments', 'loan_installments',
  'warehouses', 'stock_transfers', 'invoices', 'invoice_items',
  'delivery_orders', 'delivery_order_items', 'payments', 'returns', 'return_items',
  'affiliates', 'commission_rules', 'commission_ledger', 'commission_payments',
  'commission_audit', 'sale_affiliates', 'sale_commission_items',
  'subscription_invoices', 'subscription_payments', 'pricing_plans',
  'global_saas_settings', 'audit_logs', 'invoice_audit_log',
  'delivery_note_audit', 'gdrive_tokens',
];

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

export function extractChanges(prevDb: DBState, nextDb: DBState): SyncChange[] {
  const changes: SyncChange[] = [];
  const tables: (keyof DBState)[] = [
    'tenants', 'users', 'products', 'customers', 'suppliers', 'expenses', 'loans',
    'warehouses', 'transfers', 'auditLogs', 'subscriptionInvoices', 'variants',
    'invoices', 'deliveryOrders', 'payments', 'returns', 'affiliates',
    'commissionRules', 'commissionLedger', 'commissionPayments', 'commissionAudit',
  ];

  for (const table of tables) {
    const prev = (prevDb[table] || []) as any[];
    const next = (nextDb[table] || []) as any[];
    const prevMap = new Map(prev.map(r => [r.id, r]));
    const nextMap = new Map(next.map(r => [r.id, r]));

    for (const record of next) {
      const prevRecord = prevMap.get(record.id);
      if (!prevRecord) {
        changes.push({ table: table as string, recordId: record.id, operation: 'CREATE', data: record, version: record.version || 1 });
      } else if (JSON.stringify(prevRecord) !== JSON.stringify(record)) {
        changes.push({ table: table as string, recordId: record.id, operation: 'UPDATE', data: record, version: record.version || (prevRecord.version || 0) + 1 });
      }
    }

    for (const record of prev) {
      if (!nextMap.has(record.id)) {
        changes.push({ table: table as string, recordId: record.id, operation: 'DELETE', data: record, version: record.version });
      }
    }
  }

  return changes;
}

let syncInProgress = false;
let pendingChanges: SyncChange[] = [];
let lastPullTimestamp = localStorage.getItem('sync_last_pull') || new Date(0).toISOString();

export function enqueueChange(change: SyncChange) {
  pendingChanges.push(change);
  localStorage.setItem('sync_pending', JSON.stringify(pendingChanges));
}

export function getPendingChanges(): SyncChange[] {
  return pendingChanges;
}

export function clearPendingChanges() {
  pendingChanges = [];
  localStorage.removeItem('sync_pending');
}

export function loadPendingChanges() {
  try {
    const stored = localStorage.getItem('sync_pending');
    if (stored) pendingChanges = JSON.parse(stored);
  } catch { pendingChanges = []; }
}

export async function flushPendingChanges(): Promise<PushResult | null> {
  if (pendingChanges.length === 0) return null;
  if (syncInProgress) return null;
  syncInProgress = true;

  try {
    const result = await pushChanges(pendingChanges);
    if (result.applied > 0) {
      const remaining = pendingChanges.slice(result.applied);
      pendingChanges = remaining;
      localStorage.setItem('sync_pending', JSON.stringify(remaining));
    }
    return result;
  } finally {
    syncInProgress = false;
  }
}

export async function pullRemoteChanges(): Promise<PullResult | null> {
  if (syncInProgress) return null;
  syncInProgress = true;

  try {
    const result = await pullChanges(lastPullTimestamp);
    if (result.timestamp) {
      lastPullTimestamp = result.timestamp;
      localStorage.setItem('sync_last_pull', lastPullTimestamp);
    }
    return result;
  } finally {
    syncInProgress = false;
  }
}

export function getLastPullTimestamp(): string {
  return lastPullTimestamp;
}

loadPendingChanges();
