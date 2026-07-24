import type { DBState } from '../types';

export async function fetchServerState(): Promise<DBState> {
  const res = await fetch('/api/sync');
  if (!res.ok) {
    throw new Error('Server sync failed');
  }
  return res.json() as Promise<DBState>;
}

export async function syncWithServer(db: DBState): Promise<DBState> {
  const token = localStorage.getItem('nexastock_token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch('/api/sync', {
    method: 'POST',
    headers,
    body: JSON.stringify(db)
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || 'Sync request failed');
  }
  return res.json() as Promise<DBState>;
}
