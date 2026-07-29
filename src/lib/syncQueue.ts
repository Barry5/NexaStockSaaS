import Dexie, { type Table } from 'dexie';
import type { SyncChange } from '../api/sync';

export type SyncStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface PendingChange extends SyncChange {
  id?: number;
  createdAt: string;
  retryCount: number;
  maxRetries: number;
  status: SyncStatus;
  lastError: string | null;
}

export interface SyncMeta {
  key: string;
  value: string;
}

const DB_NAME = 'nexastock_sync';
const DB_VERSION = 1;

class NexaStockSyncDB extends Dexie {
  pending!: Table<PendingChange, number>;
  meta!: Table<SyncMeta, string>;

  constructor() {
    super(DB_NAME);
    this.version(DB_VERSION).stores({
      pending: '++id, table, operation, status, createdAt',
      meta: 'key',
    });
  }
}

let db: NexaStockSyncDB | null = null;

function getDb(): NexaStockSyncDB {
  if (!db) {
    db = new NexaStockSyncDB();
  }
  return db;
}

export async function enqueueChange(change: SyncChange): Promise<void> {
  const entry: PendingChange = {
    ...change,
    createdAt: new Date().toISOString(),
    retryCount: 0,
    maxRetries: 5,
    status: 'pending',
    lastError: null,
  };
  await getDb().pending.add(entry);
}

export async function enqueueBatch(changes: SyncChange[]): Promise<void> {
  const now = new Date().toISOString();
  const entries: PendingChange[] = changes.map(c => ({
    ...c,
    createdAt: now,
    retryCount: 0,
    maxRetries: 5,
    status: 'pending',
    lastError: null,
  }));
  await getDb().pending.bulkAdd(entries);
}

export async function dequeuePendingChanges(batchSize: number = 50): Promise<PendingChange[]> {
  return getDb().pending
    .where('status').equals('pending')
    .and(item => item.retryCount < item.maxRetries)
    .limit(batchSize)
    .toArray();
}

export async function markProcessing(id: number): Promise<void> {
  await getDb().pending.update(id, { status: 'processing' });
}

export async function markCompleted(id: number): Promise<void> {
  await getDb().pending.update(id, { status: 'completed' });
}

export async function markFailed(id: number, error: string): Promise<void> {
  const item = await getDb().pending.get(id);
  if (!item) return;
  await getDb().pending.update(id, {
    status: 'failed',
    retryCount: item.retryCount + 1,
    lastError: error,
  });
}

export async function retryFailed(): Promise<number> {
  const failed = await getDb().pending
    .where('status').equals('failed')
    .and(item => item.retryCount < item.maxRetries)
    .toArray();
  for (const item of failed) {
    await getDb().pending.update(item.id!, { status: 'pending', lastError: null });
  }
  return failed.length;
}

export async function getPendingCount(): Promise<number> {
  return getDb().pending
    .where('status').equals('pending')
    .and(item => item.retryCount < item.maxRetries)
    .count();
}

export async function clearCompleted(): Promise<void> {
  await getDb().pending.where('status').equals('completed').delete();
}

export async function clearAll(): Promise<void> {
  await getDb().pending.clear();
}

export async function setMeta(key: string, value: string): Promise<void> {
  await getDb().meta.put({ key, value });
}

export async function getMeta(key: string): Promise<string | null> {
  const entry = await getDb().meta.get(key);
  return entry?.value ?? null;
}

export async function removeMeta(key: string): Promise<void> {
  await getDb().meta.delete(key);
}

export async function getAllPending(): Promise<PendingChange[]> {
  return getDb().pending
    .where('status').equals('pending')
    .and(item => item.retryCount < item.maxRetries)
    .toArray();
}
