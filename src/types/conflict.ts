export type ConflictStrategy = 'last_write_wins' | 'local_wins' | 'remote_wins' | 'manual';

export interface ConflictRecord {
  id: string;
  [key: string]: unknown;
}

export interface ConflictResolution {
  strategy: ConflictStrategy;
  mergedRecord: ConflictRecord;
  winner: 'local' | 'remote';
  conflicts: string[];
}

export interface ConflictEvent {
  type: 'conflict_detected' | 'conflict_resolved' | 'conflict_skipped';
  tableName: string;
  recordId: string;
  local: ConflictRecord;
  remote: ConflictRecord;
  resolution?: ConflictResolution;
  timestamp: string;
}
