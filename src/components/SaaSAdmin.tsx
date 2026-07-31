/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useCallback } from 'react';
import { AnimatePresence } from 'motion/react';
import {
  BarChart3, 
  Users, 
  Building, 
  FileText, 
  Layers,
  Lock,
  Clock,
  LifeBuoy,
  ToggleLeft,
  ShieldAlert,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { Tenant, User, SubscriptionPlan, UserRole, AuditLog, SubscriptionPayment, PricingPlan } from '../types';
import { ConfirmDialog } from './shared/ConfirmDialog';
import { useDB, useApp } from '../context';
import { Modal } from './shared/Modal';
import AdminStats from './admin/AdminStats';
import AdminTenants from './admin/AdminTenants';
import AdminUsers from './admin/AdminUsers';
import AdminInvoices from './admin/AdminInvoices';
import AdminPlans from './admin/AdminPlans';
import AdminModules from './admin/AdminModules';
import AdminSupport from './admin/AdminSupport';
import AdminLogs from './admin/AdminLogs';

function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('nexastock_token');
  return fetch(url, {
    ...options,
    headers: { ...options.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
}

export default function SaaSAdmin() {
  const { db, handleUpdateDb, addNotification } = useDB();
  const { activeUserId, saasSubTab: propActiveSubTab, setSaasSubTab: propSetActiveSubTab } = useApp();
  const [localActiveSubTab, setLocalActiveSubTab] = useState<'stats' | 'tenants' | 'users' | 'invoices' | 'logs' | 'support' | 'plans' | 'modules'>('stats');
  
  const activeSubTab = propActiveSubTab !== undefined ? propActiveSubTab : localActiveSubTab;
  const setActiveSubTab = propSetActiveSubTab !== undefined ? propSetActiveSubTab : setLocalActiveSubTab;

  const [passwordModalTargetId, setPasswordModalTargetId] = useState<string | null>(null);
  const [passwordModalValue, setPasswordModalValue] = useState('');
  const [passwordModalConfirm, setPasswordModalConfirm] = useState('');
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [passwordModalShowPwd, setPasswordModalShowPwd] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', email: '', phone: '', address: '', city: '', country: 'Guinée', currency: 'GNF', plan: 'Free' });
  const [creating, setCreating] = useState(false);
  const [createdResult, setCreatedResult] = useState<{ email: string; password: string } | null>(null);

  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [tenantDetail, setTenantDetail] = useState<any>(null);
  const [tenantStats, setTenantStats] = useState<any>(null);
  const [tenantLogs, setTenantLogs] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [expiryForm, setExpiryForm] = useState({ tenantId: '', endDate: '' });
  const [trialForm, setTrialForm] = useState({ tenantId: '', days: 15 });
  
  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPlanFilter, setSelectedPlanFilter] = useState('Tous');

  // Support desk simulator state
  const [supportTickets, setSupportTickets] = useState([
    { id: 't-1', sender: 'Sophie Laurent (Pharmacie)', subject: 'Comment imprimer un ticket POS ?', status: 'Ouvert', date: '2026-07-13', text: 'Bonjour, je cherche un bouton pour imprimer le ticket de caisse en format PDF ou ticket thermique. Merci !' },
    { id: 't-2', sender: 'Amine Diallo (Al-Baraka)', subject: 'Limite du plan Gratuit atteinte', status: 'Fermé', date: '2026-07-12', text: 'Je ne peux plus ajouter de produits. Pouvez-vous m\'expliquer comment passer au plan supérieur ?' }
  ]);
  const [replyText, setReplyText] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  // Admin response text for payment validations
  const [adminComment, setAdminComment] = useState('');

  const [deleteTenantId, setDeleteTenantId] = useState<string | null>(null);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);

  // Resolved dynamic pricing plans stored in database, with safe defaults
  const pricingPlans = useMemo(() => {
    if (db.pricingPlans && db.pricingPlans.length > 0) return db.pricingPlans;
    return [
      { id: 'plan-free', name: 'Free', description: 'Idéal pour tester l\'application.', price: 0, currency: db.saasCurrency || 'EUR', durationDays: 14, features: ["50 produits max", "1 utilisateur"], limits: { maxProducts: 50, maxSales: 100, maxCustomers: 20, maxUsers: 1 }, color: 'gray', displayOrder: 1, active: true },
      { id: 'plan-standard', name: 'Standard', description: 'Pour les PME établies.', price: 29, currency: db.saasCurrency || 'EUR', durationDays: 30, features: ["Ventes illimitées", "5 utilisateurs"], limits: { maxProducts: 9999, maxSales: 9999, maxCustomers: 9999, maxUsers: 5 }, color: 'blue', displayOrder: 2, active: true },
      { id: 'plan-premium', name: 'Premium', description: 'Le summum de l\'intelligence.', price: 79, currency: db.saasCurrency || 'EUR', durationDays: 30, features: ["Gemini AI réappro", "99 utilisateurs"], limits: { maxProducts: 99999, maxSales: 99999, maxCustomers: 99999, maxUsers: 99 }, color: 'purple', displayOrder: 3, active: true }
    ];
  }, [db.pricingPlans, db.saasCurrency]);

  const globalSaaSSettings = useMemo(() => {
    return db.globalSaaSSettings || {
      trialDays: 14,
      gracePeriodDays: 5,
      revertToPlanOnExpiry: 'Free',
      orangeMoneyNumber: '+224 620 00 00 00',
      orangeMoneyName: 'NexaStock SAS',
      mobileMoneyNumber: '+224 660 11 22 33',
      mobileMoneyName: 'Hassim Barry',
      bankDetails: 'RIB: FR76 1234 5678 9012 3456 7890 123\nBanque: Société Générale Paris\nTitulaire: NexaStock SARL',
      paymentInstructions: 'Veuillez effectuer le virement ou versement, puis déclarer la transaction ci-dessous.',
      automaticActivation: false
    };
  }, [db.globalSaaSSettings]);

  const subscriptionPayments = useMemo(() => {
    return db.subscriptionPayments || [];
  }, [db.subscriptionPayments]);

  // Local states for robust SaaS settings and plans editing (prevents keyboard-stroke race conditions)
  const [localGlobalSaaSSettings, setLocalGlobalSaaSSettings] = useState<any>(null);
  const [localPricingPlans, setLocalPricingPlans] = useState<any[]>([]);
  const [localSaasCurrency, setLocalSaasCurrency] = useState<string>('EUR');
  const [isSaaSSettingsSaved, setIsSaaSSettingsSaved] = useState(false);
  const [isSaaSSettingsSaving, setIsSaaSSettingsSaving] = useState(false);

  // Initialize/sync local states only when not dirty or on subtab enter / mount
  const prevActiveSubTabRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const enteredPlansTab = activeSubTab === 'plans' && prevActiveSubTabRef.current !== 'plans';
    if (localGlobalSaaSSettings === null || enteredPlansTab) {
      setLocalGlobalSaaSSettings(globalSaaSSettings);
      setLocalPricingPlans(JSON.parse(JSON.stringify(pricingPlans)));
      setLocalSaasCurrency(db.saasCurrency || 'EUR');
    }
    prevActiveSubTabRef.current = activeSubTab;
  }, [activeSubTab, pricingPlans, globalSaaSSettings, db.saasCurrency, localGlobalSaaSSettings]);

  // Statistics computations
  const totalTenantsCount = db.tenants.length;
  const totalUsersCount = db.users.length;
  const totalProductsCount = db.products.length;
  const totalGlobalSalesCount = db.sales.length;
  const totalGlobalVolume = useMemo(() => db.sales.reduce((acc, s) => acc + s.total, 0), [db.sales]);

  // SaaS Monthly Recurring Revenue (MRR) based on active tenants
  const mrr = useMemo(() => {
    return db.tenants.reduce((acc, ten) => {
      if (ten.subscriptionStatus === 'EXPIRED' || ten.subscriptionStatus === 'SUSPENDED') return acc;
      const planInfo = pricingPlans.find(p => p.name === ten.plan);
      return acc + (planInfo ? planInfo.price : 0);
    }, 0);
  }, [db.tenants, pricingPlans]);

  const apiCall = useCallback(async (method: string, url: string, body?: any) => {
    try {
      const res = await authFetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Erreur API'); }
      return await res.json();
    } catch (err: any) { addNotification(err.message || 'Erreur', 'error'); return null; }
  }, [addNotification]);

  const refreshTenants = useCallback(async () => {
    const data = await apiCall('GET', '/api/saas/tenants');
    if (data) {
      handleUpdateDb({ ...db, tenants: data });
    }
  }, [apiCall, db, handleUpdateDb]);

  // Handle tenant status change (suspend, reactivate, block, unblock)
  const handleChangeStatus = async (tenantId: string, status: string) => {
    const data = await apiCall('PUT', `/api/saas/tenants/${tenantId}/status`, { status });
    if (data) {
      handleUpdateDb({ ...db, tenants: db.tenants.map(t => t.id === tenantId ? { ...t, ...data } : t) });
      addNotification(`Statut changé: ${status}`);
    }
  };

  // Change tenant subscription plan
  const handleChangeTenantPlan = async (tenantId: string, planName: string) => {
    const data = await apiCall('PUT', `/api/saas/tenants/${tenantId}/plan`, { plan: planName });
    if (data) {
      handleUpdateDb({ ...db, tenants: db.tenants.map(t => t.id === tenantId ? { ...t, ...data } : t) });
      addNotification(`Plan changé pour ${planName}`);
    }
  };

  // Manual Trial Extension
  const handleExtendTrial = async (tenantId: string, days: number = 15) => {
    const data = await apiCall('POST', `/api/saas/tenants/${tenantId}/trial`, { days });
    if (data) {
      handleUpdateDb({ ...db, tenants: db.tenants.map(t => t.id === tenantId ? { ...t, ...data } : t) });
      addNotification(`${days} jours d'essai ajoutés`);
    }
  };

  // Create tenant
  const handleCreateTenant = async () => {
    if (!createForm.name || !createForm.email) { addNotification('Nom et email requis', 'error'); return; }
    setCreating(true);
    const data = await apiCall('POST', '/api/saas/tenants', createForm);
    if (data) {
      setCreatedResult({ email: data.adminEmail, password: data.adminPassword });
      refreshTenants();
    }
    setCreating(false);
  };

  // Load tenant detail
  const loadTenantDetail = async (tenantId: string) => {
    setSelectedTenantId(tenantId);
    setDetailLoading(true);
    const [detail, stats, logs] = await Promise.all([
      apiCall('GET', `/api/saas/tenants/${tenantId}`),
      apiCall('GET', `/api/saas/tenants/${tenantId}/stats`),
      apiCall('GET', `/api/saas/tenants/${tenantId}/logs`),
    ]);
    if (detail) setTenantDetail(detail);
    if (stats) setTenantStats(stats);
    if (logs) setTenantLogs(logs);
    setDetailLoading(false);
  };

  // Delete tenant
  const handleDeleteTenant = async (tenantId: string) => {
    setDeleteTenantId(tenantId);
  };

  const confirmDeleteTenant = async () => {
    if (!deleteTenantId) return;
    const data = await apiCall('DELETE', `/api/saas/tenants/${deleteTenantId}`);
    if (data) {
      handleUpdateDb({ ...db, tenants: db.tenants.filter(t => t.id !== deleteTenantId) });
      if (selectedTenantId === deleteTenantId) { setSelectedTenantId(null); setTenantDetail(null); }
      addNotification(data.message || 'Entreprise supprimée');
    }
    setDeleteTenantId(null);
  };

  // Modify expiry
  const handleModifyExpiry = async () => {
    if (!expiryForm.tenantId || !expiryForm.endDate) return;
    const data = await apiCall('PUT', `/api/saas/tenants/${expiryForm.tenantId}/expiry`, { subscriptionEndDate: new Date(expiryForm.endDate).toISOString() });
    if (data) {
      handleUpdateDb({ ...db, tenants: db.tenants.map(t => t.id === expiryForm.tenantId ? { ...t, ...data } : t) });
      setExpiryForm({ tenantId: '', endDate: '' });
      addNotification('Date d\'expiration modifiée');
    }
  };

  // Process Offline Subscription Payment (Approve or Reject)
  const handleProcessPayment = (paymentId: string, status: 'APPROVED' | 'REJECTED') => {
    const payment = subscriptionPayments.find(p => p.id === paymentId);
    if (!payment) return;

    const planObj = pricingPlans.find(p => p.id === payment.planId) || pricingPlans.find(p => p.name === payment.planName);
    const durationDays = planObj?.durationDays || 30;

    const nextPayments = subscriptionPayments.map(p => {
      if (p.id === paymentId) {
        return {
          ...p,
          status: status,
          adminComment: adminComment || (status === 'APPROVED' ? 'Paiement vérifié et validé.' : 'Dossier rejeté, informations ou référence incorrecte.'),
          updatedAt: new Date().toISOString()
        };
      }
      return p;
    });

    // If APPROVED, activate the plan for the tenant immediately
    const nextTenants = db.tenants.map(t => {
      if (t.id === payment.tenantId) {
        if (status === 'APPROVED') {
          const start = new Date();
          const end = new Date();
          end.setDate(end.getDate() + durationDays);

          return {
            ...t,
            plan: payment.planName as SubscriptionPlan,
            subscriptionPlanId: payment.planId,
            subscriptionStatus: 'ACTIVE' as const,
            subscriptionStartDate: start.toISOString(),
            subscriptionEndDate: end.toISOString()
          };
        } else {
          return {
            ...t,
            subscriptionStatus: 'EXPIRED' as const
          };
        }
      }
      return t;
    });

    const audit: any = {
      id: `aud-adm-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: 'admin-root',
      userName: 'Super-Administrateur',
      action: status === 'APPROVED' ? 'PAIEMENT_VALIDÉ' : 'PAIEMENT_REJETÉ',
      details: `Traitement du paiement ${paymentId} (${payment.amount} ${payment.currency || db.saasCurrency || 'EUR'}) pour ${payment.tenantName}. Statut: ${status}. Commentaire: ${adminComment}`,
      tenantId: payment.tenantId
    };

    const nextDb = {
      ...db,
      subscriptionPayments: nextPayments,
      tenants: nextTenants,
      auditLogs: [audit, ...(db.auditLogs || [])]
    };

    handleUpdateDb(nextDb);
    setAdminComment('');
    addNotification(status === 'APPROVED' ? `Abonnement activé pour ${payment.tenantName} !` : `Paiement rejeté.`);
  };

  const handleOpenPasswordModal = (userId: string) => {
    setPasswordModalTargetId(userId);
    setPasswordModalValue('');
    setPasswordModalConfirm('');
    setPasswordModalVisible(true);
  };

  const handleConfirmPasswordReset = () => {
    if (!passwordModalTargetId) return;
    if (passwordModalValue.length < 4) return;
    if (passwordModalValue !== passwordModalConfirm) return;

    const target = db.users.find(u => u.id === passwordModalTargetId);
    if (!target) return;

    const nextUsers = db.users.map(u => {
      if (u.id === passwordModalTargetId) {
        return {
          ...u,
          password: passwordModalValue,
          firstLoginReset: true
        };
      }
      return u;
    });

    const audit: any = {
      id: `aud-adm-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: 'admin-root',
      userName: 'Super-Administrateur',
      action: 'USER_PASSWORD_RESET_FORCE',
      details: `Le mot de passe de ${target.name} a été modifié de force par le super-admin.`,
      tenantId: target.tenantId
    };

    const nextDb = {
      ...db,
      users: nextUsers,
      auditLogs: [audit, ...(db.auditLogs || [])]
    };

    handleUpdateDb(nextDb);
    setPasswordModalVisible(false);
    setPasswordModalTargetId(null);
    addNotification(`Mot de passe réinitialisé pour ${target.name}`);
  };

  // Save Pricing plan details dynamically (Local state only)
  const handleSavePlanSettings = (idx: number, field: string, value: any) => {
    setLocalPricingPlans(prev => {
      const nextPlans = [...prev];
      if (field.startsWith('limits.')) {
        const limitField = field.split('.')[1];
        nextPlans[idx] = {
          ...nextPlans[idx],
          limits: {
            ...nextPlans[idx].limits,
            [limitField]: Number(value)
          }
        };
      } else {
        nextPlans[idx] = {
          ...nextPlans[idx],
          [field]: field === 'price' || field === 'durationDays' || field === 'displayOrder' ? Number(value) : value
        };
      }
      return nextPlans;
    });
  };

  // Save Global Payments Settings (Local state only)
  const handleSaveGlobalPaymentsSettings = (field: string, value: any) => {
    setLocalGlobalSaaSSettings(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        [field]: value
      };
    });
  };

  // Save all settings globally in one go to prevent race conditions
  const handleSaveAllSaaSSettings = () => {
    setIsSaaSSettingsSaving(true);
    setTimeout(() => {
      // Propagate the global currency to all existing tenant organizations
      const updatedTenants = db.tenants.map(t => ({
        ...t,
        currency: localSaasCurrency
      }));

      handleUpdateDb({
        ...db,
        saasCurrency: localSaasCurrency,
        pricingPlans: localPricingPlans,
        globalSaaSSettings: localGlobalSaaSSettings,
        tenants: updatedTenants
      });
      setIsSaaSSettingsSaving(false);
      setIsSaaSSettingsSaved(true);
      addNotification(`Configuration globale du SaaS enregistrée (${localSaasCurrency}) !`);
      setTimeout(() => setIsSaaSSettingsSaved(false), 4000);
    }, 600);
  };

  // Delete user from system
  const handleDeleteUser = (userId: string) => {
    setDeleteUserId(userId);
  };

  const confirmDeleteUser = () => {
    if (!deleteUserId) return;
    const nextUsers = db.users.filter(u => u.id !== deleteUserId);
    handleUpdateDb({ ...db, users: nextUsers });
    addNotification(`Utilisateur système supprimé.`);
    setDeleteUserId(null);
  };

  // Filtered Lists
  const filteredTenants = useMemo(() => {
    return db.tenants.filter(t => {
      const matchSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.id.toLowerCase().includes(searchTerm.toLowerCase());
      const matchPlan = selectedPlanFilter === 'Tous' || t.plan === selectedPlanFilter;
      return matchSearch && matchPlan;
    });
  }, [db.tenants, searchTerm, selectedPlanFilter]);

  const filteredUsers = useMemo(() => {
    return db.users.filter(u => {
      const tenant = db.tenants.find(t => t.id === u.tenantId);
      const tenantName = tenant ? tenant.name : '';
      return u.name.toLowerCase().includes(searchTerm.toLowerCase()) || u.email.toLowerCase().includes(searchTerm.toLowerCase()) || tenantName.toLowerCase().includes(searchTerm.toLowerCase());
    });
  }, [db.users, searchTerm]);

  const pendingPayments = useMemo(() => {
    return subscriptionPayments.filter(p => p.status === 'PENDING');
  }, [subscriptionPayments]);

  const processedPayments = useMemo(() => {
    return subscriptionPayments.filter(p => p.status !== 'PENDING');
  }, [subscriptionPayments]);

  const handleSendTicketReply = (ticketId: string) => {
    if (!replyText) return;
    setSupportTickets(prev => prev.map(t => {
      if (t.id === ticketId) {
        return { ...t, status: 'Fermé', text: t.text + `\n\n--- RÉPONSE SUPPORT ---\n${replyText}` };
      }
      return t;
    }));
    setReplyText('');
    setSelectedTicketId(null);
    addNotification('Réponse au ticket envoyée ! Statut résolu.');
  };

  return (
    <div className="space-y-6 animate-fade-in text-white">
      
      {/* 1. Root Access Header */}
      <div className="bg-gradient-to-r from-red-950/20 via-slate-900 to-red-950/20 border border-red-500/10 p-5 rounded-2xl flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-red-400 animate-pulse" />
            <h2 className="text-lg font-bold font-display text-white">Console Super-Administrateur SaaS (Global)</h2>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Contrôlez l'ensemble des locataires, auditez les reçus de virements/mobiles, gérez les habilitations des forfaits d'abonnements et paramétrez les modalités de paiement hors ligne.
          </p>
        </div>
        
        <div className="flex items-center gap-2 text-xs font-mono font-bold bg-red-500/10 border border-red-500/15 text-red-400 px-3 py-1.5 rounded-xl">
          <ShieldAlert className="w-4 h-4" />
          <span>ACCÈS ROOT HABILITÉ</span>
        </div>
      </div>

      {/* 2. Secondary Tab Navigation */}
      <div className="hidden md:flex flex-wrap gap-1 bg-gray-900/80 p-1.5 rounded-xl border border-gray-850 backdrop-blur-md tabs-scrollable">
        <button
          onClick={() => setActiveSubTab('stats')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg transition ${
            activeSubTab === 'stats' ? 'bg-red-500 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-850'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" /> Statuts & MRR
        </button>
        <button
          onClick={() => setActiveSubTab('tenants')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg transition ${
            activeSubTab === 'tenants' ? 'bg-red-500 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-850'
          }`}
        >
          <Building className="w-3.5 h-3.5" /> Entreprises Clientes ({totalTenantsCount})
        </button>
        <button
          onClick={() => setActiveSubTab('users')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg transition ${
            activeSubTab === 'users' ? 'bg-red-500 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-850'
          }`}
        >
          <Users className="w-3.5 h-3.5" /> Utilisateurs Système ({totalUsersCount})
        </button>
        <button
          onClick={() => setActiveSubTab('invoices')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg transition ${
            activeSubTab === 'invoices' ? 'bg-red-500 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-850'
          }`}
        >
          <FileText className="w-3.5 h-3.5" /> Validation de Paiements {pendingPayments.length > 0 && (
            <span className="bg-blue-500 text-white font-bold px-1.5 py-0.5 rounded-md text-[9px] animate-pulse">{pendingPayments.length}</span>
          )}
        </button>
        <button
          onClick={() => setActiveSubTab('plans')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg transition ${
            activeSubTab === 'plans' ? 'bg-red-500 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-850'
          }`}
        >
          <Layers className="w-3.5 h-3.5" /> Paramètres & Tarifs
        </button>
        <button
          onClick={() => setActiveSubTab('modules')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg transition ${
            activeSubTab === 'modules' ? 'bg-red-500 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-850'
          }`}
        >
          <ToggleLeft className="w-3.5 h-3.5" /> Modules
        </button>
        <button
          onClick={() => setActiveSubTab('support')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg transition ${
            activeSubTab === 'support' ? 'bg-red-500 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-850'
          }`}
        >
          <LifeBuoy className="w-3.5 h-3.5" /> Support Desk
        </button>
        <button
          onClick={() => setActiveSubTab('logs')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg transition ${
            activeSubTab === 'logs' ? 'bg-red-500 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-850'
          }`}
        >
          <Clock className="w-3.5 h-3.5" /> Logs Système Global
        </button>
      </div>

      {/* 3. Sub-Tab Wrapper */}
      <div className="bg-gray-900 border border-gray-850 rounded-2xl p-6 shadow-xl min-h-[400px]">
        {/* Mobile quick back button to main Hub */}
        {activeSubTab !== 'stats' && (
          <button
            onClick={() => setActiveSubTab('stats')}
            className="md:hidden flex items-center gap-2 mb-5 text-xs font-bold bg-gray-950 hover:bg-gray-850 border border-gray-800 text-gray-400 px-3 py-2 rounded-xl transition active:scale-95"
          >
            <span className="text-red-500 font-bold font-sans">←</span> Retour au Tableau de bord
          </button>
        )}

        <AnimatePresence mode="wait">
          
          {/* TAB 1: GENERAL STATS & METRICS */}
          {activeSubTab === 'stats' && (
            <AdminStats
              db={db}
              mrr={mrr}
              totalTenantsCount={totalTenantsCount}
              totalUsersCount={totalUsersCount}
              totalProductsCount={totalProductsCount}
              totalGlobalSalesCount={totalGlobalSalesCount}
              totalGlobalVolume={totalGlobalVolume}
              pendingPayments={pendingPayments}
              supportTickets={supportTickets}
              pricingPlans={pricingPlans}
              setActiveSubTab={setActiveSubTab}
            />
          )}

          {/* TAB 2: MANAGING TENANTS / BUSINESS CUSTOMERS */}
          {activeSubTab === 'tenants' && (
            <AdminTenants
              filteredTenants={filteredTenants}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              selectedPlanFilter={selectedPlanFilter}
              setSelectedPlanFilter={setSelectedPlanFilter}
              showCreateModal={showCreateModal}
              setShowCreateModal={setShowCreateModal}
              createForm={createForm}
              setCreateForm={setCreateForm}
              creating={creating}
              createdResult={createdResult}
              setCreatedResult={setCreatedResult}
              expiryForm={expiryForm}
              setExpiryForm={setExpiryForm}
              selectedTenantId={selectedTenantId}
              setSelectedTenantId={setSelectedTenantId}
              tenantDetail={tenantDetail}
              setTenantDetail={setTenantDetail}
              tenantStats={tenantStats}
              tenantLogs={tenantLogs}
              detailLoading={detailLoading}
              refreshTenants={refreshTenants}
              handleChangeTenantPlan={handleChangeTenantPlan}
              handleCreateTenant={handleCreateTenant}
              handleExtendTrial={handleExtendTrial}
              handleModifyExpiry={handleModifyExpiry}
              handleDeleteTenant={handleDeleteTenant}
              handleChangeStatus={handleChangeStatus}
              loadTenantDetail={loadTenantDetail}
            />
          )}

          {/* TAB 3: MANAGING ALL USERS IN SYSTEM */}
          {activeSubTab === 'users' && (
            <AdminUsers
              db={db}
              activeUserId={activeUserId}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              filteredUsers={filteredUsers}
              handleOpenPasswordModal={handleOpenPasswordModal}
              handleDeleteUser={handleDeleteUser}
            />
          )}

          {/* TAB 4: MANUAL OFFLINE PAYMENT REQUESTS AUDITING */}
          {activeSubTab === 'invoices' && (
            <AdminInvoices
              pendingPayments={pendingPayments}
              processedPayments={processedPayments}
              adminComment={adminComment}
              setAdminComment={setAdminComment}
              handleProcessPayment={handleProcessPayment}
              db={db}
            />
          )}

          {/* TAB 5: EDITING TECHNICAL PRICING & PAYMENT INFRASTRUCTURES */}
          {activeSubTab === 'plans' && (
            <AdminPlans
              localGlobalSaaSSettings={localGlobalSaaSSettings}
              globalSaaSSettings={globalSaaSSettings}
              localPricingPlans={localPricingPlans}
              pricingPlans={pricingPlans}
              localSaasCurrency={localSaasCurrency}
              tenants={db.tenants}
              setLocalSaasCurrency={setLocalSaasCurrency}
              setLocalPricingPlans={setLocalPricingPlans}
              isSaaSSettingsSaved={isSaaSSettingsSaved}
              isSaaSSettingsSaving={isSaaSSettingsSaving}
              handleSaveAllSaaSSettings={handleSaveAllSaaSSettings}
              handleSavePlanSettings={handleSavePlanSettings}
              handleSaveGlobalPaymentsSettings={handleSaveGlobalPaymentsSettings}
            />
          )}

          {/* TAB 6: MODULES */}
          {activeSubTab === 'modules' && (
            <AdminModules />
          )}

          {/* TAB 7: SUPPORT CLIENT TICKETS */}
          {activeSubTab === 'support' && (
            <AdminSupport
              supportTickets={supportTickets}
              setSelectedTicketId={setSelectedTicketId}
              selectedTicketId={selectedTicketId}
              replyText={replyText}
              setReplyText={setReplyText}
              handleSendTicketReply={handleSendTicketReply}
            />
          )}

          {/* TAB 8: GLOBAL AUDIT SYSTEM LOGS */}
          {activeSubTab === 'logs' && (
            <AdminLogs db={db} />
          )}

        </AnimatePresence>
      </div>

      <Modal
        isOpen={passwordModalVisible}
        onClose={() => { setPasswordModalVisible(false); setPasswordModalTargetId(null); }}
        title="Réinitialiser le mot de passe"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            Saisir un nouveau mot de passe provisoire pour <strong className="text-white">{db.users.find(u => u.id === passwordModalTargetId)?.name}</strong>
          </p>
          <div>
            <label className="block text-xs text-gray-500 font-semibold mb-1.5">Nouveau mot de passe</label>
            <div className="relative">
              <input
                type={passwordModalShowPwd ? 'text' : 'password'}
                value={passwordModalValue}
                onChange={e => setPasswordModalValue(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-brand-blue/60 transition pr-10"
                placeholder="Minimum 4 caractères"
              />
              <button
                type="button"
                onClick={() => setPasswordModalShowPwd(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                {passwordModalShowPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 font-semibold mb-1.5">Confirmer le mot de passe</label>
            <input
              type="password"
              value={passwordModalConfirm}
              onChange={e => setPasswordModalConfirm(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-brand-blue/60 transition"
              placeholder="Retapez le mot de passe"
            />
            {passwordModalConfirm && passwordModalValue !== passwordModalConfirm && (
              <p className="text-xs text-red-400 mt-1">Les mots de passe ne correspondent pas.</p>
            )}
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => { setPasswordModalVisible(false); setPasswordModalTargetId(null); }}
              className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-750 text-gray-300 text-xs font-semibold rounded-xl transition"
            >
              Annuler
            </button>
            <button
              onClick={handleConfirmPasswordReset}
              disabled={passwordModalValue.length < 4 || passwordModalValue !== passwordModalConfirm}
              className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-xs font-bold rounded-xl transition"
            >
              Réinitialiser
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={deleteTenantId !== null}
        title="Supprimer l'entreprise"
        message="Supprimer définitivement cette entreprise ? Cette action est irréversible."
        confirmLabel="Supprimer"
        onConfirm={confirmDeleteTenant}
        onCancel={() => setDeleteTenantId(null)}
      />

      <ConfirmDialog
        isOpen={deleteUserId !== null}
        title="Supprimer l'utilisateur"
        message="Êtes-vous sûr de vouloir supprimer cet utilisateur définitivement ?"
        confirmLabel="Supprimer"
        onConfirm={confirmDeleteUser}
        onCancel={() => setDeleteUserId(null)}
      />
    </div>
  );
}
