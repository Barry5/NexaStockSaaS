import db from '../database/db.js';
import { getAdminClient, isSupabaseConfigured } from './supabase/supabaseService.js';
import { v4 as uuidv4 } from 'uuid';

interface MigrationProgress {
  table: string;
  total: number;
  migrated: number;
  errors: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
}

interface TableConfig {
  sqlite: string;
  pg: string;
  order: number;
  hasSyncStatus: boolean;
  hasVersion: boolean;
  hasLegacyId: boolean;
  hasUpdatedAt: boolean;
  hasDeletedAt: boolean;
  hasDeviceId: boolean;
  hasCompanyId: boolean;
  hasCreatedBy: boolean;
  hasUpdatedBy: boolean;
  hasDeletedBy: boolean;
  isGlobalSettings: boolean;
  skipId: boolean;
  conflictColumn: string;
  fkMappings: { column: string; parentTable: string }[];
  columnOverrides: Record<string, string>;
}

export class MigrationService {
  private progress: Map<string, MigrationProgress> = new Map();
  private isRunning = false;
  private globalUuidMap = new Map<string, string>();

  private readonly tableConfigs: TableConfig[] = [
    { sqlite: 'tenants', pg: 'tenants', order: 1, hasSyncStatus: true, hasVersion: true, hasLegacyId: true, hasUpdatedAt: true, hasDeletedAt: true, hasDeviceId: true, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: true, hasDeletedBy: true, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [], columnOverrides: {} },
    { sqlite: 'users', pg: 'users', order: 2, hasSyncStatus: true, hasVersion: true, hasLegacyId: true, hasUpdatedAt: true, hasDeletedAt: true, hasDeviceId: true, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: true, hasDeletedBy: true, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'tenant_id', parentTable: 'tenants' }], columnOverrides: {} },
    { sqlite: 'pricing_plans', pg: 'pricing_plans', order: 2, hasSyncStatus: false, hasVersion: false, hasLegacyId: true, hasUpdatedAt: true, hasDeletedAt: false, hasDeviceId: false, hasCompanyId: false, hasCreatedBy: false, hasUpdatedBy: false, hasDeletedBy: false, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [], columnOverrides: {} },
    { sqlite: 'global_saas_settings', pg: 'global_saas_settings', order: 2, hasSyncStatus: false, hasVersion: false, hasLegacyId: false, hasUpdatedAt: true, hasDeletedAt: false, hasDeviceId: false, hasCompanyId: false, hasCreatedBy: false, hasUpdatedBy: false, hasDeletedBy: false, isGlobalSettings: true, skipId: false, conflictColumn: 'id', fkMappings: [], columnOverrides: {} },
    { sqlite: 'module_definitions', pg: 'module_definitions', order: 2, hasSyncStatus: false, hasVersion: false, hasLegacyId: false, hasUpdatedAt: false, hasDeletedAt: false, hasDeviceId: false, hasCompanyId: false, hasCreatedBy: false, hasUpdatedBy: false, hasDeletedBy: false, isGlobalSettings: false, skipId: true, conflictColumn: 'key', fkMappings: [], columnOverrides: {} },
    { sqlite: 'permissions', pg: 'permissions', order: 2, hasSyncStatus: false, hasVersion: false, hasLegacyId: true, hasUpdatedAt: false, hasDeletedAt: false, hasDeviceId: false, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: false, hasDeletedBy: false, isGlobalSettings: false, skipId: false, conflictColumn: 'key', fkMappings: [], columnOverrides: {} },
    { sqlite: 'roles', pg: 'roles', order: 2, hasSyncStatus: true, hasVersion: true, hasLegacyId: true, hasUpdatedAt: true, hasDeletedAt: true, hasDeviceId: true, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: true, hasDeletedBy: true, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'tenant_id', parentTable: 'tenants' }], columnOverrides: {} },
    { sqlite: 'products', pg: 'products', order: 3, hasSyncStatus: true, hasVersion: true, hasLegacyId: true, hasUpdatedAt: true, hasDeletedAt: true, hasDeviceId: true, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: true, hasDeletedBy: true, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'tenant_id', parentTable: 'tenants' }], columnOverrides: {} },
    { sqlite: 'product_variants', pg: 'product_variants', order: 4, hasSyncStatus: true, hasVersion: true, hasLegacyId: true, hasUpdatedAt: true, hasDeletedAt: true, hasDeviceId: true, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: true, hasDeletedBy: true, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'product_id', parentTable: 'products' }], columnOverrides: {} },
    { sqlite: 'customers', pg: 'customers', order: 3, hasSyncStatus: true, hasVersion: true, hasLegacyId: true, hasUpdatedAt: true, hasDeletedAt: true, hasDeviceId: true, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: true, hasDeletedBy: true, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'tenant_id', parentTable: 'tenants' }], columnOverrides: {} },
    { sqlite: 'suppliers', pg: 'suppliers', order: 3, hasSyncStatus: true, hasVersion: true, hasLegacyId: true, hasUpdatedAt: true, hasDeletedAt: true, hasDeviceId: true, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: true, hasDeletedBy: true, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'tenant_id', parentTable: 'tenants' }], columnOverrides: {} },
    { sqlite: 'warehouses', pg: 'warehouses', order: 3, hasSyncStatus: true, hasVersion: true, hasLegacyId: true, hasUpdatedAt: true, hasDeletedAt: true, hasDeviceId: true, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: true, hasDeletedBy: true, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'tenant_id', parentTable: 'tenants' }], columnOverrides: {} },
    { sqlite: 'expenses', pg: 'expenses', order: 4, hasSyncStatus: true, hasVersion: true, hasLegacyId: true, hasUpdatedAt: true, hasDeletedAt: true, hasDeviceId: true, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: true, hasDeletedBy: true, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'tenant_id', parentTable: 'tenants' }], columnOverrides: {} },
    { sqlite: 'loans', pg: 'loans', order: 4, hasSyncStatus: true, hasVersion: true, hasLegacyId: true, hasUpdatedAt: true, hasDeletedAt: true, hasDeviceId: true, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: true, hasDeletedBy: true, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'tenant_id', parentTable: 'tenants' }], columnOverrides: {} },
    { sqlite: 'repayments', pg: 'repayments', order: 5, hasSyncStatus: true, hasVersion: true, hasLegacyId: true, hasUpdatedAt: true, hasDeletedAt: true, hasDeviceId: true, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: true, hasDeletedBy: true, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'loan_id', parentTable: 'loans' }], columnOverrides: {} },
    { sqlite: 'loan_installments', pg: 'loan_installments', order: 5, hasSyncStatus: true, hasVersion: true, hasLegacyId: true, hasUpdatedAt: true, hasDeletedAt: true, hasDeviceId: true, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: true, hasDeletedBy: true, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'loan_id', parentTable: 'loans' }], columnOverrides: {} },
    { sqlite: 'sales', pg: 'sales', order: 5, hasSyncStatus: true, hasVersion: true, hasLegacyId: true, hasUpdatedAt: true, hasDeletedAt: true, hasDeviceId: true, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: true, hasDeletedBy: true, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'tenant_id', parentTable: 'tenants' }, { column: 'customer_id', parentTable: 'customers' }], columnOverrides: { returns: 'returns_json' } },
    { sqlite: 'sale_items', pg: 'sale_items', order: 6, hasSyncStatus: true, hasVersion: true, hasLegacyId: true, hasUpdatedAt: true, hasDeletedAt: true, hasDeviceId: true, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: true, hasDeletedBy: true, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'sale_id', parentTable: 'sales' }, { column: 'product_id', parentTable: 'products' }], columnOverrides: {} },
    { sqlite: 'stock_transfers', pg: 'stock_transfers', order: 5, hasSyncStatus: true, hasVersion: true, hasLegacyId: true, hasUpdatedAt: true, hasDeletedAt: true, hasDeviceId: true, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: true, hasDeletedBy: true, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'tenant_id', parentTable: 'tenants' }, { column: 'product_id', parentTable: 'products' }, { column: 'from_warehouse_id', parentTable: 'warehouses' }, { column: 'to_warehouse_id', parentTable: 'warehouses' }], columnOverrides: {} },
    { sqlite: 'invoices', pg: 'invoices', order: 5, hasSyncStatus: true, hasVersion: true, hasLegacyId: true, hasUpdatedAt: true, hasDeletedAt: true, hasDeviceId: true, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: true, hasDeletedBy: true, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'tenant_id', parentTable: 'tenants' }], columnOverrides: {} },
    { sqlite: 'invoice_items', pg: 'invoice_items', order: 6, hasSyncStatus: true, hasVersion: true, hasLegacyId: true, hasUpdatedAt: true, hasDeletedAt: true, hasDeviceId: true, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: true, hasDeletedBy: true, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'invoice_id', parentTable: 'invoices' }], columnOverrides: {} },
    { sqlite: 'delivery_orders', pg: 'delivery_orders', order: 6, hasSyncStatus: true, hasVersion: false, hasLegacyId: true, hasUpdatedAt: false, hasDeletedAt: true, hasDeviceId: true, hasCompanyId: true, hasCreatedBy: false, hasUpdatedBy: false, hasDeletedBy: true, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'tenant_id', parentTable: 'tenants' }, { column: 'invoice_id', parentTable: 'invoices' }], columnOverrides: { created_by: 'created_by_audit', updated_by: 'updated_by_audit' } },
    { sqlite: 'delivery_order_items', pg: 'delivery_order_items', order: 7, hasSyncStatus: true, hasVersion: true, hasLegacyId: true, hasUpdatedAt: true, hasDeletedAt: true, hasDeviceId: true, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: true, hasDeletedBy: true, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'delivery_order_id', parentTable: 'delivery_orders' }], columnOverrides: {} },
    { sqlite: 'payments', pg: 'payments', order: 6, hasSyncStatus: true, hasVersion: true, hasLegacyId: true, hasUpdatedAt: true, hasDeletedAt: true, hasDeviceId: true, hasCompanyId: true, hasCreatedBy: false, hasUpdatedBy: false, hasDeletedBy: true, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'tenant_id', parentTable: 'tenants' }, { column: 'invoice_id', parentTable: 'invoices' }], columnOverrides: { created_by: 'created_by_audit', updated_by: 'updated_by_audit' } },
    { sqlite: 'returns', pg: 'returns', order: 6, hasSyncStatus: true, hasVersion: true, hasLegacyId: true, hasUpdatedAt: true, hasDeletedAt: true, hasDeviceId: true, hasCompanyId: true, hasCreatedBy: false, hasUpdatedBy: false, hasDeletedBy: true, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'tenant_id', parentTable: 'tenants' }, { column: 'invoice_id', parentTable: 'invoices' }], columnOverrides: { created_by: 'created_by_audit', updated_by: 'updated_by_audit' } },
    { sqlite: 'return_items', pg: 'return_items', order: 7, hasSyncStatus: true, hasVersion: true, hasLegacyId: true, hasUpdatedAt: true, hasDeletedAt: true, hasDeviceId: true, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: true, hasDeletedBy: true, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'return_id', parentTable: 'returns' }], columnOverrides: {} },
    { sqlite: 'invoice_audit_log', pg: 'invoice_audit_log', order: 7, hasSyncStatus: false, hasVersion: false, hasLegacyId: true, hasUpdatedAt: false, hasDeletedAt: false, hasDeviceId: false, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: false, hasDeletedBy: false, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'invoice_id', parentTable: 'invoices' }], columnOverrides: {} },
    { sqlite: 'affiliates', pg: 'affiliates', order: 4, hasSyncStatus: true, hasVersion: true, hasLegacyId: true, hasUpdatedAt: true, hasDeletedAt: true, hasDeviceId: true, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: true, hasDeletedBy: true, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'tenant_id', parentTable: 'tenants' }], columnOverrides: {} },
    { sqlite: 'commission_rules', pg: 'commission_rules', order: 5, hasSyncStatus: true, hasVersion: true, hasLegacyId: true, hasUpdatedAt: true, hasDeletedAt: true, hasDeviceId: true, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: true, hasDeletedBy: true, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'tenant_id', parentTable: 'tenants' }, { column: 'affiliate_id', parentTable: 'affiliates' }], columnOverrides: {} },
    { sqlite: 'commission_ledger', pg: 'commission_ledger', order: 5, hasSyncStatus: true, hasVersion: true, hasLegacyId: true, hasUpdatedAt: true, hasDeletedAt: true, hasDeviceId: true, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: true, hasDeletedBy: true, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'tenant_id', parentTable: 'tenants' }, { column: 'affiliate_id', parentTable: 'affiliates' }], columnOverrides: {} },
    { sqlite: 'commission_payments', pg: 'commission_payments', order: 5, hasSyncStatus: true, hasVersion: true, hasLegacyId: true, hasUpdatedAt: true, hasDeletedAt: true, hasDeviceId: true, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: true, hasDeletedBy: true, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'tenant_id', parentTable: 'tenants' }, { column: 'affiliate_id', parentTable: 'affiliates' }], columnOverrides: {} },
    { sqlite: 'commission_audit', pg: 'commission_audit', order: 5, hasSyncStatus: false, hasVersion: false, hasLegacyId: true, hasUpdatedAt: false, hasDeletedAt: false, hasDeviceId: false, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: false, hasDeletedBy: false, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'tenant_id', parentTable: 'tenants' }, { column: 'affiliate_id', parentTable: 'affiliates' }], columnOverrides: {} },
    { sqlite: 'sale_affiliates', pg: 'sale_affiliates', order: 6, hasSyncStatus: true, hasVersion: true, hasLegacyId: true, hasUpdatedAt: true, hasDeletedAt: true, hasDeviceId: true, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: true, hasDeletedBy: true, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'tenant_id', parentTable: 'tenants' }, { column: 'sale_id', parentTable: 'sales' }, { column: 'affiliate_id', parentTable: 'affiliates' }], columnOverrides: {} },
    { sqlite: 'sale_commission_items', pg: 'sale_commission_items', order: 7, hasSyncStatus: true, hasVersion: true, hasLegacyId: true, hasUpdatedAt: true, hasDeletedAt: true, hasDeviceId: true, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: true, hasDeletedBy: true, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'tenant_id', parentTable: 'tenants' }, { column: 'sale_id', parentTable: 'sales' }, { column: 'affiliate_id', parentTable: 'affiliates' }, { column: 'product_id', parentTable: 'products' }], columnOverrides: {} },
    { sqlite: 'invoice_affiliates', pg: 'invoice_affiliates', order: 6, hasSyncStatus: true, hasVersion: true, hasLegacyId: true, hasUpdatedAt: true, hasDeletedAt: true, hasDeviceId: true, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: true, hasDeletedBy: true, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'tenant_id', parentTable: 'tenants' }, { column: 'invoice_id', parentTable: 'invoices' }, { column: 'affiliate_id', parentTable: 'affiliates' }], columnOverrides: {} },
    { sqlite: 'invoice_commission_items', pg: 'invoice_commission_items', order: 7, hasSyncStatus: true, hasVersion: true, hasLegacyId: true, hasUpdatedAt: true, hasDeletedAt: true, hasDeviceId: true, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: true, hasDeletedBy: true, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'tenant_id', parentTable: 'tenants' }, { column: 'invoice_id', parentTable: 'invoices' }, { column: 'affiliate_id', parentTable: 'affiliates' }, { column: 'product_id', parentTable: 'products' }], columnOverrides: {} },
    { sqlite: 'audit_logs', pg: 'audit_logs', order: 6, hasSyncStatus: false, hasVersion: false, hasLegacyId: true, hasUpdatedAt: false, hasDeletedAt: false, hasDeviceId: false, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: false, hasDeletedBy: false, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'tenant_id', parentTable: 'tenants' }], columnOverrides: {} },
    { sqlite: 'delivery_note_audit', pg: 'delivery_note_audit', order: 7, hasSyncStatus: false, hasVersion: false, hasLegacyId: true, hasUpdatedAt: false, hasDeletedAt: false, hasDeviceId: false, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: false, hasDeletedBy: false, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'tenant_id', parentTable: 'tenants' }, { column: 'delivery_note_id', parentTable: 'delivery_orders' }], columnOverrides: {} },
    { sqlite: 'subscription_invoices', pg: 'subscription_invoices', order: 5, hasSyncStatus: false, hasVersion: false, hasLegacyId: true, hasUpdatedAt: true, hasDeletedAt: false, hasDeviceId: false, hasCompanyId: true, hasCreatedBy: false, hasUpdatedBy: false, hasDeletedBy: false, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'tenant_id', parentTable: 'tenants' }], columnOverrides: {} },
    { sqlite: 'subscription_payments', pg: 'subscription_payments', order: 6, hasSyncStatus: false, hasVersion: false, hasLegacyId: true, hasUpdatedAt: true, hasDeletedAt: false, hasDeviceId: false, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: true, hasDeletedBy: false, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'tenant_id', parentTable: 'tenants' }], columnOverrides: {} },
    { sqlite: 'gdrive_tokens', pg: 'gdrive_tokens', order: 5, hasSyncStatus: false, hasVersion: false, hasLegacyId: false, hasUpdatedAt: true, hasDeletedAt: false, hasDeviceId: false, hasCompanyId: false, hasCreatedBy: false, hasUpdatedBy: false, hasDeletedBy: false, isGlobalSettings: false, skipId: false, conflictColumn: 'tenant_id', fkMappings: [], columnOverrides: {} },
    { sqlite: 'role_permissions', pg: 'role_permissions', order: 3, hasSyncStatus: false, hasVersion: false, hasLegacyId: true, hasUpdatedAt: false, hasDeletedAt: false, hasDeviceId: false, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: false, hasDeletedBy: false, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'role_id', parentTable: 'roles' }, { column: 'permission_id', parentTable: 'permissions' }], columnOverrides: {} },
    { sqlite: 'user_roles', pg: 'user_roles', order: 3, hasSyncStatus: false, hasVersion: false, hasLegacyId: true, hasUpdatedAt: false, hasDeletedAt: false, hasDeviceId: false, hasCompanyId: true, hasCreatedBy: true, hasUpdatedBy: false, hasDeletedBy: false, isGlobalSettings: false, skipId: false, conflictColumn: 'id', fkMappings: [{ column: 'role_id', parentTable: 'roles' }], columnOverrides: {} },
  ];

  private async buildGlobalUuidMap(): Promise<void> {
    console.log('[MIGRATION] Construction de la carte UUID globale...');
    for (const cfg of this.tableConfigs) {
      if (!cfg.hasLegacyId && cfg.sqlite !== 'global_saas_settings') continue;
      const rows = db.prepare(`SELECT id FROM ${cfg.sqlite}`).all() as { id: string }[];
      for (const row of rows) {
        if (!this.globalUuidMap.has(row.id)) {
          this.globalUuidMap.set(row.id, uuidv4());
        }
      }
    }
    console.log(`[MIGRATION] Carte UUID globale: ${this.globalUuidMap.size} entrÃ©es`);
  }

  private resolveFk(value: any): any {
    if (!value || typeof value !== 'string') return value;
    return this.globalUuidMap.get(value) || value;
  }

  private async clearDestination(): Promise<void> {
    console.log('[MIGRATION] Nettoyage de la destination PostgreSQL...');
    const client = getAdminClient() as any;
    const reversed = [...this.tableConfigs].sort((a, b) => b.order - a.order);
    for (const cfg of reversed) {
      let error: any;
      if (cfg.pg === 'global_saas_settings') {
        ({ error } = await client.from(cfg.pg).delete().neq('id', 0));
      } else {
        ({ error } = await client.from(cfg.pg).delete().neq(cfg.conflictColumn, '00000000-0000-0000-0000-000000000000'));
      }
      if (error) console.error(`[MIGRATION] Erreur nettoyage ${cfg.pg}: ${error.message}`);
      else console.log(`[MIGRATION]   \u2713 ${cfg.pg} vidÃ©`);
    }
  }

  async migrateAll(onProgress?: (progress: MigrationProgress[]) => void, clearFirst = false): Promise<{
    success: boolean;
    results: MigrationProgress[];
    totalMigrated: number;
    totalErrors: number;
  }> {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase non configurÃ©. VÃ©rifiez SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY');
    }

    if (this.isRunning) {
      throw new Error('Migration dÃ©jÃ  en cours');
    }

    this.isRunning = true;
    let totalMigrated = 0;
    let totalErrors = 0;

    try {
      if (clearFirst) {
        await this.clearDestination();
      }
      await this.buildGlobalUuidMap();

      const sorted = [...this.tableConfigs].sort((a, b) => a.order - b.order);
      for (const cfg of sorted) {
        const progress: MigrationProgress = {
          table: cfg.sqlite,
          total: 0,
          migrated: 0,
          errors: 0,
          status: 'pending',
        };
        this.progress.set(cfg.sqlite, progress);

        try {
          await this.migrateTable(cfg, progress);
          progress.status = 'completed';
          totalMigrated += progress.migrated;
          totalErrors += progress.errors;
        } catch (err: any) {
          progress.status = 'failed';
          progress.error = err.message;
          totalErrors++;
        }

        if (onProgress) {
          onProgress(Array.from(this.progress.values()));
        }
      }

      return {
        success: totalErrors === 0,
        results: Array.from(this.progress.values()),
        totalMigrated,
        totalErrors,
      };
    } finally {
      this.isRunning = false;
    }
  }

  private async migrateTable(cfg: TableConfig, progress: MigrationProgress): Promise<void> {
    const rows = db.prepare(`SELECT * FROM ${cfg.sqlite}`).all() as Record<string, any>[];
    progress.total = rows.length;

    if (rows.length === 0) return;

    progress.status = 'running';
    const client = getAdminClient() as any;
    const batchSize = 50;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const pgRows = batch.map(row => this.transformRow(row, cfg));
      const { error } = await client.from(cfg.pg).upsert(pgRows, {
        onConflict: cfg.conflictColumn,
        ignoreDuplicates: false,
      });

      if (error) {
        progress.errors += batch.length;
        console.error(`[MIGRATION] Erreur ${cfg.sqlite} batch ${Math.floor(i / batchSize)}: ${error.message}`);
        console.error(`[MIGRATION]   Premier row:`, pgRows[0]);
      } else {
        progress.migrated += batch.length;
      }
    }

    console.log(`[MIGRATION] ${cfg.sqlite}: ${progress.migrated}/${progress.total} migrÃ©s`);
  }

  private transformRow(row: Record<string, any>, cfg: TableConfig): Record<string, any> {
    const now = new Date().toISOString();
    const newId = this.globalUuidMap.get(row.id) || uuidv4();

    const pg: Record<string, any> = {};

    if (!cfg.isGlobalSettings && !cfg.skipId) {
      pg.id = newId;
    } else if (cfg.isGlobalSettings) {
      pg.id = 1;
    }

    if (cfg.hasLegacyId) pg.legacy_id = row.id;
    pg.created_at = row.created_at || now;
    if (cfg.hasUpdatedAt) pg.updated_at = row.updated_at || now;
    if (cfg.hasVersion) pg.version = row.version || 1;
    if (cfg.hasSyncStatus) pg.sync_status = 'synced';
    if (cfg.hasDeviceId && row.deviceId) pg.device_id = row.deviceId;
    if (cfg.hasCompanyId && row.companyId) pg.company_id = row.companyId;
    if (cfg.hasCreatedBy && row.createdBy) pg.created_by = row.createdBy;
    if (cfg.hasUpdatedBy && row.updatedBy) pg.updated_by = row.updatedBy;
    if (cfg.hasDeletedBy && row.deletedBy) pg.deleted_by = row.deletedBy;
    if (cfg.hasDeletedAt && row.deletedAt) pg.deleted_at = row.deletedAt;

    const skipKeys = new Set(['id', 'createdAt', 'updatedAt', 'version', 'deviceId', 'companyId', 'createdBy', 'updatedBy', 'deletedBy', 'deletedAt']);

    for (const [key, value] of Object.entries(row)) {
      if (skipKeys.has(key)) continue;
      if (value === null || value === undefined) continue;

      const pgKey = cfg.columnOverrides[key] || this.camelToSnake(key);

      let converted: any = value;
      if (typeof value === 'string' && this.isJSON(value)) {
        converted = JSON.parse(value);
      }

      const fkMapping = cfg.fkMappings.find(m => m.column === pgKey);
      if (fkMapping) {
        converted = this.resolveFk(value);
      }

      pg[pgKey] = converted;
    }

    return pg;
  }

  getProgress(): MigrationProgress[] {
    return Array.from(this.progress.values());
  }

  private camelToSnake(key: string): string {
    return key.replace(/([A-Z])/g, '_$1').toLowerCase();
  }

  private isJSON(value: string): boolean {
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  }
}

export const migrationService = new MigrationService();
