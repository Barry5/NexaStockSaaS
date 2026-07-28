import { getAdminClient, batchUpsert, isSupabaseConfigured } from '../services/supabase/supabaseService.js';
import type { Repository } from './baseRepository.js';
import type { Syncable } from './baseRepository.js';

export class RemoteRepository<T extends Syncable> implements Repository<T> {
  constructor(
    protected tableName: string,
    protected idColumn: string = 'id'
  ) {}

  private get client() {
    return getAdminClient();
  }

  private isConfigured(): boolean {
    return isSupabaseConfigured();
  }

  async getAll(tenantId?: string): Promise<T[]> {
    if (!this.isConfigured()) return [];

    let query = this.client.from(this.tableName).select('*');
    if (tenantId) {
      query = query.eq('company_id', tenantId);
    }
    const { data, error } = await query;
    if (error) throw new Error(`Erreur remote getAll ${this.tableName}: ${error.message}`);
    return (data || []) as unknown as T[];
  }

  async getById(id: string): Promise<T | undefined> {
    if (!this.isConfigured()) return undefined;
    const { data, error } = await this.client.from(this.tableName).select('*').eq(this.idColumn, id).maybeSingle();
    if (error) throw new Error(`Erreur remote getById ${this.tableName}: ${error.message}`);
    return data as unknown as T | undefined;
  }

  async create(data: Partial<T>): Promise<T> {
    if (!this.isConfigured()) throw new Error('Supabase non configuré');
    const now = new Date().toISOString();
    const record = {
      ...data,
      created_at: now,
      updated_at: now,
      version: 1,
    };

    const { data: result, error } = await this.client.from(this.tableName).insert(record).select().single();
    if (error) throw new Error(`Erreur remote create ${this.tableName}: ${error.message}`);
    return result as unknown as T;
  }

  async update(id: string, data: Partial<T>): Promise<T | null> {
    if (!this.isConfigured()) return null;
    const { data: result, error } = await this.client
      .from(this.tableName)
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq(this.idColumn, id)
      .select()
      .single();

    if (error) throw new Error(`Erreur remote update ${this.tableName}: ${error.message}`);
    return result as unknown as T;
  }

  async delete(id: string): Promise<boolean> {
    if (!this.isConfigured()) return false;
    const { error } = await this.client
      .from(this.tableName)
      .update({ deleted_at: new Date().toISOString() })
      .eq(this.idColumn, id);

    if (error) throw new Error(`Erreur remote delete ${this.tableName}: ${error.message}`);
    return true;
  }

  async hardDelete(id: string): Promise<boolean> {
    if (!this.isConfigured()) return false;
    const { error } = await this.client.from(this.tableName).delete().eq(this.idColumn, id);
    if (error) throw new Error(`Erreur remote hardDelete ${this.tableName}: ${error.message}`);
    return true;
  }

  async count(tenantId?: string): Promise<number> {
    if (!this.isConfigured()) return 0;
    let query = this.client.from(this.tableName).select('*', { count: 'exact', head: true });
    if (tenantId) {
      query = query.eq('company_id', tenantId);
    }
    const { count, error } = await query;
    if (error) throw new Error(`Erreur remote count ${this.tableName}: ${error.message}`);
    return count || 0;
  }

  async upsertBatch(records: Partial<T>[]): Promise<{ success: number; errors: string[] }> {
    return batchUpsert(this.tableName, records as Record<string, unknown>[], this.idColumn);
  }
}
