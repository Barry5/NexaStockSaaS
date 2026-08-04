import db from '../database/db.js';
import { tablePriorityCase } from './syncTables.js';


export type SyncOperation = 'CREATE' | 'UPDATE' | 'DELETE';
export type SyncStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface SyncQueueItem {
  id: string;
  table_name: string;
  record_id: string;
  operation: SyncOperation;
  payload: string;
  created_at: string;
  retry_count: number;
  max_retries: number;
  status: SyncStatus;
  device_id: string | null;
  company_id: string | null;
  last_error: string | null;
}

export function initializeSyncTables() {
  // Tables créées par migration 011_sync_tables — plus rien à faire ici
}

export function enqueue(
  tableName: string,
  recordId: string,
  operation: SyncOperation,
  payload: Record<string, unknown>,
  companyId?: string,
  deviceId?: string
): string {
  const id = `sync-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO sync_queue (id, table_name, record_id, operation, payload, created_at, company_id, device_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(id, tableName, recordId, operation, JSON.stringify(payload), now, companyId || null, deviceId || null);

  return id;
}

// File d'attente LEGACY (pré-déploiement pipeline unique) : conservée pour
// drainer les items en attente des anciennes versions. Le pipeline actif
// (Phase 1) passe exclusivement par sync_changelog (syncEngine.logChange).
export function dequeue(batchSize: number = 50): SyncQueueItem[] {
  const items = db.prepare(`
    SELECT * FROM sync_queue
    WHERE status = 'pending' AND retry_count < max_retries
    ORDER BY ${tablePriorityCase()}, created_at ASC
    LIMIT ?
  `).all(batchSize) as SyncQueueItem[];

  // Réservation atomique : marque les items 'processing' avant tout traitement
  // pour éviter qu'un second worker ne reprenne les mêmes.
  if (items.length > 0) {
    const ids = items.map(i => i.id);
    const placeholders = ids.map(() => '?').join(', ');
    db.prepare(`UPDATE sync_queue SET status = 'processing' WHERE id IN (${placeholders}) AND status = 'pending'`).run(...ids);
  }

  return items;
}

export function markProcessing(id: string) {
  db.prepare(`UPDATE sync_queue SET status = 'processing' WHERE id = ?`).run(id);
}

export function markCompleted(id: string) {
  db.prepare(`UPDATE sync_queue SET status = 'completed' WHERE id = ?`).run(id);
}

export function markFailed(id: string, error: string) {
  db.prepare(`
    UPDATE sync_queue
    SET status = 'failed', retry_count = retry_count + 1, last_error = ?
    WHERE id = ?
  `).run(error, id);
}

export function markPending(id: string) {
  db.prepare(`UPDATE sync_queue SET status = 'pending' WHERE id = ?`).run(id);
}

export function getPendingCount(): number {
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM sync_queue
    WHERE status = 'pending' AND retry_count < max_retries
  `).get() as { count: number };
  return row.count;
}

export function getFailedItems(): SyncQueueItem[] {
  return db.prepare(`
    SELECT * FROM sync_queue
    WHERE status = 'failed' OR (status = 'pending' AND retry_count >= max_retries)
    ORDER BY created_at ASC
  `).all() as SyncQueueItem[];
}

export function getLastSyncTime(tableName: string): string | null {
  const row = db.prepare(`
    SELECT last_sync_at FROM sync_tracking WHERE table_name = ?
  `).get(tableName) as { last_sync_at: string } | undefined;
  return row?.last_sync_at || null;
}

// Watermark de pull : le paramètre `watermark` (max updated_at/created_at des
// records réellement récupérés) prime sur l'horodatage courant, et le watermark
// n'est JAMAIS régressé (garde `last_sync_at < ?`).
export function updateLastSyncTime(tableName: string, watermark?: string, deviceId?: string, companyId?: string) {
  const value = watermark || new Date().toISOString();
  const now = new Date().toISOString();
  const existing = db.prepare(`SELECT id, last_sync_at FROM sync_tracking WHERE table_name = ?`).get(tableName) as { id: string; last_sync_at: string | null } | undefined;

  if (existing) {
    db.prepare(`
      UPDATE sync_tracking SET last_sync_at = ?, updated_at = ? WHERE table_name = ? AND (last_sync_at IS NULL OR last_sync_at < ?)
    `).run(value, now, tableName, value);
  } else {
    const id = `st-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    db.prepare(`
      INSERT INTO sync_tracking (id, table_name, last_sync_at, last_sync_version, device_id, company_id, created_at, updated_at)
      VALUES (?, ?, ?, 0, ?, ?, ?, ?)
    `).run(id, tableName, value, deviceId || null, companyId || null, now, now);
  }
}

export function retryFailed(maxRetries: number = 5) {
  db.prepare(`
    UPDATE sync_queue
    SET status = 'pending', last_error = NULL
    WHERE (status = 'failed' OR (retry_count >= max_retries AND status = 'pending'))
      AND retry_count < ?
  `).run(maxRetries);
}

export function cleanOldSyncRecords(daysOld: number = 30) {
  const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`DELETE FROM sync_queue WHERE created_at < ? AND status = 'completed'`).run(cutoff);
}

export function loadLastSyncTimestamps(): { table_name: string; last_sync_at: string | null }[] {
  return db.prepare(`SELECT table_name, last_sync_at FROM sync_tracking`).all() as { table_name: string; last_sync_at: string | null }[];
}

export interface SyncQueueTableSummary {
  table_name: string;
  pending: number;
  processing: number;
  failed: number;
  create: number;
  update: number;
  delete: number;
}

export interface SyncQueueSummary {
  total: number;
  pending: number;
  processing: number;
  failed: number;
  completed: number;
  oldestPendingAt: string | null;
  oldestFailedAt: string | null;
  perTable: SyncQueueTableSummary[];
}

export function getSummary(): SyncQueueSummary {
  const stats = db.prepare(
    `SELECT status, operation, table_name, COUNT(*) as count
     FROM sync_queue
     GROUP BY status, operation, table_name`
  ).all() as { status: string; operation: string; table_name: string; count: number }[];

  const tableMap = new Map<string, SyncQueueTableSummary>();
  let pending = 0; let processing = 0; let failed = 0; let completed = 0;
  for (const row of stats) {
    const summary = tableMap.get(row.table_name) || {
      table_name: row.table_name,
      pending: 0, processing: 0, failed: 0,
      create: 0, update: 0, delete: 0,
    };
    if (row.status === 'pending') summary.pending += row.count;
    if (row.status === 'processing') summary.processing += row.count;
    if (row.status === 'failed') summary.failed += row.count;
    if (row.status === 'completed') completed += row.count;
    if (row.operation === 'CREATE') summary.create += row.count;
    if (row.operation === 'UPDATE') summary.update += row.count;
    if (row.operation === 'DELETE') summary.delete += row.count;
    tableMap.set(row.table_name, summary);

    if (row.status === 'pending') pending += row.count;
    if (row.status === 'processing') processing += row.count;
    if (row.status === 'failed') failed += row.count;
  }

  const total = pending + processing + failed + completed;
  const oldestPendingAtRow = db.prepare(`SELECT created_at FROM sync_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1`).get() as { created_at: string } | undefined;
  const oldestFailedAtRow = db.prepare(`SELECT created_at FROM sync_queue WHERE status = 'failed' ORDER BY created_at ASC LIMIT 1`).get() as { created_at: string } | undefined;

  return {
    total,
    pending,
    processing,
    failed,
    completed,
    oldestPendingAt: oldestPendingAtRow?.created_at || null,
    oldestFailedAt: oldestFailedAtRow?.created_at || null,
    perTable: Array.from(tableMap.values()).sort((a, b) => a.table_name.localeCompare(b.table_name)),
  };
}
