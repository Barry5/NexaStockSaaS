import type { Tenant, User, SubscriptionPlan } from '../types';

export interface AppSessionState {
  isLoggedIn: boolean;
  activeTenantId: string;
  activeUserId: string;
  currentTab: 'dashboard' | 'invoicing' | 'commissions' | 'pos' | 'products' | 'crm' | 'expenses' | 'ai' | 'users' | 'rbac' | 'settings' | 'saasadmin';
  saasSubTab: string;
  sidebarOpen: boolean;
}

export function buildInitialSessionState(): AppSessionState {
  return {
    isLoggedIn: false,
    activeTenantId: '',
    activeUserId: '',
    currentTab: 'dashboard',
    saasSubTab: 'stats',
    sidebarOpen: false,
  };
}

export function createTenantSwitchMessage(tenantName: string): string {
  return `Passage sur la boutique : ${tenantName}`;
}

export function createUserSwitchMessage(userName: string, role: string): string {
  return `Utilisateur connecté : ${userName} (${role})`;
}

export function createPlanUpdateMessage(plan: SubscriptionPlan): string {
  return `Abonnement mis à jour vers le plan : ${plan}`;
}
