import { describe, expect, it } from 'vitest';
import { buildCustomerFromForm, buildSupplierFromForm, createEmptyCustomerForm, createEmptySupplierForm, filterCustomers, filterSuppliers } from './customers';

describe('customer business helpers', () => {
  it('creates empty forms', () => {
    expect(createEmptyCustomerForm()).toEqual({ name: '', phone: '', email: '', loyaltyPoints: 0, outstandingDebt: 0 });
    expect(createEmptySupplierForm()).toEqual({ name: '', contactName: '', phone: '', email: '' });
  });

  it('filters customers and suppliers by search term', () => {
    const customers = [{ id: '1', name: 'Alice', phone: '123', email: 'a@test.com', loyaltyPoints: 1, outstandingDebt: 0, tenantId: 't1', createdAt: '2024-01-01' } as any];
    const suppliers = [{ id: '2', name: 'Beta', contactName: 'B', phone: '456', email: 'b@test.com', tenantId: 't1', createdAt: '2024-01-01' } as any];
    expect(filterCustomers(customers, 'ali')).toHaveLength(1);
    expect(filterSuppliers(suppliers, 'beta')).toHaveLength(1);
  });

  it('builds domain objects from forms', () => {
    const customer = buildCustomerFromForm(createEmptyCustomerForm(), 'tenant-1');
    expect(customer.tenantId).toBe('tenant-1');
    const supplier = buildSupplierFromForm(createEmptySupplierForm(), 'tenant-1');
    expect(supplier.tenantId).toBe('tenant-1');
  });
});
