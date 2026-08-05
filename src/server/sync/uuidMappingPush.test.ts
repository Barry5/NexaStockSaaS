import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Reproduction du bug "5 échecs pricing_plans" : une ligne déjà présente côté
// PG (ex: forfait seedé poussé depuis un autre appareil) pour laquelle le
// mapping local sync_uuid_map est absent. Avant le correctif, getOrCreateUuid
// fabriquait un NOUVEL uuid => l'upsert (onConflict: 'id') devenait un INSERT en
// doublon de legacy_id => "duplicate key value violates unique constraint
// idx_pricing_plans_legacy_id_unique" => dead-letter. Le correctif réaligne le
// mapping par SELECT id WHERE legacy_id = ? AVANT le push.
const PG_UUID = '11111111-2222-3333-4444-555555555555';

let tempDir: string;
let db: any;
let syncService: any;
let syncEngine: any;

const mockBatchUpsert = vi.fn(async (_table: string, records: any[]) => ({ success: records.length, errors: [] }));
const ensureCalls: string[] = [];

vi.mock('../services/supabase/supabaseService.js', async (importOriginal) => {
  const original: any = await importOriginal();
  // recordUuidMapping vient de transform.js (réel, écrit dans la DB temp) :
  // il n'est PAS exporté par supabaseService, d'où l'import dédié.
  const { recordUuidMapping } = await import('../services/supabase/transform.js');
  // PG simulé : SELECT id WHERE legacy_id = 'plan-fix' -> l'UUID déjà en base.
  const maybeSingle = vi.fn(async () => ({ data: { id: PG_UUID }, error: null }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select, upsert: mockBatchUpsert }));
  const mockGetAdminClient = vi.fn(() => ({ from }));
  // ensureUuidMappingForPush est mockée dans la factory (réplique de la logique
  // prod) car la version originale capture le VRAI getAdminClient par closure,
  // non interceptable par le mock ci-dessus. NB: la closure ne peut PAS viser la
  // propriété `getAdminClient` de l'objet retourné (undefined) => variable.
  const mockEnsureUuidMappingForPush = async (tableName: string, rawRecordId: string) => {
    ensureCalls.push(`${tableName}/${rawRecordId}`);
    try {
      const client = mockGetAdminClient();
      const { data, error } = await client
        .from(tableName)
        .select('id')
        .eq('legacy_id', rawRecordId)
        .maybeSingle();
      if (!error && data?.id) recordUuidMapping(rawRecordId, data.id);
    } catch { /* best-effort */ }
  };
  return {
    ...original,
    batchUpsert: mockBatchUpsert,
    checkConnection: vi.fn(async () => true),
    isSupabaseConfigured: vi.fn(() => true),
    getAdminClient: mockGetAdminClient,
    ensureUuidMappingForPush: mockEnsureUuidMappingForPush,
    getChangesSince: vi.fn(async () => ({ data: [], error: null })),
    getChangesSinceByCreatedAt: vi.fn(async () => ({ data: [], error: null })),
  };
});

describe('Alignement du mapping UUID avant push (régression pricing_plans)', () => {
  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexastock-uuid-push-'));
    process.env.DB_PATH = path.join(tempDir, 'database.db');

    const dbModule = await import('../database/db.js');
    db = dbModule.default;
    const init = await import('../database/init.js');
    init.initializeDatabase();

    ({ syncService } = await import('./syncService.js'));
    ({ syncEngine } = await import('./syncEngine.js'));
  });

  afterAll(() => {
    try { db?.close(); } catch { /* ignore */ }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('un push de pricing_plans sans mapping local cible l\'UUID PG existant (pas de doublon)', async () => {
    const planId = 'plan-fix';

    db.prepare(`INSERT OR IGNORE INTO pricing_plans (id, name, price, color) VALUES (?, ?, ?, ?)`)
      .run(planId, 'Plan Fix', 10, 'red');
    // Aucun mapping sync_uuid_map pour cette ligne : scénario de l'appareil
    // qui n'a jamais pullé les plans seedés depuis Supabase.
    db.prepare(`DELETE FROM sync_uuid_map WHERE sqlite_id = ?`).run(planId);
    db.prepare(`UPDATE pricing_plans SET price = 42 WHERE id = ?`).run(planId);

    db.prepare('DELETE FROM sync_changelog').run();
    mockBatchUpsert.mockClear();

    syncEngine.logChange('pricing_plans', planId, 'UPDATE', { id: planId, price: 42 });

    const result = await syncService.syncUpFromChangelog();

    // L'alignement du mapping doit avoir été déclenché pour cette ligne.
    expect(ensureCalls).toContain(`pricing_plans/${planId}`);
    expect(result.failed).toBe(0);
    expect(mockBatchUpsert).toHaveBeenCalledOnce();
    const [table, records] = mockBatchUpsert.mock.calls[0];
    expect(table).toBe('pricing_plans');
    expect(records[0].legacy_id).toBe(planId);
    // Crucial : l'upsert doit CIBLER l'UUID déjà présent en PG (UPDATE via
    // onConflict: 'id'), et non un nouvel uuid généré (qui provoquerait un
    // INSERT en doublon de legacy_id -> unique index 002).
    expect(records[0].id).toBe(PG_UUID);

    // En prime, le mapping est désormais enregistré localement.
    const mapping = db.prepare('SELECT pg_uuid FROM sync_uuid_map WHERE sqlite_id = ?').get(planId) as any;
    expect(mapping?.pg_uuid).toBe(PG_UUID);
  });
});