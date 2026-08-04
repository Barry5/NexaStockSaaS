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
      createdAt: null, updatedAt: null,
    });
    expect(pg.created_at).toBeUndefined();
    expect(pg.updated_at).toBeUndefined();
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

  it('ignore les relations embarquées non-schéma comme variants et repayments', () => {
    const product = transform('products', {
      id: 'p-123', name: 'T-shirt', sku: 'TS-1', buyPrice: 10, sellPrice: 15,
      category: 'Apparel', quantity: 20, alertThreshold: 2, tenantId: 't-1', createdAt: '2026-07-31T00:00:00Z',
      variants: [{ id: 'v-1', name: 'Red' }],
    });
    expect(product.variants).toBeUndefined();
    expect(product.legacy_id).toBe('p-123');

    const loan = transform('loans', {
      id: 'l-123', type: 'personal', partnerName: 'Bank', amount: 1000, date: '2026-07-31T00:00:00Z',
      remainingBalance: 1000, status: 'actif', tenantId: 't-1', repayments: [{ id: 'r-1', amount: 100 }],
      installments: [{ id: 'i-1', amount: 100 }],
    });
    expect(loan.repayments).toBeUndefined();
    expect(loan.installments).toBeUndefined();
    expect(loan.legacy_id).toBe('l-123');
  });

  it('exclut deletedAt pour pricing_plans et global_saas_settings quand le schéma PG ne l’attend pas', () => {
    const plan = transform('pricing_plans', {
      id: 'plan-free', name: 'Free', price: 0, currency: 'EUR', durationDays: 30,
      deletedAt: '2026-07-31T00:00:00Z', version: 1,
    });
    expect(plan.deleted_at).toBeUndefined();
    expect(plan.legacy_id).toBe('plan-free');

    const settings = transform('global_saas_settings', {
      id: 1, trialDays: 14, gracePeriodDays: 5, deletedAt: '2026-07-31T00:00:00Z',
    });
    expect(settings.deleted_at).toBeUndefined();
    expect(settings.id).toBe(1);
  });

  it('plan_modules: pas de legacy_id en PG -> génère un UUID pk id et utilise "id" comme colonne de conflit', () => {
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

  it('utilise la colonne id comme clé de conflit par défaut pour les tables régulières', () => {
    expect(getConflictColumn('pricing_plans')).toBe('id');
    expect(getConflictColumn('tenants')).toBe('id');
  });

  it('transforme pricing_plans avec currency et JSON correctement pour Supabase', () => {
    const pg = transform('pricing_plans', {
      id: 'plan-standard',
      name: 'Standard',
      description: 'Plan standard',
      price: 29.99,
      currency: 'USD',
      durationDays: 30,
      features: JSON.stringify(['support', 'analytics']),
      limits: JSON.stringify({ users: 10 }),
      version: 7,
      createdAt: '2026-07-31T00:00:00Z',
      updatedAt: '2026-07-31T00:00:00Z',
    });

    expect(pg.price).toBe(29.99);
    expect(pg.currency).toBe('USD');
    expect(pg.features).toEqual(['support', 'analytics']);
    expect(pg.limits).toEqual({ users: 10 });
    expect(pg.legacy_id).toBe('plan-standard');
    expect(pg.id).toBeDefined();
  });

  it('getDeleteCriteria pour global_saas_settings cible la colonne id', () => {
    expect(getDeleteCriteria('global_saas_settings', '1')).toEqual({ column: 'id', value: '1' });
  });

  it('getDeleteCriteria utilise id pour les UUID et legacy_id pour les anciens IDs', () => {
    expect(getDeleteCriteria('pricing_plans', 'plan-free')).toEqual({ column: 'legacy_id', value: 'plan-free' });
    expect(getDeleteCriteria('pricing_plans', '9a7b8c4d-1234-4d5e-9f8a-0b1c2d3e4f5a')).toEqual({
      column: 'id',
      value: '9a7b8c4d-1234-4d5e-9f8a-0b1c2d3e4f5a',
    });
  });

  it('getDeleteCriteria pour plan_modules cible la colonne id (UUID mappé)', () => {
    const crit = getDeleteCriteria('plan_modules', 'pm-999');
    expect(crit.column).toBe('id');
    expect(typeof crit.value).toBe('string');
    expect(crit.value).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('complète la date absente/null des factures pour éviter une violation NOT NULL PG', () => {
    // Payload minimal sans `date` (ex: historique poussé avant le correctif pleine ligne)
    const minimal = transform('invoices', {
      id: 'inv-1', invoiceNumber: 'FAC-1', tenantId: 't-1', legacy_id: 'inv-1',
    });
    expect(minimal.date).toBeDefined();
    expect(typeof minimal.date).toBe('string');
    expect(minimal.legacy_id).toBe('inv-1');

    // date explicitement null -> repli sur created_at quand disponible
    const nulled = transform('invoices', {
      id: 'inv-2', date: null, createdAt: '2026-07-31T00:00:00Z', legacy_id: 'inv-2',
    });
    expect(nulled.date).toBe('2026-07-31T00:00:00Z');
  });
});
