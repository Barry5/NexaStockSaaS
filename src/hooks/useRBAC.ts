import { useState, useEffect, useMemo } from 'react';
import type { PermissionKey } from '../types';
import { useDB, useApp } from '../context';

interface RBACState {
  permissions: string[];
  loading: boolean;
  error: string | null;
}

let globalPermissions: string[] = [];
let globalRoles: any[] = [];
let globalLoaded = false;
let globalLoading = false;
let globalListeners: Array<() => void> = [];
let globalError: string | null = null;

function notifyListeners() {
  for (const l of globalListeners) l();
}

async function ensureLoaded() {
  if (globalLoaded) return;
  if (globalLoading) return;
  globalLoading = true;
  try {
    const token = localStorage.getItem('nexastock_token');
    const res = await fetch('/api/rbac/me', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      const data = await res.json();
      globalPermissions = data.permissions || [];
      globalRoles = data.roles || [];
      globalLoaded = true;
      globalError = null;
    } else {
      globalError = 'Erreur de chargement des permissions';
    }
  } catch {
    globalError = 'Erreur réseau';
  } finally {
    globalLoading = false;
    notifyListeners();
  }
}

export function usePermissions() {
  const [state, setState] = useState<RBACState>({
    permissions: globalPermissions,
    loading: !globalLoaded && !globalError,
    error: globalError,
  });

  useEffect(() => {
    ensureLoaded();
    const listener = () => {
      setState({
        permissions: globalPermissions,
        loading: false,
        error: globalError,
      });
    };
    globalListeners.push(listener);
    return () => {
      globalListeners = globalListeners.filter(l => l !== listener);
    };
  }, []);

  return state;
}

export function useCan(permissionKey: PermissionKey | string): boolean {
  const { permissions } = usePermissions();
  const { activeUser } = useApp();
  return useMemo(() => {
    if (activeUser?.role === 'superadmin') return true;
    return permissions.includes(permissionKey);
  }, [permissions, permissionKey, activeUser]);
}

export function useCanAny(permissionKeys: (PermissionKey | string)[]): boolean {
  const { permissions } = usePermissions();
  const { activeUser } = useApp();
  return useMemo(() => {
    if (activeUser?.role === 'superadmin') return true;
    return permissionKeys.some(k => permissions.includes(k));
  }, [permissions, permissionKeys, activeUser]);
}

export function useCanAll(permissionKeys: (PermissionKey | string)[]): boolean {
  const { permissions } = usePermissions();
  const { activeUser } = useApp();
  return useMemo(() => {
    if (activeUser?.role === 'superadmin') return true;
    return permissionKeys.every(k => permissions.includes(k));
  }, [permissions, permissionKeys, activeUser]);
}

export function useRoles() {
  const { roles, loading } = usePermissions();
  return { roles, loading };
}

// Reset cache (useful after login/logout)
export function resetRBACCache() {
  globalPermissions = [];
  globalRoles = [];
  globalLoaded = false;
  globalError = null;
  notifyListeners();
}
