import { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context';

interface ModuleDefinition {
  key: string;
  label?: string;
  icon?: string;
  is_core?: number;
  [key: string]: unknown;
}

interface ModuleState {
  availableModules: string[];
  allDefinitions: ModuleDefinition[];
  loading: boolean;
  error: string | null;
}

let globalModules: string[] = [];
let globalDefinitions: ModuleDefinition[] = [];
let globalModulesLoaded = false;
let globalModulesLoading = false;
let globalModulesListeners: Array<() => void> = [];
let globalModulesError: string | null = null;

function notifyModuleListeners() {
  globalModulesListeners.forEach(listener => listener());
}

function buildModuleState(): ModuleState {
  return {
    availableModules: globalModules,
    allDefinitions: globalDefinitions,
    loading: false,
    error: globalModulesError,
  };
}

async function ensureModulesLoaded() {
  if (globalModulesLoaded || globalModulesLoading) return;
  globalModulesLoading = true;
  try {
    const token = localStorage.getItem('nexastock_token');
    const response = await fetch('/api/modules/my-modules', {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!response.ok) {
      globalModulesError = 'Erreur de chargement des modules';
      return;
    }

    const data = await response.json();
    globalModules = Array.isArray(data?.modules) ? data.modules : [];
    globalDefinitions = Array.isArray(data?.definitions) ? data.definitions : [];
    globalModulesLoaded = true;
    globalModulesError = null;
  } catch {
    globalModulesError = 'Erreur réseau';
  } finally {
    globalModulesLoading = false;
    notifyModuleListeners();
  }
}

export function useAvailableModules(): ModuleState {
  const [state, setState] = useState<ModuleState>(() => ({
    availableModules: globalModules,
    allDefinitions: globalDefinitions,
    loading: !globalModulesLoaded && !globalModulesError,
    error: globalModulesError,
  }));

  useEffect(() => {
    ensureModulesLoaded();
    const listener = () => {
      setState({ ...buildModuleState(), loading: false });
    };
    globalModulesListeners.push(listener);
    return () => {
      globalModulesListeners = globalModulesListeners.filter(l => l !== listener);
    };
  }, []);

  return state;
}

export function useModuleAccess(moduleKey: string): boolean {
  const { availableModules } = useAvailableModules();
  const { activeUser } = useApp();
  return useMemo(() => {
    if (activeUser?.role === 'superadmin') return true;
    return availableModules.includes(moduleKey);
  }, [availableModules, moduleKey, activeUser]);
}

export function resetModuleCache() {
  globalModules = [];
  globalDefinitions = [];
  globalModulesLoaded = false;
  globalModulesError = null;
  notifyModuleListeners();
}
