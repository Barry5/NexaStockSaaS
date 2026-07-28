export type ConflictStrategy = 'last_write_wins' | 'local_wins' | 'remote_wins' | 'manual';

export interface ConflictRecord {
  id: string;
  [key: string]: unknown;
}

export interface ConflictInfo {
  recordId: string;
  tableName: string;
  local: ConflictRecord;
  remote: ConflictRecord;
  localVersion: number;
  remoteVersion: number;
  strategyUsed: ConflictStrategy;
  resolved: ConflictRecord;
  resolvedAt: string;
}

export interface ConflictResolution {
  strategy: ConflictStrategy;
  mergedRecord: ConflictRecord;
  winner: 'local' | 'remote';
  conflicts: string[];
}

export class ConflictResolver {
  constructor(private defaultStrategy: ConflictStrategy = 'last_write_wins') {}

  resolve(
    local: ConflictRecord,
    remote: ConflictRecord,
    strategy?: ConflictStrategy
  ): ConflictResolution {
    const effectiveStrategy = strategy || this.defaultStrategy;
    const localVersion = (local.version as number) || 0;
    const remoteVersion = (remote.version as number) || 0;
    const localUpdated = local.updated_at as string || local.created_at as string || '';
    const remoteUpdated = remote.updated_at as string || remote.created_at as string || '';

    const conflictingFields = this.findConflicts(local, remote);
    let winner: 'local' | 'remote';
    let mergedRecord: ConflictRecord;

    switch (effectiveStrategy) {
      case 'local_wins':
        winner = 'local';
        mergedRecord = { ...remote, ...local };
        break;

      case 'remote_wins':
        winner = 'remote';
        mergedRecord = { ...local, ...remote };
        break;

      case 'last_write_wins':
        if (localVersion > remoteVersion) {
          winner = 'local';
          mergedRecord = { ...remote, ...local };
        } else if (remoteVersion > localVersion) {
          winner = 'remote';
          mergedRecord = { ...local, ...remote };
        } else if (localUpdated > remoteUpdated) {
          winner = 'local';
          mergedRecord = { ...remote, ...local };
        } else {
          winner = 'remote';
          mergedRecord = { ...local, ...remote };
        }
        break;

      case 'manual':
        winner = 'local';
        mergedRecord = { ...local };
        break;

      default:
        winner = 'remote';
        mergedRecord = { ...local, ...remote };
    }

    mergedRecord.version = Math.max(localVersion, remoteVersion) + 1;
    mergedRecord.resolved_at = new Date().toISOString();
    mergedRecord.conflict_resolved = true;

    return {
      strategy: effectiveStrategy,
      mergedRecord,
      winner,
      conflicts: conflictingFields,
    };
  }

  private findConflicts(local: ConflictRecord, remote: ConflictRecord): string[] {
    const conflicts: string[] = [];
    const skipFields = new Set([
      'id', 'version', 'updated_at', 'created_at',
      'sync_status', 'device_id', 'legacy_id',
      'resolved_at', 'conflict_resolved',
    ]);

    const allKeys = new Set([...Object.keys(local), ...Object.keys(remote)]);

    for (const key of allKeys) {
      if (skipFields.has(key)) continue;
      const lv = local[key];
      const rv = remote[key];
      if (JSON.stringify(lv) !== JSON.stringify(rv)) {
        conflicts.push(key);
      }
    }

    return conflicts;
  }

  needsManualResolution(local: ConflictRecord, remote: ConflictRecord): boolean {
    const localVersion = (local.version as number) || 0;
    const remoteVersion = (remote.version as number) || 0;
    const conflicts = this.findConflicts(local, remote);

    if (conflicts.length === 0) return false;
    if (localVersion === remoteVersion && conflicts.length > 0) return true;

    return false;
  }
}

export const defaultConflictResolver = new ConflictResolver('last_write_wins');
