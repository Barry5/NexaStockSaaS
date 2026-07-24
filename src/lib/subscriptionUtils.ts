import type { Tenant, PricingPlan, DBState } from '../types/index.js';

const DEFAULT_FREE_PLAN: PricingPlan = {
  id: 'plan-free',
  name: 'Free',
  description: 'Plan gratuit de base',
  price: 0,
  currency: 'EUR',
  durationDays: 14,
  features: [],
  limits: { maxProducts: 50, maxSales: 100, maxCustomers: 20, maxUsers: 1, maxWarehouses: 1 },
  color: 'gray',
  displayOrder: 1,
  active: true
};

function normalizePlanValue(value: string | undefined): string {
  return (value || '').toLowerCase();
}

/**
 * Resolves the active pricing plan for a tenant from the db's configured plans.
 */
export function getActivePlan(tenant: Tenant, pricingPlans: PricingPlan[]): PricingPlan {
  const plan = pricingPlans.find(p => normalizePlanValue(p.name) === normalizePlanValue(String(tenant.plan)))
    || pricingPlans.find(p => p.id === tenant.subscriptionPlanId);

  if (plan) {
    return plan;
  }

  return {
    ...DEFAULT_FREE_PLAN,
    currency: tenant.currency || DEFAULT_FREE_PLAN.currency,
  };
}

/**
 * Returns the usage statistics and limits for a given tenant.
 */
export function getTenantPlanStatus(tenant: Tenant, db: DBState) {
  const plans = db.pricingPlans || [];
  const plan = getActivePlan(tenant, plans);
  const limits = plan.limits;

  const currentProducts = db.products.filter(p => p.tenantId === tenant.id).length;
  const currentSales = db.sales.filter(s => s.tenantId === tenant.id).length;
  const currentCustomers = db.customers.filter(c => c.tenantId === tenant.id).length;
  const currentUsers = db.users.filter(u => u.tenantId === tenant.id).length;
  const currentWarehouses = db.warehouses?.filter(w => w.tenantId === tenant.id).length || 0;
  const warehouseLimit = limits.maxWarehouses || 1;

  return {
    planName: plan.name,
    planColor: plan.color,
    price: plan.price,
    currency: plan.currency || tenant.currency || 'EUR',
    status: tenant.subscriptionStatus || 'TRIAL',
    products: { current: currentProducts, max: limits.maxProducts, isLimitReached: currentProducts >= limits.maxProducts },
    sales: { current: currentSales, max: limits.maxSales, isLimitReached: currentSales >= limits.maxSales },
    customers: { current: currentCustomers, max: limits.maxCustomers, isLimitReached: currentCustomers >= limits.maxCustomers },
    users: { current: currentUsers, max: limits.maxUsers, isLimitReached: currentUsers >= limits.maxUsers },
    warehouses: { current: currentWarehouses, max: warehouseLimit, isLimitReached: currentWarehouses >= warehouseLimit },
    isReadOnly: ['EXPIRED', 'SUSPENDED', 'BLOCKED'].includes(tenant.subscriptionStatus || ''),
    isActive: ['ACTIVE', 'TRIAL', 'RENEWAL_PENDING'].includes(tenant.subscriptionStatus || ''),
  };
}

/**
 * Returns remaining days and expiration label
 */
export function getRemainingDays(tenant: Tenant): { days: number; isExpired: boolean; text: string } {
  const endStr = tenant.subscriptionEndDate || tenant.trialEndDate;
  if (!endStr) {
    return { days: 0, isExpired: false, text: 'Plan illimité' };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiryDate = new Date(endStr);
  expiryDate.setHours(0, 0, 0, 0);

  const diffTime = expiryDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { days: diffDays, isExpired: true, text: `Expiré depuis ${Math.abs(diffDays)} jour(s)` };
  } else if (diffDays === 0) {
    return { days: 0, isExpired: false, text: 'Expire aujourd\'hui !' };
  } else {
    return { days: diffDays, isExpired: false, text: `Il reste ${diffDays} jour(s)` };
  }
}

/**
 * Simulates a payment provider adapter interface for future evolutions.
 */
export interface PaymentProvider {
  id: string;
  name: string;
  logo: string;
  type: 'card' | 'mobile_money' | 'crypto' | 'bank_transfer';
  initializePayment: (amount: number, currency: string, reference: string) => Promise<{ success: boolean; transactionId?: string; url?: string }>;
}

export const futurePaymentProviders: PaymentProvider[] = [
  {
    id: 'stripe',
    name: 'Stripe',
    logo: '💳',
    type: 'card',
    initializePayment: async (amount, currency, ref) => ({ success: true, transactionId: `str_${Math.random().toString(36).substr(2, 9)}`, url: 'https://checkout.stripe.com/mock' })
  },
  {
    id: 'paypal',
    name: 'PayPal',
    logo: '🅿️',
    type: 'card',
    initializePayment: async (amount, currency, ref) => ({ success: true, transactionId: `pay_${Math.random().toString(36).substr(2, 9)}`, url: 'https://paypal.com/checkout/mock' })
  },
  {
    id: 'cinetpay',
    name: 'CinetPay (Afrique de l\'Ouest)',
    logo: '🧡',
    type: 'mobile_money',
    initializePayment: async (amount, currency, ref) => ({ success: true, transactionId: `cin_${Math.random().toString(36).substr(2, 9)}`, url: 'https://cinetpay.com/mock' })
  },
  {
    id: 'flutterwave',
    name: 'Flutterwave (Afrique Globale)',
    logo: '🦋',
    type: 'mobile_money',
    initializePayment: async (amount, currency, ref) => ({ success: true, transactionId: `flw_${Math.random().toString(36).substr(2, 9)}`, url: 'https://flutterwave.com/mock' })
  },
  {
    id: 'orange_money',
    name: 'Orange Money API',
    logo: '🍊',
    type: 'mobile_money',
    initializePayment: async (amount, currency, ref) => ({ success: true, transactionId: `om_${Math.random().toString(36).substr(2, 9)}` })
  }
];
