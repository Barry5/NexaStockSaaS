import * as SyncQueue from './syncQueue.js';
import { syncEngine } from './syncEngine.js';
import { isSupabaseConfigured, checkConnection, batchUpsert, batchDelete } from '../services/supabase/supabaseService.js';

interface WorkerStatus {
  running: boolean;
  online: boolean;
  cycleCount: number;
  lastRunAt: string | null;
  lastResult: string;
  uptime: number;
  pendingCount: number;
  failedCount: number;
}

export class SupabaseWorker {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private online = false;
  private cycleCount = 0;
  private lastRunAt: string | null = null;
  private lastResult = 'idle';
  private startedAt = 0;
  private consecutiveErrors = 0;

  constructor(
    private intervalMs: number = 15000,
    private batchSize: number = 25,
  ) {}

  async start(): Promise<void> {
    if (this.intervalId) return;

    this.startedAt = Date.now();
    this.online = await this.checkConnectivity();

    if (!this.online) {
      console.log('[SUPABASE_WORKER] Supabase non joignable au démarrage — attente du prochain cycle');
    }

    this.intervalId = setInterval(() => this.tick(), this.intervalMs);
    console.log(`[SUPABASE_WORKER] Démarré (intervalle: ${this.intervalMs / 1000}s, batch: ${this.batchSize})`);

    // Premier cycle immédiat
    this.tick();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log('[SUPABASE_WORKER] Arrêté');
  }

  getStatus(): WorkerStatus {
    return {
      running: this.isRunning,
      online: this.online,
      cycleCount: this.cycleCount,
      lastRunAt: this.lastRunAt,
      lastResult: this.lastResult,
      uptime: this.startedAt ? Date.now() - this.startedAt : 0,
      pendingCount: SyncQueue.getPendingCount(),
      failedCount: SyncQueue.getFailedItems().length,
    };
  }

  private async checkConnectivity(): Promise<boolean> {
    if (!isSupabaseConfigured()) {
      console.log('[SUPABASE_WORKER] Supabase non configuré');
      return false;
    }
    return checkConnection();
  }

  private async tick(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      // Vérifier la connectivité (avec cache 30s)
      if (!this.online) {
        this.online = await this.checkConnectivity();
        if (!this.online) {
          this.lastResult = 'offline';
          return;
        }
      }

      // Étape 1: Vider la sync_queue
      const queueResult = await this.processQueue();
      if (queueResult.processed > 0) {
        this.lastResult = `queue: ${queueResult.processed} processed, ${queueResult.failed} failed`;
      }

      // Étape 2: Pousser le changelog non encore poussé
      const changelogResult = await this.processChangelog();
      if (changelogResult.processed > 0) {
        this.lastResult = `changelog: ${changelogResult.processed} pushed, ${changelogResult.failed} failed`;
      }

      // Étape 3: Pull les changements distants
      const { syncService } = await import('./syncService.js');
      const downResult = await syncService.syncDown();
      if (downResult.pulled > 0) {
        this.lastResult = `pull: ${downResult.pulled} records`;
      }

      if (queueResult.processed === 0 && changelogResult.processed === 0 && downResult.pulled === 0) {
        this.lastResult = 'idle';
      }

      this.cycleCount++;
      this.consecutiveErrors = 0;
    } catch (err: any) {
      this.consecutiveErrors++;
      this.lastResult = `error: ${err.message}`;

      if (this.consecutiveErrors >= 3) {
        this.online = false;
      }
    } finally {
      this.lastRunAt = new Date().toISOString();
      this.isRunning = false;
    }
  }

  private async processQueue(): Promise<{ processed: number; failed: number }> {
    const items = SyncQueue.dequeue(this.batchSize);
    if (items.length === 0) return { processed: 0, failed: 0 };

    let processed = 0;
    let failed = 0;

    for (const item of items) {
      try {
        SyncQueue.markProcessing(item.id);
        const payload = JSON.parse(item.payload);

        if (item.operation === 'DELETE') {
          const admin = (await import('../services/supabase/supabaseService.js')).getAdminClient();
          const mapping = await this.resolveTableName(item.table_name);
          const { error } = await admin.from(mapping).delete().eq('legacy_id', item.record_id);
          if (error) throw error;
        } else {
          const mapping = await this.resolveTableName(item.table_name);
          const result = await batchUpsert(mapping, [payload], 'legacy_id');
          if (result.errors.length > 0) throw new Error(result.errors.join('; '));
        }

        SyncQueue.markCompleted(item.id);
        processed++;
      } catch (err: any) {
        SyncQueue.markFailed(item.id, err.message);
        failed++;
      }
    }

    return { processed, failed };
  }

  private async processChangelog(): Promise<{ processed: number; failed: number }> {
    const changes = syncEngine.getChangesForSupabase();
    if (changes.length === 0) return { processed: 0, failed: 0 };

    let processed = 0;
    let failed = 0;
    const pushedIds: string[] = [];

    for (const change of changes) {
      try {
        const mapping = await this.resolveTableName(change.table);

        if (change.operation === 'DELETE') {
          const admin = (await import('../services/supabase/supabaseService.js')).getAdminClient();
          const { error } = await admin.from(mapping).delete().eq('legacy_id', change.recordId);
          if (error) throw error;
        } else {
          const record = JSON.parse(change.data);
          const result = await batchUpsert(mapping, [record], 'legacy_id');
          if (result.errors.length > 0) throw new Error(result.errors.join('; '));
        }

        processed++;
        pushedIds.push(change.recordId);
      } catch (err: any) {
        failed++;
      }
    }

    if (pushedIds.length > 0) {
      syncEngine.markPushedToSupabase(pushedIds);
    }

    return { processed, failed };
  }

  private async resolveTableName(sqliteName: string): Promise<string> {
    const TABLE_MAP: Record<string, string> = {
      tenants: 'tenants', users: 'users', products: 'products',
      product_variants: 'product_variants', customers: 'customers',
      suppliers: 'suppliers', sales: 'sales', sale_items: 'sale_items',
      expenses: 'expenses', loans: 'loans', repayments: 'repayments',
      loan_installments: 'loan_installments', warehouses: 'warehouses',
      stock_transfers: 'stock_transfers', invoices: 'invoices',
      invoice_items: 'invoice_items', delivery_orders: 'delivery_orders',
      delivery_order_items: 'delivery_order_items', payments: 'payments',
      returns: 'returns', return_items: 'return_items',
      invoice_audit_log: 'invoice_audit_log', affiliates: 'affiliates',
      commission_rules: 'commission_rules', commission_ledger: 'commission_ledger',
      commission_payments: 'commission_payments', commission_audit: 'commission_audit',
      sale_affiliates: 'sale_affiliates', sale_commission_items: 'sale_commission_items',
      audit_logs: 'audit_logs', delivery_note_audit: 'delivery_note_audit',
      subscription_invoices: 'subscription_invoices',
      subscription_payments: 'subscription_payments', pricing_plans: 'pricing_plans',
      global_saas_settings: 'global_saas_settings', gdrive_tokens: 'gdrive_tokens',
      roles: 'roles', permissions: 'permissions', role_permissions: 'role_permissions',
      user_roles: 'user_roles', module_definitions: 'module_definitions',
      tenant_modules: 'tenant_modules',
    };
    return TABLE_MAP[sqliteName] || sqliteName;
  }
}

export const supabaseWorker = new SupabaseWorker();
