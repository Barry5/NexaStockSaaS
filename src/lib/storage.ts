import Dexie, { type Table } from 'dexie';

const DB_NAME = 'nexastock';
const DB_VERSION = 1;

class NexaStockDB extends Dexie {
  cache!: Table<{ key: string; value: string; timestamp: number }>;

  constructor() {
    super(DB_NAME);
    this.version(DB_VERSION).stores({
      cache: 'key',
    });
  }
}

let db: NexaStockDB | null = null;

function getDb(): NexaStockDB {
  if (!db) {
    db = new NexaStockDB();
  }
  return db;
}

export async function setItem(key: string, value: string): Promise<void> {
  try {
    await getDb().cache.put({ key, value, timestamp: Date.now() });
  } catch {
    localStorage.setItem(key, value);
  }
}

export async function getItem(key: string): Promise<string | null> {
  try {
    const entry = await getDb().cache.get(key);
    return entry?.value ?? null;
  } catch {
    return localStorage.getItem(key);
  }
}

export async function removeItem(key: string): Promise<void> {
  try {
    await getDb().cache.delete(key);
  } catch {
    localStorage.removeItem(key);
  }
}

export async function clear(): Promise<void> {
  try {
    await getDb().cache.clear();
  } catch {
    localStorage.clear();
  }
}

export async function getAllKeys(): Promise<string[]> {
  try {
    const entries = await getDb().cache.toArray();
    return entries.map(e => e.key);
  } catch {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }
    return keys;
  }
}
