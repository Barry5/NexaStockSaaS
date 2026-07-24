import { useState, useEffect, useMemo, useCallback, Suspense, lazy, FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard, Package, ShoppingBag, Users, Coins, Sparkles,
  Settings, Cloud, CloudLightning, CloudOff, Bell, Menu, X, Lock,
  Building, AlertOctagon, AlertTriangle, CreditCard, Database, Shield,
  BarChart3, FileText, LifeBuoy, Award, Check, ShieldCheck, Truck
} from 'lucide-react';

import type { TabType, DBState, Sale, Product, Customer, Tenant, User, SubscriptionPlan, SubscriptionPayment } from './types';

import { DBProvider, useDB, AppProvider, useApp } from './context';
import { LOCAL_CACHE_KEY, DEFAULT_PRICING_PLANS, AUTH_TOKEN_KEY } from './constants';
import { formatCurrency } from './utils';
import { useAvailableModules } from './hooks/useModules';

const LazyDashboard = lazy(() => import('./components/Dashboard'));
const LazyProducts = lazy(() => import('./components/Products'));
const LazyPOS = lazy(() => import('./components/POS'));
const LazyCustomers = lazy(() => import('./components/Customers'));
const LazyExpenses = lazy(() => import('./components/Expenses'));
const LazyAIRestock = lazy(() => import('./components/AIRestock'));
const LazySaaSSettings = lazy(() => import('./components/SaaSSettings'));
const LazySaaSAuth = lazy(() => import('./components/SaaSAuth'));
const LazySaaSAdmin = lazy(() => import('./components/SaaSAdmin'));
const LazyUserManagement = lazy(() => import('./components/UserManagement'));
const LazyInvoicing = lazy(() => import('./components/Invoicing'));
const LazyCommissions = lazy(() => import('./components/Commissions'));
const LazyDeliveryNotes = lazy(() => import('./components/DeliveryNotes'));
const LazyRBACManager = lazy(() => import('./components/RBACManager'));

function AppShell() {
  const {
    db, isSyncing, syncError, isOnline, lastCacheTime, notifications,
    addNotification, handleUpdateDb, handleProductsUpdate, handleAddSale,
    handleUpdateExpenses, handleUpdateLoans, handleUpdateCustomers, handleUpdateSuppliers
  } = useDB();

  const {
    isLoggedIn, setIsLoggedIn, activeTenantId, setActiveTenantId,
    activeUserId, setActiveUserId, currentTab, setCurrentTab,
    saasSubTab, setSaasSubTab, sidebarOpen, setSidebarOpen,
    activeTenant, activeUser, handleSwitchTenant, handleSwitchUser,
    handleUpdateTenantPlan, handleLoginSuccess, handleRegisterTenant
  } = useApp();

  // Lock screen payment declaration states
  const [showLockPaymentForm, setShowLockPaymentForm] = useState(false);
  const [lockPlan, setLockPlan] = useState('Standard');
  const [lockMethod, setLockMethod] = useState('Orange Money');
  const [lockRef, setLockRef] = useState('');
  const [lockPhone, setLockPhone] = useState('');
  const [lockAmount, setLockAmount] = useState('29');
  const [lockComment, setLockComment] = useState('');
  const [lockReceiptImage, setLockReceiptImage] = useState('');

  // Passwordless Security Configuration States
  const [showSecurePasswordModal, setShowSecurePasswordModal] = useState(false);
  const [securePassword, setSecurePassword] = useState('');
  const [securePasswordConfirm, setSecurePasswordConfirm] = useState('');
  const [securePasswordError, setSecurePasswordError] = useState('');

  // Document title
  useEffect(() => {
    if (isLoggedIn) {
      if (activeUser?.role === 'superadmin') {
        document.title = "Console SaaS Root Administrator";
      } else if (activeTenant?.name) {
        document.title = `${activeTenant.name} | Gestion de Stock & Ventes`;
      } else {
        document.title = "Mon ERP Personnel";
      }
    } else {
      document.title = "NexaStock SaaS Central";
    }
  }, [isLoggedIn, activeTenant, activeUser]);

  // Auto-dismiss toast notifications after 6s
  const [dismissedToasts, setDismissedToasts] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (notifications.length === 0) return;
    const latest = notifications[0];
    const timer = setTimeout(() => {
      setDismissedToasts(prev => new Set(prev).add(latest.id));
    }, 6000);
    return () => clearTimeout(timer);
  }, [notifications]);

  const pricingPlans = useMemo(() => {
    if (db.pricingPlans && db.pricingPlans.length > 0) return db.pricingPlans;
    return DEFAULT_PRICING_PLANS.map(p => ({ ...p, currency: db.saasCurrency || 'EUR' }));
  }, [db.pricingPlans, db.saasCurrency]);

  const isSuspended = useMemo(() => {
    if (!activeTenant) return false;
    return activeTenant.subscriptionStatus === 'SUSPENDED' ||
           activeTenant.subscriptionStatus === 'BLOCKED' ||
           activeTenant.subscriptionStatus === 'EXPIRED' ||
           activeTenant.description?.includes('[SUSPENDU]');
  }, [activeTenant]);

  const handlePaySuspension = useCallback(() => {
    if (!activeTenantId) return;
    const updatedTenants = db.tenants.map(t => {
      if (t.id === activeTenantId) {
        return { ...t, subscriptionStatus: 'ACTIVE' as const, description: t.description.replace(' [SUSPENDU]', '') };
      }
      return t;
    });
    handleUpdateDb({ ...db, tenants: updatedTenants });
    addNotification("Abonnement régularisé provisoirement !.");
  }, [activeTenantId, db, handleUpdateDb, addNotification]);

  const handleSaveSecurePassword = useCallback((e: FormEvent) => {
    e.preventDefault();
    if (securePassword.length < 4) {
      setSecurePasswordError("Le mot de passe doit comporter au moins 4 caractères.");
      return;
    }
    if (securePassword !== securePasswordConfirm) {
      setSecurePasswordError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    const nextUsers = db.users.map(u => {
      if (u.id === activeUserId) return { ...u, password: securePassword, firstLoginReset: false };
      return u;
    });
    handleUpdateDb({ ...db, users: nextUsers });
    addNotification("Votre mot de passe a été configuré avec succès ! Votre espace est sécurisé.");
    setShowSecurePasswordModal(false);
    setSecurePassword('');
    setSecurePasswordConfirm('');
    setSecurePasswordError('');
  }, [securePassword, securePasswordConfirm, db, activeUserId, handleUpdateDb, addNotification]);

  const handleOfflinePaymentFromLock = useCallback((paymentData: SubscriptionPayment) => {
    const nextPayments = [paymentData, ...(db.subscriptionPayments || [])];
    handleUpdateDb({
      ...db,
      subscriptionPayments: nextPayments,
      tenants: db.tenants.map(t => t.id === activeTenantId ? { ...t, subscriptionStatus: 'PENDING' as const } : t)
    });
    addNotification("Reçu de paiement transmis à l'administrateur ! Analyse en cours.");
  }, [db, activeTenantId, handleUpdateDb, addNotification]);

  const { availableModules } = useAvailableModules();

  const sidebarMenuItems = useMemo(() => {
    const moduleMap: Record<string, string> = {
      dashboard: 'dashboard',
      invoicing: 'invoices',
      'delivery-notes': 'invoices',
      commissions: 'commissions',
      pos: 'sales',
      products: 'products',
      expenses: 'expenses',
      crm: 'customers',
      ai: 'ai',
      users: 'users',
      rbac: 'users',
      settings: 'settings',
      warehouses: 'warehouses',
      reports: 'reports',
    };

    const items = [
      { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard, module: 'dashboard' },
      { id: 'invoicing', label: 'Facturation ERP', icon: FileText, module: 'invoices' },
      { id: 'delivery-notes', label: 'Bons de Livraison', icon: Truck, module: 'invoices' },
      { id: 'commissions', label: 'Commissions', icon: Award, module: 'commissions' },
      { id: 'pos', label: 'Caisse de Vente POS', icon: ShoppingBag, module: 'sales' },
      { id: 'products', label: 'Produits & Stocks', icon: Package, module: 'products' },
      { id: 'expenses', label: 'Dépenses & Prêts', icon: Coins, module: 'expenses' },
      { id: 'crm', label: 'Clients & Grossistes', icon: Users, module: 'customers' },
      { id: 'ai', label: 'Réapprovisionnement IA', icon: Sparkles, badge: 'Gemini', module: 'ai' },
      { id: 'users', label: "Gestion d'Équipe", icon: Shield, module: 'users' },
      { id: 'rbac', label: 'Permissions (RBAC)', icon: ShieldCheck, module: 'users' },
      { id: 'settings', label: 'Abonnements & Multi-boutique', icon: Settings, module: 'settings' }
    ];
    if (!activeUser) return items;

    const roleMap: Record<string, string[]> = {
      vendeur: ['dashboard', 'pos', 'invoicing', 'settings'],
      comptable: ['dashboard', 'invoicing', 'commissions', 'expenses', 'settings'],
      'gestionnaire de stock': ['dashboard', 'products', 'ai', 'settings'],
      superadmin: ['saasadmin'],
    };
    let allowedIds = roleMap[activeUser.role] || ['dashboard', 'invoicing', 'commissions', 'products', 'pos', 'crm', 'expenses', 'ai', 'users', 'rbac', 'settings'];
    const filtered = items.filter(item => {
      if (!allowedIds.includes(item.id)) return false;
      if (activeUser.role === 'superadmin') return true;
      if (availableModules.length > 0 && !availableModules.includes(item.module)) return false;
      return true;
    });
    if (activeUser.role === 'superadmin') {
      filtered.push({ id: 'saasadmin', label: 'Console SaaS Admin', icon: Lock, badge: 'Root', module: '' });
    }
    return filtered;
  }, [activeUser, availableModules]);

  useEffect(() => {
    if (isLoggedIn && sidebarMenuItems.length > 0) {
      const isAllowed = sidebarMenuItems.some(item => item.id === currentTab);
      if (!isAllowed) setCurrentTab(sidebarMenuItems[0].id as TabType);
    }
  }, [sidebarMenuItems, currentTab, isLoggedIn, setCurrentTab]);

  if (!isLoggedIn) {
    return <LazySaaSAuth />;
  }

  const currentTabLabel = currentTab === 'dashboard' ? 'Tableau de bord' :
    currentTab === 'invoicing' ? 'Facturation ERP' :
    currentTab === 'commissions' ? 'Commissions' :
    currentTab === 'pos' ? 'Caisse de Vente' :
    currentTab === 'products' ? 'Produits & Stocks' :
    currentTab === 'crm' ? 'Clients' :
    currentTab === 'expenses' ? 'Dépenses' :
    currentTab === 'ai' ? 'Réapprovisionnement IA' :
    currentTab === 'users' ? 'Équipe' :
    currentTab === 'rbac' ? 'Permissions' : 'Paramètres';

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans flex antialiased selection:bg-blue-600/30 selection:text-white">

      {/* MOBILE HEADER BAR */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 z-40">
        <div className="flex items-center gap-2 max-w-[65%] min-w-0">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400 flex-shrink-0">
            <Menu className="w-5 h-5" />
          </button>
          {activeUser?.role === 'superadmin' ? (
            <div className="flex items-center gap-1 min-w-0 bg-gray-950 border border-gray-800 px-2 py-0.5 rounded-lg">
              <span className="text-[9px] font-mono font-bold text-red-400 flex-shrink-0">SUPER:</span>
              <select value={activeTenantId} onChange={(e) => handleSwitchTenant(e.target.value)}
                className="bg-transparent text-[11px] font-bold text-white focus:outline-none cursor-pointer border-none p-0 pr-4 font-sans max-w-[100px] truncate">
                {db.tenants.map(t => <option key={t.id} value={t.id} className="bg-gray-900 text-white text-xs">{t.name}</option>)}
              </select>
            </div>
          ) : (
            <span className="text-xs font-black tracking-wide text-white truncate uppercase">{activeTenant?.name || "Mon Application"}</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center gap-1 bg-gray-950 px-1.5 py-0.5 rounded border border-gray-800/80 text-[8px] font-mono font-bold text-cyan-400 select-none"
            title={`Cache local persistant. Dernier : ${lastCacheTime}`}>
            <Database className="w-2.5 h-2.5" /><span>LOCAL</span>
          </div>
          {activeUser?.role !== 'superadmin' && (
            <span className="text-[8px] font-mono font-extrabold bg-blue-600/10 text-blue-400 border border-blue-500/10 px-1 rounded">{activeTenant?.plan}</span>
          )}
        </div>
      </div>

      {/* SIDEBAR */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 border-r border-gray-850 flex flex-col justify-between transform transition-transform duration-300 lg:relative lg:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div>
          <div className="h-16 px-5 border-b border-gray-850 flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              {activeUser?.role === 'superadmin' ? (
                <>
                  <div className="w-7 h-7 bg-red-600 rounded-lg flex items-center justify-center font-bold text-xs text-white shadow-lg shadow-red-500/20 flex-shrink-0">SA</div>
                  <span className="font-bold tracking-wider text-[11px] font-mono text-white truncate">ADMIN PLATEFORME</span>
                </>
              ) : (
                <>
                  {activeTenant?.logo ? (
                    <img src={activeTenant.logo} alt={activeTenant.name} className="w-7 h-7 rounded-lg object-cover border border-gray-800 flex-shrink-0" />
                  ) : (
                    <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-sm text-white shadow-lg shadow-blue-500/20 flex-shrink-0">
                      {(activeTenant?.name?.[0] || 'O').toUpperCase()}
                    </div>
                  )}
                  <span className="font-bold tracking-wider text-xs font-display text-white truncate uppercase">{activeTenant?.name || 'Mon ERP'}</span>
                </>
              )}
            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 hover:bg-gray-800 rounded-lg text-gray-400">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 border-b border-gray-850 bg-gray-950/20">
            {activeUser?.role === 'superadmin' ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-amber-600 flex items-center justify-center font-bold text-white shadow-md shadow-red-500/15 flex-shrink-0">SA</div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-gray-200 truncate">{activeUser?.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                    <span className="text-[9px] font-mono font-bold text-red-400 uppercase tracking-widest">Superviseur SaaS</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <img src={activeTenant?.logo || "https://images.unsplash.com/photo-1549421263-524f8dcef8d3?w=100&auto=format&fit=crop&q=60"}
                  alt={activeTenant?.name} className="w-10 h-10 rounded-xl object-cover border border-gray-800 shadow-md flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-gray-200 truncate">{activeTenant?.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    <span className="text-[9px] font-mono font-bold text-blue-400 uppercase tracking-widest">Licence {activeTenant?.plan}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <nav className="p-3.5 space-y-1">
            {sidebarMenuItems.map(item => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button key={item.id}
                  onClick={() => { setCurrentTab(item.id as TabType); setSidebarOpen(false); }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition ${
                    isActive ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-500/10' : 'text-gray-400 hover:text-white hover:bg-gray-850'
                  }`}>
                  <span className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-gray-500'}`} />
                    {item.label}
                  </span>
                  {item.badge && (
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${item.badge === 'Gemini' ? 'bg-purple-500/10 border border-purple-500/15 text-purple-400' : 'bg-red-500/10 border border-red-500/15 text-red-400'}`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-gray-850 bg-gray-950/40 text-xs text-gray-500 font-mono space-y-2">
          <div className="flex justify-between items-center text-[10px]">
            <span>Statut Sync :</span>
            {isSyncing ? <span className="text-blue-400 animate-pulse">Fusion...</span> : <span className="text-emerald-400">Sauvegardé</span>}
          </div>
          <button onClick={() => { setIsLoggedIn(false); setActiveUserId(''); setActiveTenantId(''); localStorage.removeItem('nexastock_session'); }}
            className="w-full text-center py-1 bg-gray-950 hover:bg-gray-850 border border-gray-850 text-gray-400 hover:text-white text-[10px] rounded transition uppercase font-bold">
            Se déconnecter
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col min-w-0 relative lg:pt-0 pt-14">

        {/* TOP HEADER */}
        <header className="hidden lg:flex h-16 border-b border-gray-850 px-6 items-center justify-between bg-gray-900/40 backdrop-blur-md sticky top-0 z-35">
          <div className="flex items-center gap-3">
            {activeUser?.role === 'superadmin' ? (
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-red-400 font-mono flex items-center gap-1.5 bg-red-500/10 border border-red-500/15 px-2.5 py-1 rounded-full">
                  <Shield className="w-3.5 h-3.5" /> Superviseur Plateforme</span>
                <span className="text-gray-700 font-mono">|</span>
                <div className="flex items-center gap-2 bg-gray-950 border border-gray-850 px-3 py-1.5 rounded-xl shadow-inner">
                  <span className="text-[10px] font-mono font-bold text-gray-500 uppercase">Organisation inspectée :</span>
                  <select value={activeTenantId} onChange={(e) => handleSwitchTenant(e.target.value)}
                    className="bg-transparent text-xs font-sans font-bold text-white focus:outline-none cursor-pointer border-none p-0 pr-6">
                    {db.tenants.map(t => (
                      <option key={t.id} value={t.id} className="bg-gray-900 text-white font-sans font-bold">{t.name} (Plan {t.plan})</option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-black font-display text-white tracking-wide uppercase">{activeTenant?.name}</h2>
                <span className="text-gray-700">/</span>
                <span className="text-xs font-semibold text-gray-400 bg-gray-950 px-2.5 py-1 rounded-lg border border-gray-850 capitalize font-mono">{currentTabLabel}</span>
              </div>
            )}

            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-mono select-none transition-all duration-300 ${
              isOnline ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 border-amber-500/15 text-amber-400 animate-pulse'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-amber-400 animate-ping'}`} />
              <span>{isOnline ? 'Internet : Connecté' : 'Mode Hors-Ligne (Offline)'}</span>
            </div>

            <div className="flex items-center gap-1.5 bg-gray-950 px-2.5 py-1 rounded-full border border-gray-850 text-[10px] font-mono select-none"
              title={`Données persistées dans localStorage. Dernier : ${lastCacheTime || 'Inconnu'}`}>
              <Database className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-gray-400">Cache : <span className="text-cyan-400 font-bold uppercase">Persistant</span></span>
              {lastCacheTime && <span className="text-[9px] text-gray-500 font-normal">({lastCacheTime})</span>}
            </div>

            <div className="flex items-center gap-1.5 bg-gray-950 px-2.5 py-1 rounded-full border border-gray-850 text-[10px] font-mono">
              {isSyncing ? (
                <><CloudLightning className="w-3.5 h-3.5 text-blue-500 animate-bounce" /><span className="text-blue-500">Synchro Cloud...</span></>
              ) : syncError ? (
                <><CloudOff className="w-3.5 h-3.5 text-red-400" /><span className="text-red-400">Non synchronisé</span></>
              ) : (
                <><Cloud className="w-3.5 h-3.5 text-emerald-400" /><span className="text-emerald-400 font-semibold font-sans">SaaS Cloud</span></>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative group cursor-pointer">
              <div className="bg-gray-800 hover:bg-gray-750 p-2 rounded-xl transition relative">
                <Bell className="w-4 h-4 text-gray-400 group-hover:text-white" />
                {notifications.length > 0 && (
                  <span className={`absolute top-1 right-1 w-2 h-2 rounded-full ${
                    notifications.some(n => n.type === 'error') ? 'bg-red-400 animate-pulse' : 'bg-emerald-400'
                  }`}></span>
                )}
              </div>
              <div className="absolute right-0 mt-2.5 w-72 bg-gray-900 border border-gray-850 rounded-xl shadow-xl p-3 hidden group-hover:block z-50 text-xs max-h-80 overflow-y-auto">
                <p className="font-bold text-gray-300 pb-1.5 border-b border-gray-800 mb-2 flex items-center justify-between">
                  <span>Notifications</span>
                  {notifications.length > 0 && (
                    <span className="text-[9px] text-gray-500 font-mono">{notifications.length}</span>
                  )}
                </p>
                {notifications.length > 0 ? (
                  <div className="space-y-1.5">
                    {notifications.map(not => {
                      const borderColor = not.type === 'error' ? 'border-red-500' : not.type === 'warning' ? 'border-amber-500' : not.type === 'success' ? 'border-emerald-500' : 'border-blue-500';
                      return (
                        <div key={not.id} className={`text-[10px] text-gray-400 font-mono border-l-2 ${borderColor} pl-2 py-1`}>
                          <p className="text-gray-200 font-sans leading-normal text-[10.5px]">{not.text}</p>
                          <p className="text-gray-600 mt-0.5 text-[9px]">{not.time}</p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-gray-500 italic text-center py-4">Aucune notification</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2.5 border-l border-gray-850 pl-4">
              <div className="text-right">
                <p className="text-xs font-bold text-gray-200">{activeUser?.name || 'Collaborateur'}</p>
                <p className="text-[9px] text-gray-500 font-mono uppercase tracking-wider font-bold text-blue-400">{activeUser?.role}</p>
              </div>
              {activeUser?.avatar ? (
                <img src={activeUser.avatar} alt={activeUser.name} className="w-8 h-8 rounded-full border border-gray-800 object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center font-bold text-xs text-blue-400">
                  {activeUser?.name[0] || 'U'}
                </div>
              )}
            </div>
          </div>
        </header>

        {activeUser?.firstLoginReset && (
          <div className="bg-amber-600/10 border-b border-amber-500/15 px-6 py-2.5 flex items-center justify-between text-xs text-amber-200">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 animate-pulse" />
              <span>
                <strong>Sécurité de l'espace :</strong> Vous vous êtes inscrit sans mot de passe. Veuillez configurer un mot de passe pour protéger les données de votre organisation <strong>{activeTenant?.name}</strong>.
              </span>
            </div>
            <button onClick={() => setShowSecurePasswordModal(true)}
              className="bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold px-3 py-1 rounded-lg transition text-[10.5px] font-mono shadow-md">
              Définir mon mot de passe
            </button>
          </div>
        )}

        <div className="flex-1 p-4 lg:p-6.5 pb-24 lg:pb-6.5 overflow-y-auto relative">
          <AnimatePresence mode="wait">
            {isSuspended ? (
              <motion.div key="suspended-shield"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-gray-950/98 backdrop-blur-md z-40 flex flex-col items-center justify-center p-6 overflow-y-auto">
                <div className="max-w-xl w-full bg-gray-900 border border-red-500/30 p-8 rounded-3xl shadow-2xl space-y-6">
                  <div className="text-center space-y-3">
                    <div className="w-14 h-14 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center text-red-400 mx-auto animate-pulse">
                      <AlertOctagon className="w-7 h-7" />
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-lg font-black text-white font-display uppercase tracking-wide">Espace de Travail Verrouillé</h3>
                      <p className="text-xs text-gray-400 leading-relaxed max-w-sm mx-auto">
                        Votre organisation <strong className="text-white">{activeTenant?.name}</strong> est inactive ou suspendue car votre forfait <strong className="text-blue-400">{activeTenant?.plan}</strong> a expiré.
                      </p>
                    </div>
                  </div>

                  {activeTenant?.subscriptionStatus === 'PENDING' ? (
                    <div className="bg-blue-500/5 border border-blue-500/20 p-5 rounded-2xl text-center space-y-3">
                      <p className="text-xs text-blue-400 font-bold uppercase font-mono tracking-wider animate-pulse">⌛ Vérification comptable en cours</p>
                      <p className="text-[11px] text-gray-400 leading-normal">Vous avez déclaré un reçu de paiement. Notre administrateur audite actuellement votre transaction pour activer votre forfait.</p>
                    </div>
                  ) : !showLockPaymentForm ? (
                    <div className="space-y-4">
                      <div className="bg-gray-950 border border-gray-850 p-4.5 rounded-2xl flex items-center justify-between text-left">
                        <div>
                          <p className="text-[10px] font-mono text-gray-500 uppercase">Abonnement Mensuel</p>
                          <p className="text-xs font-bold text-white">Forfait de Référence : {activeTenant?.plan}</p>
                        </div>
                        <span className="text-sm font-black font-mono text-red-400">
                          {(() => {
                            const planObj = pricingPlans.find(p => p.name === (activeTenant?.plan || 'Standard'));
                            const price = planObj?.price || 29;
                            const currency = planObj?.currency || db.saasCurrency || 'EUR';
                            return `${price} ${currency} / mois`;
                          })()}
                        </span>
                      </div>

                      <div className="bg-gray-950 border border-gray-850 p-4 rounded-xl text-left space-y-2 text-[11px]">
                        <p className="font-bold text-gray-300 uppercase font-mono tracking-wider text-[10px]">Instructions de virement / versement :</p>
                        <p className="text-gray-400 font-sans leading-normal whitespace-pre-line">
                          {db.globalSaaSSettings?.paymentInstructions || "Veuillez effectuer le virement ou transfert, puis déclarer la transaction ci-dessous."}
                        </p>
                        <div className="grid grid-cols-2 gap-3.5 pt-2 border-t border-gray-900 font-mono">
                          <div>
                            <span className="text-gray-500 text-[10px] block font-bold">Orange Money :</span>
                            <span className="text-gray-300 font-black block">{db.globalSaaSSettings?.orangeMoneyNumber || "+224 620 00 00 00"}</span>
                            <span className="text-[10px] text-gray-500 block">Nom : {db.globalSaaSSettings?.orangeMoneyName || "NexaStock SAS"}</span>
                          </div>
                          <div>
                            <span className="text-gray-500 text-[10px] block font-bold">Mobile Money / MTN :</span>
                            <span className="text-gray-300 font-black block">{db.globalSaaSSettings?.mobileMoneyNumber || "+224 660 11 22 33"}</span>
                            <span className="text-[10px] text-gray-500 block">Nom : {db.globalSaaSSettings?.mobileMoneyName || "Hassim Barry"}</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 pt-2">
                        <button onClick={() => setShowLockPaymentForm(true)}
                          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 shadow-lg shadow-blue-500/15">
                          <CreditCard className="w-4 h-4" /> Déclarer un versement effectué</button>
                        <button onClick={handlePaySuspension}
                          className="w-full bg-gray-950 hover:bg-gray-850 border border-gray-850 text-gray-400 hover:text-white text-[10.5px] font-mono font-bold py-1.5 rounded-xl transition">
                          Bypass Démo (Activer Provisoirement)</button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      if (!lockRef || !lockPhone) { alert("Veuillez saisir les références du transfert."); return; }
                      const paymentObj: SubscriptionPayment = {
                        id: `pay-${Date.now()}`, tenantId: activeTenantId,
                        tenantName: activeTenant?.name || "Boutique",
                        planId: `plan-${lockPlan.toLowerCase()}`, planName: lockPlan,
                        amount: Number(lockAmount), currency: activeTenant?.currency || 'EUR',
                        paymentMethod: lockMethod, reference: lockRef,
                        transactionNumber: lockPhone, date: new Date().toISOString().split('T')[0],
                        comment: lockComment,
                        receiptImage: lockReceiptImage || "https://images.unsplash.com/photo-1554415707-6e8cfc93fe23?w=300&fit=crop&q=80",
                        status: 'PENDING', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
                      };
                      handleOfflinePaymentFromLock(paymentObj);
                      setShowLockPaymentForm(false);
                    }} className="text-left space-y-3.5 bg-gray-950 border border-gray-850 p-5 rounded-2xl">
                      <h4 className="text-xs font-bold text-white uppercase font-mono tracking-wider flex items-center gap-1">Déclarer mon paiement</h4>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <label className="text-[10px] font-mono text-gray-500 block mb-1">FORFAIT SOUHAITÉ</label>
                          <select value={lockPlan} onChange={(e) => { setLockPlan(e.target.value); const p = pricingPlans.find(p => p.name === e.target.value); setLockAmount(p ? String(p.price) : '29'); }}
                            className="w-full bg-gray-900 border border-gray-800 rounded-lg p-1.5 text-xs text-white">
                            {pricingPlans.map(p => <option key={p.id} value={p.name}>{p.name} ({p.price} {p.currency})</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-mono text-gray-500 block mb-1">MÉTHODE UTILISÉE</label>
                          <select value={lockMethod} onChange={(e) => setLockMethod(e.target.value)} className="w-full bg-gray-900 border border-gray-800 rounded-lg p-1.5 text-xs text-white">
                            <option value="Orange Money">Orange Money</option>
                            <option value="Mobile Money (MTN)">MTN Mobile Money</option>
                            <option value="Wave">Wave</option>
                            <option value="Virement Bancaire">Virement Bancaire</option>
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <label className="text-[10px] font-mono text-gray-500 block mb-1">RÉFÉRENCE TRANSACTION *</label>
                          <input type="text" required placeholder="ex: TXN-12345678" value={lockRef} onChange={(e) => setLockRef(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-800 rounded-lg p-1.5 text-xs text-white font-mono" />
                        </div>
                        <div>
                          <label className="text-[10px] font-mono text-gray-500 block mb-1">N° DE TÉLÉPHONE ÉMETTEUR *</label>
                          <input type="text" required placeholder="ex: +224 620..." value={lockPhone} onChange={(e) => setLockPhone(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-800 rounded-lg p-1.5 text-xs text-white font-mono" />
                        </div>
                      </div>
                      <div className="space-y-1 text-xs">
                        <label className="text-[10px] font-mono text-gray-500 block">LIEN DE CAPTURE DU REÇU (OPTIONNEL)</label>
                        <input type="text" placeholder="Collez l'URL de votre capture ou laissez vide" value={lockReceiptImage} onChange={(e) => setLockReceiptImage(e.target.value)}
                          className="w-full bg-gray-900 border border-gray-800 rounded-lg p-1.5 text-xs text-white font-mono" />
                      </div>
                      <div className="space-y-1 text-xs">
                        <label className="text-[10px] font-mono text-gray-500 block">NOTE SOUHAITÉE (OPTIONNELLE)</label>
                        <input type="text" placeholder="Ajoutez des notes utiles à la comptabilité" value={lockComment} onChange={(e) => setLockComment(e.target.value)}
                          className="w-full bg-gray-900 border border-gray-800 rounded-lg p-1.5 text-xs text-white" />
                      </div>
                      <div className="flex gap-2 pt-1 text-xs justify-end">
                        <button type="button" onClick={() => setShowLockPaymentForm(false)}
                          className="bg-gray-900 border border-gray-800 text-gray-400 font-bold px-3 py-1.5 rounded-lg hover:text-white">Annuler</button>
                        <button type="submit"
                          className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-1.5 rounded-lg shadow-lg shadow-blue-500/10">Envoyer le reçu</button>
                      </div>
                    </form>
                  )}
                  <div className="text-[10px] text-gray-500 font-mono text-center">ID d'isolation : {activeTenantId} | NexaStock Cloud Central</div>
                </div>
              </motion.div>
            ) : (
              <motion.div key={currentTab} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.15 }}>
                {currentTab === 'dashboard' && (
                  <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-500 text-sm">Chargement du tableau de bord...</div>}>
                    <LazyDashboard />
                  </Suspense>
                )}
                {currentTab === 'products' && (
                  <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-500 text-sm">Chargement...</div>}>
                    <LazyProducts />
                  </Suspense>
                )}
                {currentTab === 'pos' && (
                  <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-500 text-sm">Chargement de la caisse...</div>}>
                    <LazyPOS />
                  </Suspense>
                )}
                {currentTab === 'crm' && (
                  <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-500 text-sm">Chargement...</div>}>
                    <LazyCustomers />
                  </Suspense>
                )}
                {currentTab === 'expenses' && (
                  <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-500 text-sm">Chargement...</div>}>
                    <LazyExpenses />
                  </Suspense>
                )}
                {currentTab === 'invoicing' && (
                  <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-500 text-sm">Chargement de la facturation...</div>}>
                    <LazyInvoicing />
                  </Suspense>
                )}
                {currentTab === 'commissions' && (
                  <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-500 text-sm">Chargement des commissions...</div>}>
                    <LazyCommissions />
                  </Suspense>
                )}
                {currentTab === 'delivery-notes' && (
                  <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-500 text-sm">Chargement des BL...</div>}>
                    <LazyDeliveryNotes />
                  </Suspense>
                )}
                {currentTab === 'ai' && (
                  <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-500 text-sm">Chargement de l'IA...</div>}>
                    <LazyAIRestock />
                  </Suspense>
                )}
                {currentTab === 'settings' && (
                  <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-500 text-sm">Chargement...</div>}>
                    <LazySaaSSettings />
                  </Suspense>
                )}
                {currentTab === 'users' && (
                  <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-500 text-sm">Chargement...</div>}>
                    <LazyUserManagement />
                  </Suspense>
                )}
                {currentTab === 'rbac' && (
                  <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-500 text-sm">Chargement des permissions...</div>}>
                    <LazyRBACManager />
                  </Suspense>
                )}
                {currentTab === 'saasadmin' && activeUser?.role === 'superadmin' && (
                  <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-500 text-sm">Chargement de la console admin...</div>}>
                    <LazySaaSAdmin />
                  </Suspense>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* MOBILE BOTTOM NAV */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-gray-900/95 backdrop-blur-lg border-t border-gray-850 flex items-center justify-around px-1 z-40 shadow-2xl">
        {(() => {
          const isSuperAdmin = activeUser?.role === 'superadmin';
          if (isSuperAdmin) {
            const pendingCount = (db.subscriptionPayments || []).filter(p => p.status === 'PENDING').length;
            const saasTabs = [
              { id: 'stats', label: 'Indicateurs', icon: BarChart3 },
              { id: 'tenants', label: 'Entreprises', icon: Building },
              { id: 'invoices', label: 'Paiements', icon: FileText, badge: pendingCount },
              { id: 'support', label: 'Support', icon: LifeBuoy }
            ];
            return (
              <>
                {saasTabs.map(tab => {
                  const Icon = tab.icon;
                  const isActive = currentTab === 'saasadmin' && saasSubTab === tab.id;
                  return (
                    <button key={tab.id} onClick={() => { setCurrentTab('saasadmin'); setSaasSubTab(tab.id as any); }}
                      className={`flex flex-col items-center justify-center flex-1 h-full py-1 transition-all relative ${isActive ? 'text-red-500 scale-105 font-bold' : 'text-gray-400 hover:text-gray-200'}`}>
                      <div className="relative">
                        <Icon className={`w-5 h-5 transition-transform ${isActive ? 'stroke-[2.5px] drop-shadow-[0_0_8px_rgba(239,68,68,0.3)]' : 'stroke-[1.8px]'}`} />
                        {tab.badge && tab.badge > 0 ? (
                          <span className="absolute -top-1.5 -right-2 bg-red-600 text-white font-extrabold rounded-full text-[8px] h-4 w-4 flex items-center justify-center border border-gray-900 animate-pulse">{tab.badge}</span>
                        ) : null}
                      </div>
                      <span className="text-[10px] mt-1 tracking-tight font-medium font-sans">{tab.label}</span>
                      {isActive && <motion.div layoutId="activeSaasTabIndicator" className="w-1.5 h-1.5 rounded-full bg-red-500 mt-0.5" transition={{ type: "spring", stiffness: 300, damping: 30 }} />}
                    </button>
                  );
                })}
                <button onClick={() => setSidebarOpen(true)} className="flex flex-col items-center justify-center flex-1 h-full py-1 text-gray-400 hover:text-gray-200">
                  <Menu className="w-5 h-5 stroke-[1.8px]" /><span className="text-[10px] mt-1 tracking-tight font-medium font-sans">Plus</span>
                </button>
              </>
            );
          }

          const tabs = [
            { id: 'dashboard', label: 'Accueil', icon: LayoutDashboard },
            { id: 'pos', label: 'Caisse', icon: ShoppingBag },
            { id: 'products', label: 'Stocks', icon: Package },
            { id: 'expenses', label: 'Finances', icon: Coins }
          ];
          const allowedTabs = tabs.filter(tab => sidebarMenuItems.some(item => item.id === tab.id));

          return (
            <>
              {allowedTabs.map(tab => {
                const Icon = tab.icon;
                const isActive = currentTab === tab.id;
                return (
                  <button key={tab.id} onClick={() => setCurrentTab(tab.id as TabType)}
                    className={`flex flex-col items-center justify-center flex-1 h-full py-1 transition-all relative ${isActive ? 'text-blue-500 scale-105 font-bold' : 'text-gray-400 hover:text-gray-200'}`}>
                    <Icon className={`w-5 h-5 transition-transform ${isActive ? 'stroke-[2.5px] drop-shadow-[0_0_8px_rgba(59,130,246,0.3)]' : 'stroke-[1.8px]'}`} />
                    <span className="text-[10px] mt-1 tracking-tight font-medium font-sans">{tab.label}</span>
                    {isActive && <motion.div layoutId="activeTabIndicator" className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-0.5" transition={{ type: "spring", stiffness: 300, damping: 30 }} />}
                  </button>
                );
              })}
              <button onClick={() => setSidebarOpen(true)} className="flex flex-col items-center justify-center flex-1 h-full py-1 text-gray-400 hover:text-gray-200">
                <Menu className="w-5 h-5 stroke-[1.8px]" /><span className="text-[10px] mt-1 tracking-tight font-medium font-sans">Plus</span>
              </button>
            </>
          );
        })()}
      </div>

      {/* TOAST NOTIFICATIONS */}
      <div className="fixed top-4 right-4 z-[999] space-y-2 pointer-events-none">
        <AnimatePresence>
          {notifications.filter(n => !dismissedToasts.has(n.id)).slice(0, 3).map((not, i) => (
            <motion.div key={not.id} initial={{ opacity: 0, x: 50, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 50, scale: 0.95 }}
              transition={{ duration: 0.25, delay: i * 0.05 }}
              className={`pointer-events-auto max-w-sm p-3 rounded-xl border shadow-2xl backdrop-blur-md ${
                not.type === 'error' ? 'bg-red-900/90 border-red-700/50 text-red-200' :
                not.type === 'warning' ? 'bg-amber-900/90 border-amber-700/50 text-amber-200' :
                not.type === 'success' ? 'bg-emerald-900/90 border-emerald-700/50 text-emerald-200' :
                'bg-gray-900/90 border-gray-700/50 text-gray-200'
              }`}>
              <div className="flex items-start gap-2.5">
                <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                  not.type === 'error' ? 'bg-red-500/20 text-red-400' :
                  not.type === 'warning' ? 'bg-amber-500/20 text-amber-400' :
                  not.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' :
                  'bg-blue-500/20 text-blue-400'
                }`}>
                  {not.type === 'error' ? <AlertTriangle className="w-3 h-3" /> :
                   not.type === 'warning' ? <AlertTriangle className="w-3 h-3" /> :
                   not.type === 'success' ? <Check className="w-3 h-3" /> :
                   <Bell className="w-3 h-3" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium leading-normal">{not.text}</p>
                  <p className="text-[9px] opacity-60 mt-0.5 font-mono">{not.time}</p>
                </div>
                <button onClick={() => setDismissedToasts(prev => new Set(prev).add(not.id))} className="opacity-40 hover:opacity-100 transition flex-shrink-0">
                  <X className="w-3 h-3" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* SECURE PASSWORD MODAL */}
      <AnimatePresence>
        {showSecurePasswordModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 15 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-gray-900 border border-gray-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
              <button type="button" onClick={() => setShowSecurePasswordModal(false)} className="absolute top-4 right-4 text-gray-500 hover:text-gray-300">
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center text-amber-500">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Sécurisation du Compte</h3>
                  <p className="text-[10px] text-gray-500 font-mono">NexaStock Cloud Multi-Tenant</p>
                </div>
              </div>
              <p className="text-xs text-gray-400 mb-4 leading-normal font-sans">Puisque vous avez créé votre organisation sans mot de passe, configurez maintenant un code d'accès sécurisé.</p>
              {securePasswordError && (
                <div className="bg-red-500/10 border border-red-500/25 p-2.5 rounded-xl text-red-400 text-xs font-bold font-mono mb-4">{securePasswordError}</div>
              )}
              <form onSubmit={handleSaveSecurePassword} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono font-bold text-gray-400 uppercase">Nouveau Mot de Passe</label>
                  <input type="password" required value={securePassword} onChange={(e) => { setSecurePassword(e.target.value); setSecurePasswordError(''); }}
                    placeholder="Saisissez au moins 4 caractères" className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 transition" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono font-bold text-gray-400 uppercase">Confirmer le Mot de Passe</label>
                  <input type="password" required value={securePasswordConfirm} onChange={(e) => { setSecurePasswordConfirm(e.target.value); setSecurePasswordError(''); }}
                    placeholder="Confirmez votre mot de passe" className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 transition" />
                </div>
                <button type="submit" className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 transition text-gray-950 text-xs font-bold py-2.5 rounded-xl shadow-lg font-mono flex items-center justify-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" /> Enregistrer mon mot de passe
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <DBProvider>
      <AppProvider>
        <AppShell />
      </AppProvider>
    </DBProvider>
  );
}
