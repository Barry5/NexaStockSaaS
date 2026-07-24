import { describe, it, expect } from 'vitest';
import { getActivePlan, getTenantPlanStatus, getRemainingDays } from './subscriptionUtils';
import type { Tenant, DBState, PricingPlan } from '../types';

const createMockDb = (overrides?: Partial<DBState>): DBState => ({
  tenants: [],
  users: [],
  products: [],
  sales: [],
  customers: [],
  suppliers: [],
  expenses: [],
  loans: [],
  warehouses: [],
  transfers: [],
  auditLogs: [],
  subscriptionInvoices: [],
  variants: [],
  pricingPlans: [
    { id: 'plan-free', name: 'Free', price: 0, currency: 'EUR', durationDays: 14, limits: { maxProducts: 50, maxSales: 100, maxCustomers: 20, maxUsers: 1, maxWarehouses: 1 }, displayOrder: 1, active: true } as PricingPlan,
    { id: 'plan-standard', name: 'Standard', price: 29, currency: 'EUR', durationDays: 30, limits: { maxProducts: 500, maxSales: 1000, maxCustomers: 100, maxUsers: 5, maxWarehouses: 3 }, displayOrder: 2, active: true } as PricingPlan,
    { id: 'plan-premium', name: 'Premium', price: 99, currency: 'EUR', durationDays: 30, limits: { maxProducts: 5000, maxSales: 10000, maxCustomers: 1000, maxUsers: 20, maxWarehouses: 10 }, displayOrder: 3, active: true } as PricingPlan,
  ],
  globalSaaSSettings: undefined,
  subscriptionPayments: [],
  ...overrides,
});

describe('getActivePlan', () => {
  it('returns Free plan limits for Free tenant', () => {
    const db = createMockDb();
    const tenant: Tenant = { id: 't1', name: 'Test', description: '', plan: 'Free', logo: '', address: '', phone: '', currency: 'EUR', createdAt: '' };
    const plan = getActivePlan(tenant, db.pricingPlans || []);
    expect(plan.limits.maxProducts).toBe(50);
    expect(plan.limits.maxUsers).toBe(1);
  });

  it('returns Standard plan limits', () => {
    const db = createMockDb();
    const tenant: Tenant = { id: 't1', name: 'Test', description: '', plan: 'Standard', logo: '', address: '', phone: '', currency: 'EUR', createdAt: '' };
    const plan = getActivePlan(tenant, db.pricingPlans || []);
    expect(plan.limits.maxProducts).toBe(500);
    expect(plan.limits.maxUsers).toBe(5);
  });

  it('returns Premium plan limits', () => {
    const db = createMockDb();
    const tenant: Tenant = { id: 't1', name: 'Test', description: '', plan: 'Premium', logo: '', address: '', phone: '', currency: 'EUR', createdAt: '' };
    const plan = getActivePlan(tenant, db.pricingPlans || []);
    expect(plan.limits.maxProducts).toBe(5000);
    expect(plan.limits.maxUsers).toBe(20);
  });

  it('returns default Free plan for unknown plan name', () => {
    const db = createMockDb();
    const tenant: Tenant = { id: 't1', name: 'Test', description: '', plan: 'UnknownPlan', logo: '', address: '', phone: '', currency: 'EUR', createdAt: '' };
    const plan = getActivePlan(tenant, db.pricingPlans || []);
    expect(plan.name).toBe('Free');
    expect(plan.limits.maxProducts).toBe(50);
  });
});

describe('getTenantPlanStatus', () => {
  it('returns plan status with usage counts', () => {
    const db = createMockDb({
      products: Array(3).fill(null).map((_, i) => ({ id: `p${i}`, tenantId: 't1', name: `Prod ${i}`, sku: `SKU${i}`, barcode: '', description: '', category: 'Cat', buyPrice: 10, sellPrice: 20, quantity: 5, alertThreshold: 3, createdAt: '' })),
      users: [{ id: 'u1', name: 'User 1', email: 'u1@test.com', role: 'vendeur', tenantId: 't1', active: true }],
    });
    const tenant: Tenant = { id: 't1', name: 'Test', description: '', plan: 'Standard', logo: '', address: '', phone: '', currency: 'EUR', createdAt: '', subscriptionStatus: 'ACTIVE' };
    const status = getTenantPlanStatus(tenant, db);
    expect(status.planName).toBe('Standard');
    expect(status.products.current).toBe(3);
    expect(status.products.max).toBe(500);
    expect(status.products.isLimitReached).toBe(false);
    expect(status.users.current).toBe(1);
    expect(status.isActive).toBe(true);
    expect(status.isReadOnly).toBe(false);
  });

  it('detects limit reached', () => {
    const db = createMockDb({
      products: Array(50).fill(null).map((_, i) => ({ id: `p${i}`, tenantId: 't1', name: `Prod ${i}`, sku: `SKU${i}`, barcode: '', description: '', category: 'Cat', buyPrice: 10, sellPrice: 20, quantity: 5, alertThreshold: 3, createdAt: '' })),
    });
    const tenant: Tenant = { id: 't1', name: 'Test', description: '', plan: 'Free', logo: '', address: '', phone: '', currency: 'EUR', createdAt: '' };
    const status = getTenantPlanStatus(tenant, db);
    expect(status.planName).toBe('Free');
    expect(status.products.isLimitReached).toBe(true);
  });

  it('marks read-only for expired/suspended tenants', () => {
    const db = createMockDb();
    const tenant: Tenant = { id: 't1', name: 'Test', description: '', plan: 'Free', logo: '', address: '', phone: '', currency: 'EUR', createdAt: '', subscriptionStatus: 'EXPIRED' };
    const status = getTenantPlanStatus(tenant, db);
    expect(status.isReadOnly).toBe(true);
    expect(status.isActive).toBe(false);
  });
});

describe('getRemainingDays', () => {
  it('returns unlimited for tenant without end date', () => {
    const tenant: Tenant = { id: 't1', name: 'Test', description: '', plan: 'Free', logo: '', address: '', phone: '', currency: 'EUR', createdAt: '' };
    const result = getRemainingDays(tenant);
    expect(result.text).toBe('Plan illimité');
    expect(result.isExpired).toBe(false);
  });

  it('returns positive days for future date', () => {
    const future = new Date();
    future.setDate(future.getDate() + 10);
    const tenant: Tenant = { id: 't1', name: 'Test', description: '', plan: 'Free', logo: '', address: '', phone: '', currency: 'EUR', createdAt: '', subscriptionEndDate: future.toISOString() };
    const result = getRemainingDays(tenant);
    expect(result.days).toBe(10);
    expect(result.isExpired).toBe(false);
  });

  it('returns expired for past date', () => {
    const past = new Date();
    past.setDate(past.getDate() - 5);
    const tenant: Tenant = { id: 't1', name: 'Test', description: '', plan: 'Free', logo: '', address: '', phone: '', currency: 'EUR', createdAt: '', subscriptionEndDate: past.toISOString() };
    const result = getRemainingDays(tenant);
    expect(result.isExpired).toBe(true);
  });
});
