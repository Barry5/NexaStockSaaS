import type { AdminBackupRecord, CoherenceReport, CoherenceQuickStatus, RestoreReport } from '../types/backup';

// Client API de la Console Super Admin (Sauvegardes & Restauration, Cohérence).
// Authentification Bearer depuis le stockage local ; SERVICE_ROLE_KEY ne
// transite jamais côté client (les appels passent par le serveur Express).

export function authHeader(): Record<string, string> {
  const token = localStorage.getItem('nexastock_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Requête échouée (${res.status})`);
  return data as T;
}

export async function createSqliteBackup(label = 'Sauvegarde SQLite manuelle'): Promise<AdminBackupRecord> {
  const res = await fetch('/api/admin/backups/sqlite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ label }),
  });
  const data = await handle<{ success: boolean; backup: AdminBackupRecord }>(res);
  return data.backup;
}

export async function createSupabaseBackup(label = 'Sauvegarde Supabase manuelle'): Promise<AdminBackupRecord> {
  const res = await fetch('/api/admin/backups/supabase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ label }),
  });
  const data = await handle<{ success: boolean; backup: AdminBackupRecord }>(res);
  return data.backup;
}

export async function listManagedBackups(): Promise<AdminBackupRecord[]> {
  const res = await fetch('/api/admin/backups/managed', { headers: authHeader() });
  const data = await handle<{ success: boolean; backups: AdminBackupRecord[] }>(res);
  return data.backups;
}

export async function verifyManagedBackup(id: string): Promise<{ ok: boolean; checksumMatch: boolean; integrity: string | null; message: string }> {
  const res = await fetch(`/api/admin/backups/managed/${id}/verify`, { method: 'POST', headers: authHeader() });
  return handle<{ ok: boolean; checksumMatch: boolean; integrity: string | null; message: string }>(res);
}

export async function deleteManagedBackup(id: string): Promise<void> {
  const res = await fetch(`/api/admin/backups/managed/${id}`, { method: 'DELETE', headers: authHeader() });
  await handle(res);
}

export function downloadBackupUrl(id: string): string {
  return `/api/admin/backups/managed/${id}/download`;
}

export async function restoreSqlite(id: string): Promise<RestoreReport> {
  const res = await fetch(`/api/admin/restore/sqlite/${id}`, { method: 'POST', headers: authHeader() });
  const data = await handle<{ success: boolean; report: RestoreReport }>(res);
  return data.report;
}

export async function restoreSupabase(id: string): Promise<RestoreReport> {
  const res = await fetch(`/api/admin/restore/supabase/${id}`, { method: 'POST', headers: authHeader() });
  const data = await handle<{ success: boolean; report: RestoreReport }>(res);
  return data.report;
}

export async function runCoherenceCheck(deep = true): Promise<CoherenceReport> {
  const res = await fetch('/api/admin/coherence/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ deep }),
  });
  const data = await handle<{ success: boolean; report: CoherenceReport }>(res);
  return data.report;
}

export async function coherenceQuickStatus(): Promise<CoherenceQuickStatus> {
  const res = await fetch('/api/admin/coherence/status', { headers: authHeader() });
  const data = await handle<{ success: boolean; status: CoherenceQuickStatus }>(res);
  return data.status;
}
