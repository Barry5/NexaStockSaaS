export type SyncOperation = 'CREATE' | 'UPDATE' | 'DELETE';
export type SyncStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type SyncDirection = 'up' | 'down' | 'both';

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

export interface SyncTracking {
  id: string;
  table_name: string;
  last_sync_at: string;
  last_sync_version: number;
  device_id: string | null;
  company_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SyncResult {
  direction: SyncDirection;
  upResult?: {
    pushed: number;
    failed: number;
    errors: string[];
  };
  downResult?: {
    pulled: number;
    errors: string[];
  };
  timestamp: string;
  duration: number;
}

export interface SyncStatusInfo {
  online: boolean;
  pendingCount: number;
  failedCount: number;
  isRunning: boolean;
  isConfigured: boolean;
}

export interface WorkerStatusInfo {
  running: boolean;
  online: boolean;
  cycleCount: number;
  lastRunAt: string | null;
  lastResult: string;
  uptime: number;
  pendingCount: number;
  failedCount: number;
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

export interface PendingChangesByTable {
  table_name: string;
  create: number;
  update: number;
  delete: number;
}

export interface PendingDeletionsByTable {
  table_name: string;
  count: number;
}

export interface PendingChangesSummary {
  changelogCount: number;
  changelogByTable: PendingChangesByTable[];
  deletionCount: number;
  deletionsByTable: PendingDeletionsByTable[];
}

export interface SyncOverview {
  service: SyncStatusInfo;
  worker: WorkerStatusInfo;
  queueSummary: SyncQueueSummary;
  pendingChanges: PendingChangesSummary;
  lastSyncTimestamps: Array<{ table_name: string; last_sync_at: string | null }>;
}

export interface ConflictInfo {
  recordId: string;
  tableName: string;
  localVersion: number;
  remoteVersion: number;
  strategyUsed: string;
  conflicts: string[];
  resolvedAt: string;
}

export interface MigrationProgress {
  table: string;
  total: number;
  migrated: number;
  errors: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
}

export interface MigrationResult {
  success: boolean;
  results: MigrationProgress[];
  totalMigrated: number;
  totalErrors: number;
}
