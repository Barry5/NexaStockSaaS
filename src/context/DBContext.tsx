import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import type { DBState, NotificationItem, NotificationType, Tenant, User, Sale, Product, Customer, Supplier, Expense, Loan } from '../types';
import { fetchServerState, syncWithServer } from '../api/sync';
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

export function DBProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DBState>({
    tenants: [], users: [], products: [], sales: [],
    customers: [], suppliers: [], expenses: [], loans: [],
    warehouses: [], transfers: [], auditLogs: [],
    subscriptionInvoices: [], variants: []
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [lastCacheTime, setLastCacheTime] = useState('');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const notifCounterRef = useRef(0);

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

  const sync = useCallback(async (updatedDb: DBState) => {
    setIsSyncing(true);
    try {
      const savedData = await syncWithServer(updatedDb);
      if (savedData && typeof savedData === 'object') {
        setDb(savedData);
        persistCache(savedData);
        setSyncError(false);
      }
    } catch (error: any) {
      console.error('Sync failed:', error?.message || error);
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

  const handleUpdateDb = useCallback((nextDb: DBState) => {
    setDb(nextDb);
    return sync(nextDb);
  }, [sync]);

  const handleProductsUpdate = useCallback((nextProducts: Product[]) => {
    const nextDb = { ...db, products: nextProducts };
    setDb(nextDb);
    sync(nextDb);
  }, [db, sync]);

  const handleAddSale = useCallback((newSale: Sale, nextProducts: Product[], nextCustomers: Customer[]) => {
    const nextDb = { ...db, sales: [...db.sales, newSale], products: nextProducts, customers: nextCustomers };
    setDb(nextDb);
    sync(nextDb);
    addNotification(`Nouvelle vente enregistrée : ${newSale.invoiceNumber} (${newSale.customerName})`);
  }, [db, sync, addNotification]);

  const handleUpdateExpenses = useCallback((nextExpenses: Expense[]) => {
    try {
      const nextDb = { ...db, expenses: nextExpenses };
      setDb(nextDb);
      sync(nextDb);
      addNotification('Registre des dépenses mis à jour.');
    } catch (error) {
      console.error('Erreur lors de la mise à jour des dépenses:', error);
      addNotification('Erreur lors de la mise à jour des dépenses.', 'error');
    }
  }, [db, sync, addNotification]);

  const handleUpdateLoans = useCallback((nextLoans: Loan[]) => {
    try {
      const nextDb = { ...db, loans: nextLoans };
      setDb(nextDb);
      sync(nextDb);
      addNotification('Tableau des financements mis à jour.');
    } catch (error) {
      console.error('Erreur lors de la mise à jour des financements:', error);
      addNotification('Erreur lors de la mise à jour des financements.', 'error');
    }
  }, [db, sync, addNotification]);

  const handleUpdateCustomers = useCallback((nextCustomers: Customer[]) => {
    const nextDb = { ...db, customers: nextCustomers };
    setDb(nextDb);
    sync(nextDb);
  }, [db, sync]);

  const handleUpdateSuppliers = useCallback((nextSuppliers: Supplier[]) => {
    const nextDb = { ...db, suppliers: nextSuppliers };
    setDb(nextDb);
    sync(nextDb);
  }, [db, sync]);

  return (
    <DBContext.Provider value={{
      db, isSyncing, syncError, isOnline, lastCacheTime, notifications,
      addNotification, handleUpdateDb, handleProductsUpdate, handleAddSale,
      handleUpdateExpenses, handleUpdateLoans, handleUpdateCustomers, handleUpdateSuppliers,
      handleSyncFromServer: loadStateFromServer
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
