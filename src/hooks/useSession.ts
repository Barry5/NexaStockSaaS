import { useState, useMemo } from 'react';
import type { DBState, TabType, User } from '../types';
import { useDB } from '../context/DBContext';
import { useApp } from '../context/AppContext';

export function useActiveTenant(db: DBState, activeTenantId: string) {
  return useMemo(() => db.tenants.find(t => t.id === activeTenantId), [db.tenants, activeTenantId]);
}

export function useActiveUser(db: DBState, activeUserId: string) {
  return useMemo(() => db.users.find(u => u.id === activeUserId), [db.users, activeUserId]);
}

export function useTenantData<T>(data: T[], tenantId: string) {
  return useMemo(() => {
    if (Array.isArray(data)) {
      return data.filter((item: any) => item.tenantId === tenantId) as any[];
    }
    return [];
  }, [data, tenantId]);
}

export function useCurrentUserRole(): User['role'] | undefined {
  const { db } = useDB();
  const { activeUserId } = useApp();
  return useMemo(() => db.users.find(u => u.id === activeUserId)?.role, [db.users, activeUserId]);
}

export function useIsAuthorized(allowedRoles: string[]): boolean {
  const role = useCurrentUserRole();
  return useMemo(() => role ? allowedRoles.includes(role) : false, [role, allowedRoles]);
}
