import db from '../database/db.js';
import { v4 as uuidv4 } from 'uuid';
import { SYNC_TABLE_SET, SYNC_TABLES, tablePriorityCase } from './syncTables.js';
import { tenantWhereClause } from './tenantScope.js';

// Nombre maximal de tentatives de push d'une entrée du changelog avant de la
// passer en dead-letter (status = 'dead'). Visible via /api/sync/failed.
export const CHANGELOG_MAX_RETRIES = 10;

export type SyncOperation = 'CREATE' | 'UPDATE' | 'DELETE';

export interface SyncChange {
  table: string;
  recordId: string;
  operation: SyncOperation;
  data: Record<string, unknown>;
  version?: number;
  deviceId?: string;
  companyId?: string;
}

export interface SyncConflict {
  table: string;
  recordId: string;
  clientVersion: number;
  serverVersion: number;
  clientData: Record<string, unknown>;
  serverData: Record<string, unknown>;
  resolvedData: Record<string, unknown>;
  strategy: string;
}

export interface PushResult {
  applied: number;
  conflicts: SyncConflict[];
  errors: { table: string; recordId: string; error: string }[];
}

export interface PullResult {
  changes: Record<string, unknown[]>;
  deletions: Record<string, string[]>;
  timestamp: string;
}

export class SyncEngine {
  recordChange(
    tableName: string,
    recordId: string,
    operation: SyncOperation,
    oldValues: Record<string, unknown> | null,
    newValues: Record<string, unknown> | null,
    oldVersion: number | null,
    newVersion: number,
    companyId?: string,
    deviceId?: string,
  ): string {
    const id = `chg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO sync_changelog (id, table_name, record_id, operation, old_values, new_values, old_version, new_version, created_at, device_id, company_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, tableName, recordId, operation,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      oldVersion, newVersion, now,
      deviceId || null, companyId || null,
    );

    return id;
  }

  // Pipeline unique de synchronisation (Phase 1) : journalise un changement
  // dans sync_changelog (+ tombstone sync_deletions pour les DELETEs) SANS
  // passer par sync_queue. Appelé par les services métier (baseService).
  // Atomicité : version + updatedAt de la ligne locale sont mis à jour dans la
  // même transaction SQLite que l'entrée du changelog.
  logChange(
    tableName: string,
    recordId: string,
    operation: SyncOperation,
    payload?: Record<string, unknown> | null,
    companyId?: string,
    deviceId?: string,
  ): string {
    const id = `chg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date().toISOString();

    const transaction = db.transaction(() => {
      const existing = this.getRecord(tableName, recordId);
      const currentVersion = existing ? (existing.version as number) || 0 : 0;
      const nextVersion = currentVersion + 1;

      if (operation !== 'DELETE' && existing) {
        try {
          db.prepare(`UPDATE ${tableName} SET version = ?, updatedAt = ? WHERE id = ?`).run(nextVersion, now, recordId);
        } catch {
          // Table sans colonne version/updatedAt (RBAC) : la version reste
          // gérée côté changelog + triggers PostgreSQL.
        }
      }

      db.prepare(`
        INSERT INTO sync_changelog (id, table_name, record_id, operation, old_values, new_values, old_version, new_version, created_at, device_id, company_id, retry_count, max_retries, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'pending')
      `).run(
        id, tableName, recordId, operation,
        existing ? JSON.stringify(existing) : null,
        payload ? JSON.stringify(payload) : null,
        currentVersion, nextVersion, now,
        deviceId || null, companyId || null,
        CHANGELOG_MAX_RETRIES,
      );

      if (operation === 'DELETE') {
        db.prepare(`INSERT OR REPLACE INTO sync_deletions (id, table_name, record_id, deleted_at, company_id) VALUES (?, ?, ?, ?, ?)`).run(
          `del-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, tableName, recordId, now, companyId || null,
        );
      }
    });
    transaction();
    return id;
  }

  getCurrentVersion(tableName: string, recordId: string): number {
    try {
      const row = db.prepare(`SELECT version FROM ${tableName} WHERE id = ?`).get(recordId) as { version: number } | undefined;
      return row?.version || 0;
    } catch {
      return 0;
    }
  }

  incrementVersion(tableName: string, recordId: string): number {
    const current = this.getCurrentVersion(tableName, recordId);
    const next = current + 1;
    try {
      db.prepare(`UPDATE ${tableName} SET version = ?, updatedAt = ? WHERE id = ?`).run(next, new Date().toISOString(), recordId);
    } catch {}
    return next;
  }

  pushChanges(changes: SyncChange[]): PushResult {
    const result: PushResult = { applied: 0, conflicts: [], errors: [] };

    const transaction = db.transaction(() => {
      for (const change of changes) {
        try {
          const { table, recordId, operation, data, version, deviceId, companyId } = change;

          if (!SYNC_TABLE_SET.has(table)) {
            result.errors.push({ table, recordId, error: `Table ${table} non autorisée` });
            continue;
          }

          const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
          const colNames = new Set(cols.map(c => c.name));

          if (operation === 'DELETE') {
            // IMPORTANT: toujours enregistrer le DELETE dans sync_changelog + sync_deletions,
            // même si l'enregistrement n'existe plus localement. Sinon le worker ne le
            // propagera jamais vers Supabase -> ligne fantôme persistante côté PG.
            const existing = this.getRecord(table, recordId);
            const currentVersion = existing ? (existing.version as number) || 0 : 0;
            const oldValues = (existing || data) as Record<string, unknown>;

            this.recordChange(table, recordId, 'DELETE', oldValues, null, currentVersion, currentVersion + 1, companyId, deviceId);
            db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(recordId);
            db.prepare(`INSERT OR REPLACE INTO sync_deletions (id, table_name, record_id, deleted_at, company_id) VALUES (?, ?, ?, ?, ?)`).run(
              `del-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, table, recordId, new Date().toISOString(), companyId || null,
            );
            result.applied++;
            continue;
          }

          const existing = this.getRecord(table, recordId);
          const serverVersion = existing ? (existing.version as number) || 0 : 0;
          const clientVersion = version || 0;

          if (operation === 'CREATE') {
            if (existing) {
              if (clientVersion > 0 && serverVersion > 0 && clientVersion < serverVersion) {
                // Snapshot périmé : l'état local (plus récent) gagne. Rien n'est
                // appliqué, le conflit est journalisé pour le superadmin.
                const conflict = this.buildConflict(table, recordId, clientVersion, serverVersion, data, existing as Record<string, unknown>, 'server_wins');
                conflict.resolvedData = existing as Record<string, unknown>;
                result.conflicts.push(conflict);
                this.persistConflict(conflict);
                result.applied++;
                continue;
              }
              const conflict = this.buildConflict(table, recordId, clientVersion, serverVersion, data, existing as Record<string, unknown>);
              const resolved = this.resolveConflict('remote_wins', data, existing as Record<string, unknown>);
              conflict.resolvedData = resolved;
              result.conflicts.push(conflict);
              this.persistConflict(conflict);
              // La version locale doit suivre : sinon `version` retombe à sa
              // valeur par défaut (1) et le LWW par version est invalidé.
              this.recordChange(table, recordId, 'UPDATE', existing as Record<string, unknown>, resolved, serverVersion, serverVersion + 1, companyId, deviceId);
              this.applyRecord(table, colNames, recordId, { ...resolved, version: serverVersion + 1 });
              result.applied++;
              continue;
            }
            const record = { ...data, id: recordId, version: 1, updatedAt: new Date().toISOString() };
            this.applyRecord(table, colNames, recordId, record);
            this.recordChange(table, recordId, 'CREATE', null, record, null, 1, companyId, deviceId);
            result.applied++;
            continue;
          }

          if (operation === 'UPDATE') {
            if (!existing) {
              // §3.3-3 / §6.6 : un UPDATE client ne doit PAS ressusciter un
              // record localement supprimé dont la tombstone n'est pas encore
              // propagée (sinon : cycle DELETE->pull->re-création instable).
              const tombstone = db.prepare(`
                SELECT 1 FROM sync_deletions
                WHERE table_name = ? AND record_id = ? AND pushed_to_supabase = 0
              `).get(table, recordId);
              if (tombstone) {
                const conflict = this.buildConflict(table, recordId, clientVersion, clientVersion + 1, data, {}, 'server_wins');
                conflict.resolvedData = {};
                result.conflicts.push(conflict);
                this.persistConflict(conflict);
                result.applied++;
                continue;
              }
              const record = { ...data, id: recordId, version: 1, updatedAt: new Date().toISOString() };
              this.applyRecord(table, colNames, recordId, record);
              this.recordChange(table, recordId, 'CREATE', null, record, null, 1, companyId, deviceId);
              result.applied++;
              continue;
            }

            if (clientVersion > 0 && serverVersion > 0 && clientVersion < serverVersion) {
              // Snapshot périmé (LWW par version) : l'état local plus récent
              // gagne. Aucun écrasement, conflit journalisé côté serveur.
              const conflict = this.buildConflict(table, recordId, clientVersion, serverVersion, data, existing as Record<string, unknown>, 'server_wins');
              conflict.resolvedData = existing as Record<string, unknown>;
              result.conflicts.push(conflict);
              this.persistConflict(conflict);
              result.applied++;
              continue;
            }

            const oldVals = existing as Record<string, unknown>;
            const newVals = { ...oldVals, ...data };
            const nextVersion = Math.max(clientVersion, serverVersion) + 1;
            this.recordChange(table, recordId, 'UPDATE', oldVals, newVals, serverVersion, nextVersion, companyId, deviceId);
            this.applyRecord(table, colNames, recordId, { ...newVals, version: nextVersion });
            result.applied++;
          }
        } catch (err: any) {
          result.errors.push({ table: change.table, recordId: change.recordId, error: err.message });
        }
      }
    });

    transaction();
    return result;
  }

  // Pull client. `tenantScope` (tenantId de l'utilisateur, null = superadmin) :
  // chaque table est filtrée par tenant (colonne directe ou via le parent),
  // les tables globales restent partagées (config SaaS / RBAC).
  pullChanges(since: string, tableName?: string, tenantScope?: string | null): PullResult {
    const result: PullResult = { changes: {}, deletions: {}, timestamp: new Date().toISOString() };
    const tables = tableName ? [tableName] : SYNC_TABLES;

    for (const table of tables) {
      try {
        const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
        const colNames = cols.map(c => c.name);
        const hasUpdatedAt = colNames.includes('updatedAt');
        const hasCreatedAt = colNames.includes('createdAt');
        const scope = tenantScope ? tenantWhereClause(table, tenantScope) : null;
        const scopeSql = scope && scope.clause ? ` AND ${scope.clause}` : '';
        const scopeParams = scope?.params ?? [];

        if (hasUpdatedAt) {
          result.changes[table] = db.prepare(`SELECT * FROM ${table} WHERE updatedAt >= ?${scopeSql}`).all(since, ...scopeParams);
        } else if (hasCreatedAt) {
          result.changes[table] = db.prepare(`SELECT * FROM ${table} WHERE createdAt >= ?${scopeSql}`).all(since, ...scopeParams);
        } else {
          result.changes[table] = [];
        }

        result.deletions[table] = (db.prepare(`
          SELECT record_id FROM sync_deletions WHERE table_name = ? AND deleted_at >= ?
        `).all(table, since) as { record_id: string }[]).map(r => r.record_id);
      } catch (err: any) {
        result.changes[table] = [];
        result.deletions[table] = [];
      }
    }

    return result;
  }

  getChangesForSupabase(): { changeId: string; table: string; recordId: string; operation: string; data: string }[] {
    // Retry borné : seuls les items 'pending'/'failed' avec retry_count <
    // max_retries sont rejoués. Au-delà -> status 'dead' (dead-letter).
    const items = db.prepare(`
      SELECT c.* FROM sync_changelog c
      WHERE c.pushed_to_supabase = 0
        AND c.status != 'dead'
        AND c.retry_count < c.max_retries
      ORDER BY ${tablePriorityCase('c.table_name')}, c.created_at ASC
      LIMIT 200
    `).all() as any[];

    return items.map(item => ({
      changeId: item.id,
      table: item.table_name,
      recordId: item.record_id,
      operation: item.operation,
      data: item.new_values || item.old_values || '',
    }));
  }

  markPushedToSupabase(ids: string[]) {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(', ');
    db.prepare(`UPDATE sync_changelog SET pushed_to_supabase = 1, status = 'pushed' WHERE id IN (${placeholders})`).run(...ids);
  }

  // ✔ P3 : marque les tombstones sync_deletions comme propagées après un
  // DELETE poussé vers Supabase. Sans cela, les tombstones restaient à
  // pushed_to_supabase = 0 pour toujours : le dashboard affichait des
  // suppressions en attente fantômes et cleanupPushedRecords ne purgeait
  // jamais ces lignes (croissance infinie de la table).
  markDeletionsPushed(deleted: Array<{ tableName: string; recordId: string }>) {
    if (deleted.length === 0) return;
    const transaction = db.transaction(() => {
      for (const d of deleted) {
        db.prepare(`
          UPDATE sync_deletions SET pushed_to_supabase = 1
          WHERE table_name = ? AND record_id = ?
        `).run(d.tableName, d.recordId);
      }
    });
    transaction();
  }

  markChangeFailed(changeId: string, error?: string) {
    db.prepare(`
      UPDATE sync_changelog
      SET retry_count = retry_count + 1,
          status = CASE WHEN retry_count + 1 >= max_retries THEN 'dead' ELSE 'failed' END,
          last_error = ?
      WHERE id = ?
    `).run(error ? String(error).slice(0, 2000) : null, changeId);
  }

  resetDeadChanges(tableName?: string): number {
    if (tableName) {
      return db.prepare(`
        UPDATE sync_changelog SET status = 'pending', retry_count = 0
        WHERE status = 'dead' AND table_name = ?
      `).run(tableName).changes;
    }
    return db.prepare(`
      UPDATE sync_changelog SET status = 'pending', retry_count = 0
      WHERE status = 'dead'
    `).run().changes;
  }

  getDeadChanges(limit: number = 200): any[] {
    return db.prepare(`
      SELECT id, table_name, record_id, operation, retry_count, max_retries, status, last_error, created_at, company_id, device_id
      FROM sync_changelog
      WHERE status = 'dead'
      ORDER BY created_at ASC
      LIMIT ?
    `).all(limit) as any[];
  }

  getDeadChangeCount(): number {
    const row = db.prepare(`SELECT COUNT(*) as count FROM sync_changelog WHERE status = 'dead'`).get() as { count: number };
    return row.count;
  }

  hasPendingChangesForTable(tableName: string): boolean {
    const row = db.prepare(`
      SELECT COUNT(*) as count FROM sync_changelog
      WHERE table_name = ? AND pushed_to_supabase = 0 AND status != 'dead'
    `).get(tableName) as { count: number };
    return row.count > 0;
  }

  // Vrai si la table possède ≥ 1 changement en dead-letter non purgé. La
  // réconciliation s'en sert pour NE JAMAIS purger localement une ligne dont
  // le push a échoué définitivement (max_retries atteint) : la « réparation »
  // détruirait une donnée légitime intacte dans la dead-letter (§2.1 audit).
  hasDeadChangesForTable(tableName: string): boolean {
    const row = db.prepare(`
      SELECT COUNT(*) as count FROM sync_changelog
      WHERE table_name = ? AND status = 'dead'
    `).get(tableName) as { count: number };
    return row.count > 0;
  }

  getPendingChangesSummary(): {
    changelogCount: number;
    changelogByTable: Array<{ table_name: string; create: number; update: number; delete: number }>;
    deletionCount: number;
    deletionsByTable: Array<{ table_name: string; count: number }>;
    deadChangeCount: number;
  } {
    const changelogRows = db.prepare(`
      SELECT table_name, operation, COUNT(*) as count
      FROM sync_changelog
      WHERE pushed_to_supabase = 0 AND status != 'dead'
      GROUP BY table_name, operation
    `).all() as { table_name: string; operation: string; count: number }[];

    const changeMap = new Map<string, { table_name: string; create: number; update: number; delete: number }>();
    let changelogCount = 0;
    for (const row of changelogRows) {
      const summary = changeMap.get(row.table_name) || { table_name: row.table_name, create: 0, update: 0, delete: 0 };
      if (row.operation === 'CREATE') summary.create = row.count;
      if (row.operation === 'UPDATE') summary.update = row.count;
      if (row.operation === 'DELETE') summary.delete = row.count;
      changeMap.set(row.table_name, summary);
      changelogCount += row.count;
    }

    const deletionsRows = db.prepare(`
      SELECT table_name, COUNT(*) as count
      FROM sync_deletions
      WHERE pushed_to_supabase = 0
      GROUP BY table_name
    `).all() as { table_name: string; count: number }[];

    let deletionCount = 0;
    const deletionsByTable = deletionsRows.map(r => {
      deletionCount += r.count;
      return { table_name: r.table_name, count: r.count };
    });

    return {
      changelogCount,
      changelogByTable: Array.from(changeMap.values()).sort((a, b) => a.table_name.localeCompare(b.table_name)),
      deletionCount,
      deletionsByTable: deletionsByTable.sort((a, b) => a.table_name.localeCompare(b.table_name)),
      deadChangeCount: this.getDeadChangeCount(),
    };
  }

  // Nettoie les enregistrements de sync déjà poussés vers Supabase pour éviter
  // la croissance infinie des tables sync_changelog / sync_deletions / sync_queue.
  cleanupPushedRecords(beforeIso?: string): number {
    const cutoff = beforeIso || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    // Purge des diagnostics > 30 j : les failed (queue) et dead (changelog)
    // restent visibles via /api/sync/failed pendant 30 jours, puis sont purgés.
    const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    let removed = 0;

    const r1 = db.prepare(`DELETE FROM sync_changelog WHERE pushed_to_supabase = 1 AND created_at < ?`).run(cutoff);
    removed += r1.changes;

    const r2 = db.prepare(`DELETE FROM sync_deletions WHERE pushed_to_supabase = 1 AND deleted_at < ?`).run(cutoff);
    removed += r2.changes;

    const r3 = db.prepare(`DELETE FROM sync_queue WHERE status = 'completed' AND created_at < ?`).run(cutoff);
    removed += r3.changes;

    // Les items failed dépassant max_retries restent visibles via /api/sync/failed
    // pendant 30 jours (diagnostic), puis sont purgés.
    const r4 = db.prepare(`DELETE FROM sync_changelog WHERE status = 'dead' AND created_at < ?`).run(cutoff30d);
    removed += r4.changes;

    const r5 = db.prepare(`DELETE FROM sync_queue WHERE status = 'failed' AND created_at < ?`).run(cutoff30d);
    removed += r5.changes;

    // §8.2.1 : les conflits persistés (> 30 j) sont purgés avec les autres
    // diagnostics ; ils restent visibles via /api/sync/conflicts entre-temps.
    const r6 = db.prepare(`DELETE FROM sync_conflicts WHERE created_at < ?`).run(cutoff30d);
    removed += r6.changes;

    return removed;
  }

  private getRecord(table: string, id: string): Record<string, unknown> | undefined {
    try {
      const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
      return row;
    } catch {
      return undefined;
    }
  }

  private applyRecord(table: string, colNames: Set<string>, id: string, data: Record<string, unknown>) {
    const insertCols = ['id', ...Array.from(colNames).filter(c => c !== 'id' && c in data)];
    const placeholders = insertCols.map(() => '?').join(', ');
    const values = insertCols.map(c => {
      const v = data[c];
      if (v === undefined) return null;
      if (typeof v === 'boolean') return v ? 1 : 0;
      if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
        return JSON.stringify(v);
      }
      return v;
    });

    db.prepare(`INSERT OR REPLACE INTO ${table} (${insertCols.join(', ')}) VALUES (${placeholders})`).run(...values);
  }

  private buildConflict(
    table: string, recordId: string,
    clientVersion: number, serverVersion: number,
    clientData: Record<string, unknown>, serverData: Record<string, unknown>,
    strategy: string = 'remote_wins',
  ): SyncConflict {
    return {
      table, recordId, clientVersion, serverVersion,
      clientData, serverData,
      resolvedData: {},
      strategy,
    };
  }

  // §8.2.1 audit : persiste le conflit dans sync_conflicts (supervision « qui a
  // gagné et pourquoi »). Le conflit reste aussi remonté dans PushResult.conflicts.
  private persistConflict(conflict: SyncConflict): void {
    try {
      db.prepare(`
        INSERT INTO sync_conflicts (id, table_name, record_id, client_version, server_version, client_data, server_data, resolved_data, strategy, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `confl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        conflict.table, conflict.recordId,
        conflict.clientVersion, conflict.serverVersion,
        conflict.clientData ? JSON.stringify(conflict.clientData) : null,
        conflict.serverData ? JSON.stringify(conflict.serverData) : null,
        conflict.resolvedData ? JSON.stringify(conflict.resolvedData) : null,
        conflict.strategy,
        new Date().toISOString(),
      );
    } catch (err: any) {
      // La persistance d'un conflit ne doit jamais faire échouer le push.
      console.warn(`persistConflict failed for ${conflict.table}/${conflict.recordId}: ${err.message}`);
    }
  }

  private resolveConflict(strategy: string, clientData: Record<string, unknown>, serverData: Record<string, unknown>): Record<string, unknown> {
    if (strategy === 'remote_wins') return { ...clientData, ...serverData };
    if (strategy === 'client_wins') return { ...serverData, ...clientData };
    if (strategy === 'last_write_wins') {
      const clientUpdated = clientData.updatedAt as string || '';
      const serverUpdated = serverData.updatedAt as string || '';
      return clientUpdated >= serverUpdated
        ? { ...serverData, ...clientData }
        : { ...clientData, ...serverData };
    }
    return { ...clientData, ...serverData };
  }
}

export const syncEngine = new SyncEngine();
