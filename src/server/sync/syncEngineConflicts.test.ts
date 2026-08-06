import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tempDir: string;
let db: any;
let syncEngine: any;
const TENANT = 't-conflict-tenant';

// Donnée produit complète (NOT NULL sans défaut : sku, category, createdAt, tenantId).
function product(id: string, name: string, version = 1): any {
  return {
    table: 'products', recordId: id, operation: 'CREATE' as const,
    data: {
      id, name, sku: `SKU-${id}`, category: 'Test',
      buyPrice: 0, sellPrice: 0, quantity: 0, alertThreshold: 5,
      tenantId: TENANT, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
    version,
  };
}

describe('syncEngine : persistance des conflits + garde-fou résurrection (audit §8.2.1 / §3.3-3)', () => {
  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexastock-sync-conflicts-'));
    process.env.DB_PATH = path.join(tempDir, 'database.db');

    const dbModule = await import('../database/db.js');
    db = dbModule.default;
    const init = await import('../database/init.js');
    init.initializeDatabase();

    db.prepare(`INSERT OR IGNORE INTO tenants (id, name, createdAt) VALUES (?, ?, ?)`)
      .run(TENANT, 'Tenant de test', new Date().toISOString());

    ({ syncEngine } = await import('./syncEngine.js'));
  });

  afterAll(() => {
    try { db?.close(); } catch { /* ignore */ }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('persiste un conflit server_wins (snapshot périmé) dans sync_conflicts', () => {
    const id = 'p-stale-1';

    // CREATE initial (version 1)
    let res = syncEngine.pushChanges([product(id, 'Produit A', 1)]);
    expect(res.errors).toHaveLength(0);
    expect(res.conflicts).toHaveLength(0);

    // Le serveur évolue localement (UPDATE version 2)
    res = syncEngine.pushChanges([{ ...product(id, 'Produit A modifié', 2), operation: 'UPDATE' as const }]);
    expect(res.conflicts).toHaveLength(0);

    // Un client avec un snapshot périmé (version 1 < 2) est rejeté : server_wins
    res = syncEngine.pushChanges([{ ...product(id, 'Ancien nom', 1), operation: 'UPDATE' as const }]);
    expect(res.conflicts).toHaveLength(1);
    expect(res.conflicts[0].strategy).toBe('server_wins');

    // La donnée locale (plus récente) est préservée : le snapshot périmé
    // n'a PAS écrasé l'état serveur (version 2 : 'Produit A modifié').
    const local = db.prepare(`SELECT * FROM products WHERE id = ?`).get(id);
    expect(local.name).toBe('Produit A modifié');

    // Le conflit est PERSISTÉ pour la supervision
    const persisted = db.prepare(`
      SELECT * FROM sync_conflicts WHERE table_name = 'products' AND record_id = ? AND strategy = 'server_wins'
    `).get(id);
    expect(persisted).toBeDefined();
    expect(JSON.parse(persisted.client_data).name).toBe('Ancien nom');
    expect(JSON.parse(persisted.server_data).name).toBe('Produit A modifié');
  });

  it('ne ressuscite PAS un record supprimé localement dont la tombstone est en attente', () => {
    const id = 'prod-dead-1';

    // Création locale
    syncEngine.pushChanges([product(id, 'Produit à supprimer', 1)]);

    // Suppression locale (journalise changelog + tombstone sync_deletions non poussée)
    syncEngine.pushChanges([{
      table: 'products', recordId: id, operation: 'DELETE',
      data: { id, name: 'Produit à supprimer', tenantId: TENANT }, version: 2,
    }]);
    expect(db.prepare(`SELECT * FROM products WHERE id = ?`).get(id)).toBeUndefined();
    const tombstone = db.prepare(`
      SELECT * FROM sync_deletions WHERE table_name = 'products' AND record_id = ? AND pushed_to_supabase = 0
    `).get(id);
    expect(tombstone).toBeDefined();

    // Un UPDATE client (snapshot) tente de ressusciter le record → rejeté
    const res = syncEngine.pushChanges([{
      ...product(id, 'Ressuscité ?', 3),
      operation: 'UPDATE' as const,
    }]);
    expect(res.conflicts).toHaveLength(1);
    expect(res.conflicts[0].strategy).toBe('server_wins');
    expect(db.prepare(`SELECT * FROM products WHERE id = ?`).get(id)).toBeUndefined();

    const persisted = db.prepare(`
      SELECT * FROM sync_conflicts WHERE table_name = 'products' AND record_id = ? AND strategy = 'server_wins'
    `).get(id);
    expect(persisted).toBeDefined();
  });

  it('conserve la création implicite par UPDATE quand AUCUNE tombstone n’existe', () => {
    const id = 'prod-fresh-1';
    const res = syncEngine.pushChanges([product(id, 'Nouveau produit', 1)]);
    expect(res.errors).toHaveLength(0);
    expect(res.conflicts).toHaveLength(0);
    expect(db.prepare(`SELECT * FROM products WHERE id = ?`).get(id)).toBeDefined();
  });

  it('persiste un conflit remote_wins (CREATE collision) dans sync_conflicts', () => {
    const id = 'prod-collision-1';
    syncEngine.pushChanges([product(id, 'Client B', 1)]);

    // Second CREATE (même id, même version) → collision : remote_wins,
    // la donnée existante l'emporte
    const res = syncEngine.pushChanges([product(id, 'Client A', 1)]);
    expect(res.conflicts).toHaveLength(1);

    const persisted = db.prepare(`
      SELECT * FROM sync_conflicts WHERE table_name = 'products' AND record_id = ? AND strategy = 'remote_wins'
    `).get(id);
    expect(persisted).toBeDefined();
  });
});