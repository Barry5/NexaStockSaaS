export { LocalRepository } from './localRepository.js';
export { RemoteRepository } from './remoteRepository.js';
export { SyncRepository } from './syncRepository.js';
export type { Repository, Syncable, HasTenant } from './baseRepository.js';

// Instances partagées pour les repositories métier
import { SyncRepository } from './syncRepository.js';

export const productRepository = new SyncRepository<any>('products');
export const customerRepository = new SyncRepository<any>('customers');
export const supplierRepository = new SyncRepository<any>('suppliers');
export const saleRepository = new SyncRepository<any>('sales');
export const expenseRepository = new SyncRepository<any>('expenses');
export const loanRepository = new SyncRepository<any>('loans');
export const warehouseRepository = new SyncRepository<any>('warehouses');
export const invoiceRepository = new SyncRepository<any>('invoices');
export const userRepository = new SyncRepository<any>('users');
export const affiliateRepository = new SyncRepository<any>('affiliates');
export const tenantRepository = new SyncRepository<any>('tenants');
