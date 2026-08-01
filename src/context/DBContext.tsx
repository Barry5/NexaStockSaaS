import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import type { DBState, NotificationItem, NotificationType, Tenant, User, Sale, Product, Customer, Supplier, Expense, Loan } from '../types';
import { fetchServerState, syncWithServer, pullRemoteChanges, flushPendingChanges, enqueueChange, extractChanges, getPendingCount, type SyncChange } from '../api/sync';
import { LOCAL_CACHE_KEY } from '../constants';
import { setItem as dexieSet, getItem as dexieGet, removeItem as dexieRemove } from '../lib/storage';

interface DBContextValue {
  db: DBState;
  isSyncing: boolean;
  syncError: boolean;
  isOnline: boolean;
  lastCacheTime: string;
  notifications: NotificationItem[];
  addNotification: (text: string, type?: NotificationType) => void;
  handleUpdateDb: (nextDb: DBState) => void;
  handleProductsUpdate: (nextProducts: Product[]) => void;
  handleAddSale: (newSale: Sale, nextProducts: Product[], nextCustomers: Customer[]) => void;
  handleUpdateExpenses: (nextExpenses: Expense[]) => void;
  handleUpdateLoans: (nextLoans: Loan[]) => void;
  handleUpdateCustomers: (nextCustomers: Customer[]) => void;
  handleUpdateSuppliers: (nextSuppliers: Supplier[]) => void;
  handleSyncFromServer: () => Promise<void>;
}

const DBContext = createContext<DBContextValue | null>(null);

function deepMergeDbState(local: DBState, remoteChanges: Record<string, unknown[]>, deletions: Record<string, string[]>): DBState {
  const merged = { ...local };

  for (const [table, records] of Object.entries(remoteChanges)) {
    if (!records.length) continue;
    const key = table as keyof DBState;
    const existing = (Array.isArray(merged[key]) ? merged[key] : []) as any[];
    const existingMap = new Map(existing.map(r => [r.id, r]));

    for (const record of records) {
      const rec = record as any;
      const existingRecord = existingMap.get(rec.id);
      if (!existingRecord) {
        existing.push(record);
      } else {
        const localVersion = existingRecord.version || 0;
        const remoteVersion = rec.version || 0;
        if (remoteVersion >= localVersion) {
          const idx = existing.findIndex(r => r.id === rec.id);
          if (idx >= 0) existing[idx] = record;
        }
      }
    }
    (merged as any)[key] = existing;
  }

  for (const [table, ids] of Object.entries(deletions)) {
    if (!ids.length) continue;
    const key = table as keyof DBState;
    const existing = (Array.isArray(merged[key]) ? merged[key] : []) as any[];
    (merged as any)[key] = existing.filter(r => !ids.includes(r.id));
  }

  return merged;
}

export function DBProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DBState>({
    tenants: [], users: [], products: [], sales: [],
    customers: [], suppliers: [], expenses: [], loans: [],
    warehouses: [], transfers: [], auditLogs: [],
    subscriptionInvoices: [], variants: [],
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [lastCacheTime, setLastCacheTime] = useState('');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const notifCounterRef = useRef(0);
  const dbRef = useRef(db);
  dbRef.current = db;
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addNotification = useCallback((text: string, type?: NotificationType) => {
    const id = `notif-${Date.now()}-${++notifCounterRef.current}`;
    const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    setNotifications(prev => [{ id, text, time, type: type || 'info' }, ...prev].slice(0, 10));
  }, []);

  const persistCache = useCallback((data: DBState) => {
    try {
      dexieSet(LOCAL_CACHE_KEY, JSON.stringify(data));
      setLastCacheTime(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch { /* storage error - ignore */ }
  }, []);

  const loadStateFromServer = useCallback(async () => {
    try {
      const data = await fetchServerState();
      setDb(data);
      persistCache(data);
      setSyncError(false);
    } catch {
      setSyncError(true);
    }
  }, [persistCache]);

  const flushNow = useCallback(async () => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    await flushPendingChanges();
    const pullResult = await pullRemoteChanges();
    if (pullResult && (Object.keys(pullResult.changes).length > 0 || Object.keys(pullResult.deletions).length > 0)) {
      setDb(prev => {
        const merged = deepMergeDbState(prev, pullResult.changes, pullResult.deletions);
        persistCache(merged);
        return merged;
      });
    }
  }, [persistCache]);

  const incrementalSync = useCallback(async (nextDb: DBState) => {
    setIsSyncing(true);
    try {
      const prevDb = dbRef.current;
      const changes = extractChanges(prevDb, nextDb);

      for (const change of changes) {
        enqueueChange(change);
      }

      if (isOnline) {
        if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
        flushTimerRef.current = setTimeout(() => {
          flushNow();
        }, 2000);
      }

      setDb(nextDb);
      persistCache(nextDb);
      setSyncError(false);
    } catch (error: any) {
      console.error('Sync error:', error?.message || error);
      setSyncError(true);
    } finally {
      setIsSyncing(false);
    }
  }, [persistCache, isOnline, flushNow]);

  const fullSync = useCallback(async (updatedDb: DBState) => {
    setIsSyncing(true);
    try {
      const savedData = await syncWithServer(updatedDb);
      if (savedData && typeof savedData === 'object') {
        setDb(savedData);
        persistCache(savedData);
        setSyncError(false);
      }
    } catch (error: any) {
      console.error('Full sync failed:', error?.message || error);
      setSyncError(true);
      if (error?.message?.includes('401') || error?.message?.includes('Token')) {
        addNotification('Session expirée. Veuillez vous reconnecter.', 'error');
      }
    } finally {
      setIsSyncing(false);
    }
  }, [persistCache, addNotification]);

  useEffect(() => {
    (async () => {
      const cached = await dexieGet(LOCAL_CACHE_KEY);
      if (cached) {
        try {
          const parsed: DBState = JSON.parse(cached);
          if (parsed && Array.isArray(parsed.tenants) && parsed.tenants.length > 0) {
            setDb(parsed);
          }
        } catch { /* invalid cache */ }
      }
    })();
    loadStateFromServer();

    const handleOnline = () => { setIsOnline(true); setSyncError(false); };
    const handleOffline = () => { setIsOnline(false); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [loadStateFromServer]);

  useEffect(() => {
    if (db.tenants?.length > 0) {
      persistCache(db);
    }
  }, [db, persistCache]);

  // Background sync cycle: push pending then pull remote
  useEffect(() => {
    if (!isOnline) return;
    const interval = setInterval(async () => {
      try {
        const count = await getPendingCount();
        if (count > 0) {
          await flushNow();
        } else {
          const pullResult = await pullRemoteChanges();
          if (pullResult && (Object.keys(pullResult.changes).length > 0 || Object.keys(pullResult.deletions).length > 0)) {
            setDb(prev => {
              const merged = deepMergeDbState(prev, pullResult.changes, pullResult.deletions);
              persistCache(merged);
              return merged;
            });
          }
        }
      } catch (error: any) {
        console.error('Background sync cycle failed:', error?.message || error);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [isOnline, persistCache, flushNow]);

  const handleUpdateDb = useCallback((nextDb: DBState) => {
    incrementalSync(nextDb);
  }, [incrementalSync]);

  const handleProductsUpdate = useCallback((nextProducts: Product[]) => {
    const nextDb = { ...db, products: nextProducts };
    incrementalSync(nextDb);
  }, [db, isOnline]);

  const handleAddSale = useCallback((newSale: Sale, nextProducts: Product[], nextCustomers: Customer[]) => {
    const nextDb = { ...db, sales: [...db.sales, newSale], products: nextProducts, customers: nextCustomers };
    incrementalSync(nextDb);
    addNotification(`Nouvelle vente enregistrée : ${newSale.invoiceNumber} (${newSale.customerName})`);
  }, [db, isOnline, addNotification]);

  const handleUpdateExpenses = useCallback((nextExpenses: Expense[]) => {
    try {
      const nextDb = { ...db, expenses: nextExpenses };
      incrementalSync(nextDb);
      addNotification('Registre des dépenses mis à jour.');
    } catch (error) {
      console.error('Erreur lors de la mise à jour des dépenses:', error);
      addNotification('Erreur lors de la mise à jour des dépenses.', 'error');
    }
  }, [db, isOnline, addNotification]);

  const handleUpdateLoans = useCallback((nextLoans: Loan[]) => {
    try {
      const nextDb = { ...db, loans: nextLoans };
      incrementalSync(nextDb);
      addNotification('Tableau des financements mis à jour.');
    } catch (error) {
      console.error('Erreur lors de la mise à jour des financements:', error);
      addNotification('Erreur lors de la mise à jour des financements.', 'error');
    }
  }, [db, isOnline, addNotification]);

  const handleUpdateCustomers = useCallback((nextCustomers: Customer[]) => {
    const nextDb = { ...db, customers: nextCustomers };
    incrementalSync(nextDb);
  }, [db, isOnline]);

  const handleUpdateSuppliers = useCallback((nextSuppliers: Supplier[]) => {
    const nextDb = { ...db, suppliers: nextSuppliers };
    incrementalSync(nextDb);
  }, [db, isOnline]);

  return (
    <DBContext.Provider value={{
      db, isSyncing, syncError, isOnline, lastCacheTime, notifications,
      addNotification, handleUpdateDb, handleProductsUpdate, handleAddSale,
      handleUpdateExpenses, handleUpdateLoans, handleUpdateCustomers, handleUpdateSuppliers,
      handleSyncFromServer: loadStateFromServer,
    }}>
      {children}
    </DBContext.Provider>
  );
}

export function useDB() {
  const ctx = useContext(DBContext);
  if (!ctx) throw new Error('useDB must be used within DBProvider');
  return ctx;
}
