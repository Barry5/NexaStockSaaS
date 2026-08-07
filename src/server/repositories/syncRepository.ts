import { LocalRepository } from './localRepository.js';
import { RemoteRepository } from './remoteRepository.js';
import { syncEngine } from '../sync/syncEngine.js';
import type { Syncable } from './baseRepository.js';
import type { SyncOperation } from '../sync/syncQueue.js';

export class SyncRepository<T extends Syncable> {
  public local: LocalRepository<T>;
  public remote: RemoteRepository<T>;

  constructor(
    protected tableName: string,
    protected idColumn: string = 'id'
  ) {
    this.local = new LocalRepository<T>(tableName, idColumn);
    this.remote = new RemoteRepository<T>(tableName, idColumn);
  }

  getAll(tenantId?: string): T[] {
    return this.local.getAll(tenantId);
  }

  getById(id: string): T | undefined {
    return this.local.getById(id);
  }

  create(data: Partial<T>, companyId?: string, deviceId?: string): T {
    const record = this.local.transaction(() => {
      const newRecord = this.local.create(data);

      syncEngine.logChange(
        this.tableName,
        (newRecord as any)[this.idColumn],
        'CREATE',
        newRecord as unknown as Record<string, unknown>,
        companyId,
        deviceId
      );
      return newRecord;
    });

    // Le SupabaseWorker (15 s) est l'UNIQUE planificateur : plus de
    // syncUpFromChangelog fire-and-forget ici (audit §6.2/14.6). Le logChange
    // ci-dessus alimente le changelog ; le worker pousse ensuite vers PG.
    return record;
  }

  update(id: string, data: Partial<T>, companyId?: string, deviceId?: string): T | null {
    const record = this.local.transaction(() => {
      const updatedRecord = this.local.update(id, data);
      if (!updatedRecord) return null;

      syncEngine.logChange(
        this.tableName,
        id,
        'UPDATE',
        updatedRecord as unknown as Record<string, unknown>,
        companyId,
        deviceId
      );
      return updatedRecord;
    });

    return record;
  }

  delete(id: string, companyId?: string, deviceId?: string): boolean {
    const existing = this.local.getById(id);
    if (!existing) return false;

    const result = this.local.delete(id);

    syncEngine.logChange(
      this.tableName,
      id,
      'DELETE',
      existing as unknown as Record<string, unknown>,
      companyId,
      deviceId
    );

    return result;
  }

  hardDelete(id: string): boolean {
    return this.local.hardDelete(id);
  }

  count(tenantId?: string): number {
    return this.local.count(tenantId);
  }
}
