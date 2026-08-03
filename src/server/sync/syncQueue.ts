import db from '../database/db.js';

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

export function dequeue(batchSize: number = 50): SyncQueueItem[] {
  return db.prepare(`
    SELECT * FROM sync_queue
    WHERE status = 'pending' AND retry_count < max_retries
    ORDER BY created_at ASC
    LIMIT ?
  `).all(batchSize) as SyncQueueItem[];
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

export function updateLastSyncTime(tableName: string, deviceId?: string, companyId?: string) {
  const now = new Date().toISOString();
  const existing = db.prepare(`SELECT id FROM sync_tracking WHERE table_name = ?`).get(tableName) as { id: string } | undefined;

  if (existing) {
    db.prepare(`
      UPDATE sync_tracking SET last_sync_at = ?, updated_at = ? WHERE table_name = ?
    `).run(now, now, tableName);
  } else {
    const id = `st-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    db.prepare(`
      INSERT INTO sync_tracking (id, table_name, last_sync_at, last_sync_version, device_id, company_id, created_at, updated_at)
      VALUES (?, ?, ?, 0, ?, ?, ?, ?)
    `).run(id, tableName, now, deviceId || null, companyId || null, now, now);
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
