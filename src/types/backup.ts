export type BackupType = 'sqlite' | 'supabase';
export type BackupStatus = 'ok' | 'error' | 'verified';

export interface AdminBackupRecord {
  id: string;
  type: BackupType;
  label: string;
  createdAt: string;
  size: number;
  status: BackupStatus;
  checksum: string;
  version: string;
  baseVersion: string;
  filePath: string;
  stats: string;
  restoredAt: string | null;
  restoredFrom: string | null;
  createdBy: string;
}

export type CoherenceStatus = 'ok' | 'pending' | 'incoherent' | 'unknown';

export interface CoherenceIssue {
  type: 'local_only' | 'remote_only' | 'version_mismatch' | 'pending_delete';
  id: string;
  localVersion?: number;
  remoteVersion?: number;
  localUpdatedAt?: string;
  remoteUpdatedAt?: string;
}

export interface CoherenceTableReport {
  table: string;
  pgTable: string;
  status: CoherenceStatus;
  sqliteCount: number;
  supabaseCount: number | null;
  localOnlyCount: number;
  remoteOnlyCount: number;
  versionMismatchCount: number;
  explainedByPending: boolean;
  pendingCreates: number;
  pendingUpdates: number;
  pendingDeletes: number;
  pendingDeletionIdsCount: number;
  deadLetterCount: number;
  queueFailedCount: number;
  lastSyncAt: string | null;
  issues: CoherenceIssue[];
  cause: string;
  recommendation: string;
  action: string;
}

export interface CoherenceSummary {
  checked: number;
  ok: number;
  pending: number;
  incoherent: number;
  unknown: number;
}

export interface CoherenceReport {
  generatedAt: string;
  durationMs: number;
  supabaseReachable: boolean;
  deep: boolean;
  overall: CoherenceStatus;
  summary: CoherenceSummary;
  pendingTotal: {
    changelog: number;
    deletions: number;
    deadLetters: number;
    queueFailed: number;
  };
  conflictsCount: number;
  tables: CoherenceTableReport[];
}

export interface CoherenceQuickStatus {
  generatedAt: string;
  supabaseReachable: boolean;
  checked: number;
  coherent: number;
  pending: number;
  incoherent: number;
  unknown: number;
  pendingTotal: { changelog: number; deletions: number; deadLetters: number; queueFailed: number };
  lastBackupSqlite: { id: string; createdAt: string; size: number } | null;
  lastBackupSupabase: { id: string; createdAt: string; size: number } | null;
}

export interface RestoreReport {
  backupId: string;
  backupType: BackupType;
  startedAt: string;
  completedAt: string;
  verified: boolean;
  safetyBackupId: string | null;
  coherenceBefore: CoherenceReport | null;
  coherenceAfter: CoherenceReport | null;
  integrity: { ok: boolean; details: string } | null;
  tables: { restored: number; wiped: number };
  message: string;
  success: boolean;
}
