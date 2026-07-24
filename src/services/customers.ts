import type { Customer, Supplier } from '../types';

export interface CustomerFormState {
  name: string;
  phone: string;
  email: string;
  loyaltyPoints: number;
  outstandingDebt: number;
}

export interface SupplierFormState {
  name: string;
  contactName: string;
  phone: string;
  email: string;
}

export function createEmptyCustomerForm(): CustomerFormState {
  return { name: '', phone: '', email: '', loyaltyPoints: 0, outstandingDebt: 0 };
}

export function createEmptySupplierForm(): SupplierFormState {
  return { name: '', contactName: '', phone: '', email: '' };
}

export function buildCustomerFromForm(form: CustomerFormState, tenantId: string): Customer {
  return {
    id: `c-${Date.now()}`,
    name: form.name,
    phone: form.phone,
    email: form.email,
    loyaltyPoints: Number(form.loyaltyPoints),
    outstandingDebt: Number(form.outstandingDebt),
    tenantId,
    createdAt: new Date().toISOString(),
  };
}

export function buildSupplierFromForm(form: SupplierFormState, tenantId: string): Supplier {
  return {
    id: `s-${Date.now()}`,
    name: form.name,
    contactName: form.contactName,
    phone: form.phone,
    email: form.email,
    tenantId,
    createdAt: new Date().toISOString(),
  } as Supplier;
}

export function filterCustomers(items: Customer[], searchTerm: string) {
  const normalized = searchTerm.toLowerCase();
  return items.filter(item =>
    item.name.toLowerCase().includes(normalized) ||
    item.phone.includes(searchTerm) ||
    item.email.toLowerCase().includes(normalized),
  );
}

export function filterSuppliers(items: Supplier[], searchTerm: string) {
  const normalized = searchTerm.toLowerCase();
  return items.filter(item =>
    item.name.toLowerCase().includes(normalized) ||
    item.contactName.toLowerCase().includes(normalized) ||
    item.email.toLowerCase().includes(normalized),
  );
}
