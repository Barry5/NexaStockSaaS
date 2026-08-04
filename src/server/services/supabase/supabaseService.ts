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
      throw new Error('Supabase non configuré. Vérifiez SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY');
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
      throw new Error('Supabase non configuré. Vérifiez SUPABASE_URL et SUPABASE_ANON_KEY');
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
      console.log('[SUPABASE] Configuration manquante (SUPABASE_URL ou clés absent(e)s).');
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

// Curseur de pagination keyset : (updated_at, id) du DERNIER record de la page
// précédente. Évite de sauter des records quand plusieurs lignes partagent le
// même updated_at (trigger NOW() par batch d'upsert) — cf. Phase 2 du plan.
export interface PullCursor {
  updatedAt: string;
  id: string;
}

export async function getChangesSince(
  table: string,
  since: string,
  limit: number = 100,
  cursor?: PullCursor,
): Promise<{ data: any[] | null; error: any }> {
  const client = getAdminClient();
  let query = client
    .from(table)
    .select('*')
    .limit(limit)
    .order('updated_at', { ascending: true })
    .order('id', { ascending: true });

  if (cursor && cursor.updatedAt && cursor.id) {
    // Page suivante : (updated_at > cursor) OR (updated_at = cursor AND id > cursorId)
    query = query.or(`and(updated_at.eq.${cursor.updatedAt},id.gt.${cursor.id}),updated_at.gt.${cursor.updatedAt}`);
  } else {
    query = query.gt('updated_at', since);
  }

  return query;
}

// Variante pour les tables dont le schéma PG n'a pas de colonne updated_at
// (RBAC/audit) : curseur sur (created_at, id). Capture les nouveaux
// enregistrements; les UPDATEs de ces tables quasi-statiques sont alignés par
// fullPull ou réconciliation.
export async function getChangesSinceByCreatedAt(
  table: string,
  since: string,
  limit: number = 100,
  cursor?: PullCursor,
): Promise<{ data: any[] | null; error: any }> {
  const client = getAdminClient();
  let query = client
    .from(table)
    .select('*')
    .limit(limit)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (cursor && cursor.updatedAt && cursor.id) {
    query = query.or(`and(created_at.eq.${cursor.updatedAt},id.gt.${cursor.id}),created_at.gt.${cursor.updatedAt}`);
  } else {
    query = query.gt('created_at', since);
  }

  return query;
}

export async function countRemoteRows(
  table: string,
): Promise<{ count: number | null; error: any }> {
  const client = getAdminClient();
  const { count, error } = await client
    .from(table)
    .select('id', { count: 'exact', head: true });
  return { count, error };
}

export async function fetchAllLegacyIds(
  table: string,
  pageSize: number = 1000,
): Promise<{ ids: string[]; error: any }> {
  const client = getAdminClient();
  const ids: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await client
      .from(table)
      .select('legacy_id')
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) return { ids, error };
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (r.legacy_id) ids.push(r.legacy_id);
    }
    offset += data.length;
    if (data.length < pageSize) break;
  }

  return { ids, error: null };
}
