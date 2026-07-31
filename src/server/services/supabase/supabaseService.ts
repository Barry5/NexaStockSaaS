import { createClient } from '@supabase/supabase-js';

let adminClient: any = null;
let anonClient: any = null;

function getSupabaseUrl(): string {
  return process.env.SUPABASE_URL || '';
}

function getServiceKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

function getAnonKey(): string {
  return process.env.SUPABASE_ANON_KEY || '';
}

export function getAdminClient(): any {
  if (!adminClient) {
    const url = getSupabaseUrl();
    const key = getServiceKey();
    if (!url || !key) {
      throw new Error('Supabase non configurÃ©. VÃ©rifiez SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY');
    }
    adminClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: 'public' },
    });
  }
  return adminClient;
}

export function getClient(): any {
  if (!anonClient) {
    const url = getSupabaseUrl();
    const key = getAnonKey();
    if (!url || !key) {
      throw new Error('Supabase non configurÃ©. VÃ©rifiez SUPABASE_URL et SUPABASE_ANON_KEY');
    }
    anonClient = createClient(url, key, {
      db: { schema: 'public' },
    });
  }
  return anonClient;
}

export function isSupabaseConfigured(): boolean {
  const url = getSupabaseUrl();
  return !!(url && (getServiceKey() || getAnonKey()));
}

export async function checkConnection(): Promise<boolean> {
  try {
    if (!isSupabaseConfigured()) {
      console.log('[SUPABASE] Configuration manquante (SUPABASE_URL ou clÃ©s absent(e)s).');
      return false;
    }
    const { data, error } = await getAdminClient()
      .from('tenants')
      .select('id')
      .limit(1);

    if (error) {
      console.error('[SUPABASE] Erreur de test de connexion (tenants):', error.message);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error('[SUPABASE] Exception lors du test de connexion:', err?.message || err);
    return false;
  }
}

export async function batchUpsert<T extends Record<string, unknown>>(
  table: string,
  records: T[],
  conflictColumn: string = 'id'
): Promise<{ success: number; errors: string[] }> {
  if (records.length === 0) return { success: 0, errors: [] };
  const client = getAdminClient();
  const batchSize = 50;
  let success = 0;
  const errors: string[] = [];

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error } = await client
      .from(table)
      .upsert(batch, { onConflict: conflictColumn, ignoreDuplicates: false });

    if (error) {
      errors.push(`Batch ${i / batchSize}: ${error.message}`);
    } else {
      success += batch.length;
    }
  }

  return { success, errors };
}

export async function batchDelete(
  table: string,
  ids: string[],
  idColumn: string = 'id'
): Promise<{ success: number; errors: string[] }> {
  if (ids.length === 0) return { success: 0, errors: [] };
  const client = getAdminClient();
  const batchSize = 50;
  let success = 0;
  const errors: string[] = [];

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const { error } = await client
      .from(table)
      .delete()
      .in(idColumn, batch);

    if (error) {
      errors.push(`Batch delete ${i / batchSize}: ${error.message}`);
    } else {
      success += batch.length;
    }
  }

  return { success, errors };
}

export async function getChangesSince(
  table: string,
  since: string,
  limit: number = 100,
  offset: number = 0,
): Promise<{ data: any[] | null; error: any }> {
  const client = getAdminClient();
  return client
    .from(table)
    .select('*')
    .gte('updated_at', since)
    .order('updated_at', { ascending: true })
    .range(offset, offset + limit - 1);
}

// Variante pour les tables dont le schéma PG n'a pas de colonne updated_at
// (module_definitions, tenant_modules, permissions, role_permissions, user_roles,
//  audit_logs, invoice_audit_log, commission_audit, delivery_note_audit).
// On utilise created_at comme horodatage de modification. Cela capture les
// nouveaux enregistrements mais pas les UPDATEs (ces tables sont quasi-statiques).
export async function getChangesSinceByCreatedAt(
  table: string,
  since: string,
  limit: number = 100,
  offset: number = 0,
): Promise<{ data: any[] | null; error: any }> {
  const client = getAdminClient();
  return client
    .from(table)
    .select('*')
    .gte('created_at', since)
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1);
}
