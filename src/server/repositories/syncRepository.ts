import { LocalRepository } from './localRepository.js';
import { RemoteRepository } from './remoteRepository.js';
import { syncService } from '../sync/syncService.js';
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

    this.triggerBackgroundSync();
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

    if (record) {
      this.triggerBackgroundSync();
    }
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

    this.triggerBackgroundSync();
    return result;
  }

  hardDelete(id: string): boolean {
    return this.local.hardDelete(id);
  }

  count(tenantId?: string): number {
    return this.local.count(tenantId);
  }

  private triggerBackgroundSync() {
    if (syncService.isOnline()) {
      syncService.syncUpFromChangelog().catch(() => {});
    }
  }
}
