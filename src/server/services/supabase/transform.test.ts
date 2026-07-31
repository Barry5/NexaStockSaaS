import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let transform: any;
let getConflictColumn: any;
let getDeleteCriteria: any;
let tempDir: string;

describe('transformToPostgres : exclusion et ommission conformes au schéma PG', () => {
  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexastock-transform-'));
    process.env.DB_PATH = path.join(tempDir, 'database.db');
    process.env.BACKUP_DIR = path.join(tempDir, 'backups');
    process.env.SNAPSHOT_PATH = path.join(tempDir, 'snapshot.json');

    const dbModule = await import('../../database/db.js');
    const db = dbModule.default;
    const init = await import('../../database/init.js');
    init.initializeDatabase();

    ({ transformToPostgres: transform } = await import('./transform.js'));
    ({ getConflictColumn, getDeleteCriteria } = await import('./transform.js'));
  });

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  it('n\'envoie jamais la colonne version (ajoutée par la migration 010, absente en PG)', () => {
    const pg = transform('pricing_plans', {
      id: 'plan-free', name: 'Free', price: 0, version: 1, updatedAt: '2026-07-31T00:00:00Z',
    });
    expect(pg.version).toBeUndefined();
    expect(pg.updated_at).toBeDefined();
  });

  it('exclut updated_at pour permissions (PG n\'a que created_at), mais garde created_at non-null', () => {
    const pg = transform('permissions', {
      id: 'perm-products-view', key: 'products.view', name: 'Voir produits',
      version: 1, updatedAt: '2026-07-31T00:00:00Z', createdAt: '2026-07-31T00:00:00Z',
    });
    expect(pg.version).toBeUndefined();
    expect(pg.updated_at).toBeUndefined();
    expect(pg.created_at).toBe('2026-07-31T00:00:00Z');
    expect(pg.key).toBe('products.view');
  });

  it('exclut updated_at pour module_definitions', () => {
    const pg = transform('module_definitions', {
      key: 'dashboard', label: 'Tableau de bord',
      version: 1, updatedAt: '2026-07-31T00:00:00Z', createdAt: '2026-07-31T00:00:00Z',
    });
    expect(pg.updated_at).toBeUndefined();
    expect(pg.label).toBe('Tableau de bord');
  });

  it('omet created_at/updated_at nulls (PG: NOT NULL DEFAULT NOW()) au lieu d\'envoyer NULL', () => {
    const pg = transform('pricing_plans', {
      id: 'plan-free', name: 'Free', price: 0, version: 1,
      createdAt: null, updatedAt: null, categoryId: null,
    });
    expect(pg.created_at).toBeUndefined();
    expect(pg.updated_at).toBeUndefined();
    expect(pg.category_id).toBeNull();
    expect(pg.legacy_id).toBe('plan-free');
  });

  it('garde updated_at pour roles (PG a created_at ET updated_at)', () => {
    const pg = transform('roles', {
      id: 'r-owner', name: 'owner', label: 'Propriétaire',
      version: 1, updatedAt: '2026-07-31T00:00:00Z',
    });
    expect(pg.updated_at).toBe('2026-07-31T00:00:00Z');
    expect(pg.version).toBeUndefined();
  });

  it('garde updated_at pour les tables dont le schéma PG l\'a (ex: tenants)', () => {
    const pg = transform('tenants', {
      id: 't-1', name: 'Test', plan: 'Free', version: 1, updatedAt: '2026-07-31T00:00:00Z',
    });
    expect(pg.updated_at).toBe('2026-07-31T00:00:00Z');
    expect(pg.version).toBeUndefined();
    expect(pg.legacy_id).toBe('t-1');
  });

  it('plan_modules: pas de legacy_id en PG -> genère un UUID pk id et utilise "id" comme colonne de conflit', () => {
    const pg = transform('plan_modules', {
      id: 'pm-123', planId: 'plan-premium', moduleKey: 'commissions', enabled: 1,
      version: 1, updatedAt: null, createdAt: null,
    });
    expect(pg.legacy_id).toBeUndefined();          // PG n'a pas de legacy_id
    expect(pg.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(pg.plan_id).toBeDefined();               // FK résolu via uuid map ou conservé
    expect(pg.module_key).toBe('commissions');
    expect(pg.version).toBeUndefined();
    expect(pg.updated_at).toBeUndefined();
    expect(getConflictColumn('plan_modules')).toBe('id');
  });

  it('getDeleteCriteria pour plan_modules cible la colonne id (UUID mappé)', () => {
    const crit = getDeleteCriteria('plan_modules', 'pm-999');
    expect(crit.column).toBe('id');
    expect(typeof crit.value).toBe('string');
    expect(crit.value).toMatch(/^[0-9a-f-]{36}$/);
  });
});
