export interface Repository<T> {
  getAll(tenantId?: string): T[];
  getById(id: string): T | undefined;
  create(data: Partial<T>): T;
  update(id: string, data: Partial<T>): T | null;
  delete(id: string): boolean;
  count(tenantId?: string): number;
}

export interface Syncable {
  sync_status?: string;
  version?: number;
  device_id?: string;
  legacy_id?: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string;
}

export interface HasTenant {
  tenant_id?: string;
  tenantId?: string;
}
