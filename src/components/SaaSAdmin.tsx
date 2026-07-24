/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BarChart3, 
  Users, 
  Building, 
  CreditCard, 
  FileText, 
  Settings, 
  AlertTriangle, 
  ShieldAlert, 
  Plus, 
  Trash2,
  Check,
  Power,

  LifeBuoy, 
  Clock, 
  DollarSign, 
  Layers,
  Sparkles,
  Lock,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Phone,
  HelpCircle,
  ArrowRight,
  RefreshCw,
  Eye,
  EyeOff,
  Key,
  Unlock,
  ToggleLeft,
  X,
  Calendar,
  Activity,
  Archive
} from 'lucide-react';
import type { Tenant, User, SubscriptionPlan, UserRole, AuditLog, SubscriptionPayment, PricingPlan } from '../types';
import { ConfirmDialog } from './shared/ConfirmDialog';
import { useDB, useApp } from '../context';
import { Modal } from './shared/Modal';
import SuperAdminModuleManager from './SuperAdminModuleManager';

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
          [field]: field === 'price' ? Number(value) : value
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
      <div className="hidden md:flex flex-wrap gap-1 bg-gray-900/80 p-1.5 rounded-xl border border-gray-850 backdrop-blur-md">
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
            <motion.div
              key="stats"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="space-y-6"
            >
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 font-mono">Performance Financière SaaS</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gray-950 border border-gray-850 p-4 rounded-xl space-y-1.5 relative overflow-hidden">
                  <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/15 px-2 py-0.5 rounded-full absolute top-4 right-4">MRR Estimé</span>
                  <p className="text-xs text-gray-400 font-medium">Revenu Récurrent Mensuel</p>
                  <p className="text-2xl font-black font-mono text-white">{mrr} {db.saasCurrency || 'EUR'}</p>
                  <p className="text-[10px] text-emerald-400 flex items-center gap-0.5 font-mono">▲ +15.4% ce mois-ci</p>
                </div>

                <div className="bg-gray-950 border border-gray-855 p-4 rounded-xl space-y-1.5">
                  <p className="text-xs text-gray-400 font-medium">Boutiques Clientes</p>
                  <p className="text-2xl font-black font-mono text-white">{totalTenantsCount}</p>
                  <p className="text-[10px] text-gray-500 font-mono">
                    {db.tenants.filter(t => t.plan === 'Premium').length} Premium, {db.tenants.filter(t => t.plan === 'Standard').length} Standard
                  </p>
                </div>

                <div className="bg-gray-950 border border-gray-855 p-4 rounded-xl space-y-1.5">
                  <p className="text-xs text-gray-400 font-medium">Ventes Enregistrées (GMV)</p>
                  <p className="text-2xl font-black font-mono text-white">{totalGlobalVolume.toLocaleString('fr-FR')} {db.saasCurrency || 'EUR'}</p>
                  <p className="text-[10px] text-gray-500 font-mono">Sur {totalGlobalSalesCount} transactions de caisse</p>
                </div>

                <div className="bg-gray-950 border border-gray-855 p-4 rounded-xl space-y-1.5">
                  <p className="text-xs text-gray-400 font-medium">Fiches Articles Globales</p>
                  <p className="text-2xl font-black font-mono text-white">{totalProductsCount}</p>
                  <p className="text-[10px] text-gray-500 font-mono">Moyenne de {Math.round(totalProductsCount / (totalTenantsCount || 1))} par client</p>
                </div>
              </div>

              {/* MOBILE HUB GRID (Visible only on mobile) */}
              <div className="md:hidden space-y-3 pt-2">
                <h4 className="text-xs font-bold text-gray-400 uppercase font-mono tracking-wider">Outils d'Administration SaaS</h4>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setActiveSubTab('tenants')}
                    className="flex flex-col items-start p-4 bg-gray-950 border border-gray-850 hover:border-red-500/50 rounded-2xl text-left space-y-2 transition-all active:scale-95"
                  >
                    <div className="p-2 bg-blue-500/10 border border-blue-500/15 rounded-xl text-blue-400">
                      <Building className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">Entreprises</p>
                      <p className="text-[10px] text-gray-400 font-mono font-medium">{totalTenantsCount} abonnés</p>
                    </div>
                  </button>

                  <button
                    onClick={() => setActiveSubTab('invoices')}
                    className="flex flex-col items-start p-4 bg-gray-950 border border-gray-850 hover:border-red-500/50 rounded-2xl text-left space-y-2 transition-all active:scale-95"
                  >
                    <div className="p-2 bg-amber-500/10 border border-amber-500/15 rounded-xl text-amber-400 relative">
                      <FileText className="w-5 h-5" />
                      {pendingPayments.length > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-600 text-white font-extrabold rounded-full text-[8px] h-4 w-4 flex items-center justify-center border border-gray-950 animate-pulse">
                          {pendingPayments.length}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">Paiements</p>
                      <p className="text-[10px] text-gray-400 font-mono font-medium">{pendingPayments.length} en attente</p>
                    </div>
                  </button>

                  <button
                    onClick={() => setActiveSubTab('users')}
                    className="flex flex-col items-start p-4 bg-gray-950 border border-gray-850 hover:border-red-500/50 rounded-2xl text-left space-y-2 transition-all active:scale-95"
                  >
                    <div className="p-2 bg-emerald-500/10 border border-emerald-500/15 rounded-xl text-emerald-400">
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">Équipes</p>
                      <p className="text-[10px] text-gray-400 font-mono font-medium">{totalUsersCount} comptes</p>
                    </div>
                  </button>

                  <button
                    onClick={() => setActiveSubTab('support')}
                    className="flex flex-col items-start p-4 bg-gray-950 border border-gray-850 hover:border-red-500/50 rounded-2xl text-left space-y-2 transition-all active:scale-95"
                  >
                    <div className="p-2 bg-purple-500/10 border border-purple-500/15 rounded-xl text-purple-400 relative">
                      <LifeBuoy className="w-5 h-5" />
                      {supportTickets.filter(t => t.status === 'Ouvert').length > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-600 text-white font-extrabold rounded-full text-[8px] h-4 w-4 flex items-center justify-center border border-gray-950">
                          {supportTickets.filter(t => t.status === 'Ouvert').length}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">Tickets Support</p>
                      <p className="text-[10px] text-gray-400 font-mono font-medium">{supportTickets.filter(t => t.status === 'Ouvert').length} ouverts</p>
                    </div>
                  </button>

                  <button
                    onClick={() => setActiveSubTab('plans')}
                    className="flex flex-col items-start p-4 bg-gray-950 border border-gray-855 hover:border-red-500/50 rounded-2xl text-left space-y-2 transition-all active:scale-95"
                  >
                    <div className="p-2 bg-pink-500/10 border border-pink-500/15 rounded-xl text-pink-400">
                      <Layers className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">Tarifs & Offres</p>
                      <p className="text-[10px] text-gray-400 font-mono font-medium">{pricingPlans.length} forfaits</p>
                    </div>
                  </button>

                  <button
                    onClick={() => setActiveSubTab('logs')}
                    className="flex flex-col items-start p-4 bg-gray-950 border border-gray-855 hover:border-red-500/50 rounded-2xl text-left space-y-2 transition-all active:scale-95"
                  >
                    <div className="p-2 bg-teal-500/10 border border-teal-500/15 rounded-xl text-teal-400">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">Logs & Traçabilité</p>
                      <p className="text-[10px] text-gray-400 font-mono font-medium">Suivi système</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Infrastructure and system telemetry */}
              <div className="bg-gray-950 border border-gray-855 rounded-xl p-4.5 space-y-3">
                <h4 className="text-xs font-bold text-gray-200 uppercase font-mono tracking-wider">État des serveurs d'isolation (Multi-tenant)</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="space-y-1">
                    <p className="text-gray-400 font-semibold">Taux de disponibilité API</p>
                    <p className="font-mono text-emerald-400 font-bold">99.998% (Excellent)</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-gray-400 font-semibold">Mécanisme d'isolation DB</p>
                    <p className="font-mono text-blue-400 font-bold">Ségrégation logique stricte</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-gray-400 font-semibold">Sauvegardes automatiques</p>
                    <p className="font-mono text-cyan-400 font-bold">Actives (toutes les 24h)</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 2: MANAGING TENANTS / BUSINESS CUSTOMERS */}
          {activeSubTab === 'tenants' && (
            <motion.div
              key="tenants"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-2">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 font-mono">Entreprises Clientes du SaaS</h3>
                
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:flex-initial">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type="text"
                      placeholder="Rechercher une entreprise..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="bg-gray-950 border border-gray-800 rounded-xl pl-9 pr-4 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-red-500 w-full"
                    />
                  </div>
                  
                  <select
                    value={selectedPlanFilter}
                    onChange={(e) => setSelectedPlanFilter(e.target.value)}
                    className="bg-gray-950 border border-gray-800 rounded-xl px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-red-500"
                  >
                    <option value="Tous">Tous les Forfaits</option>
                    <option value="Free">Gratuit</option>
                    <option value="Standard">Standard</option>
                    <option value="Premium">Premium</option>
                    <option value="Enterprise">Enterprise</option>
                  </select>

                  <button onClick={() => { setShowCreateModal(true); setCreatedResult(null); setCreateForm({ name: '', email: '', phone: '', address: '', city: '', country: 'Guinée', currency: 'GNF', plan: 'Free' }); }}
                    className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Créer
                  </button>
                  <button onClick={refreshTenants} className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold px-2.5 py-1.5 rounded-lg"><RefreshCw className="w-3.5 h-3.5" /></button>
                </div>
              </div>

              <div className="overflow-x-auto border border-gray-800 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-950 text-gray-400 font-mono text-[9px] uppercase border-b border-gray-800">
                    <tr>
                      <th className="p-3">Entreprise</th>
                      <th className="p-3">Forfait</th>
                      <th className="p-3">Statut</th>
                      <th className="p-3">Expire le</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-850">
                    {filteredTenants.map(ten => {
                      const isSuspended = ten.subscriptionStatus === 'SUSPENDED' || ten.subscriptionStatus === 'EXPIRED';
                      const isBlocked = ten.subscriptionStatus === 'BLOCKED';

                      return (
                        <tr key={ten.id} className={`hover:bg-gray-950/20 transition ${isSuspended ? 'opacity-85 bg-red-950/5' : ''} ${isBlocked ? 'opacity-60 bg-gray-950/50' : ''}`}>
                          <td className="p-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-600 to-rose-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                                {ten.name?.[0] || '?'}
                              </div>
                              <div>
                                <p className="font-bold text-gray-200">{ten.name}</p>
                                <p className="text-[10px] text-gray-500 font-mono">{ten.email} | {ten.phone || '-'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-3">
                            <select
                              value={ten.plan}
                              onChange={(e) => handleChangeTenantPlan(ten.id, e.target.value)}
                              className="bg-gray-950 border border-gray-800 text-[11px] rounded-lg px-2.5 py-1 text-gray-200 font-semibold"
                            >
                              <option value="Free">Free</option>
                              <option value="Standard">Standard</option>
                              <option value="Premium">Premium</option>
                              <option value="Enterprise">Enterprise</option>
                            </select>
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 text-[9px] font-bold font-mono rounded-full border uppercase ${
                              ten.subscriptionStatus === 'ACTIVE'
                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                : ten.subscriptionStatus === 'TRIAL'
                                ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                                : ten.subscriptionStatus === 'PENDING'
                                ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                                : ten.subscriptionStatus === 'BLOCKED'
                                ? 'bg-gray-500/10 border-gray-500/20 text-gray-400'
                                : 'bg-red-500/10 border-red-500/20 text-red-400'
                            }`}>
                              {ten.subscriptionStatus || 'TRIAL'}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-[10px] text-gray-400">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-gray-600" />
                              {ten.subscriptionEndDate ? (
                                <span>{new Date(ten.subscriptionEndDate).toLocaleDateString('fr-FR')}</span>
                              ) : ten.trialEndDate ? (
                                <span>Essai: {new Date(ten.trialEndDate).toLocaleDateString('fr-FR')}</span>
                              ) : (
                                <span className="text-gray-500">N/A</span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1 flex-wrap">
                              <button onClick={() => loadTenantDetail(ten.id)} className="p-1.5 hover:bg-gray-800 rounded text-gray-500 hover:text-white" title="Détails"><Eye className="w-3.5 h-3.5" /></button>

                              {ten.subscriptionStatus === 'SUSPENDED' ? (
                                <button onClick={() => handleChangeStatus(ten.id, 'ACTIVE')} className="p-1.5 hover:bg-emerald-600/20 rounded text-emerald-400" title="Réactiver"><Unlock className="w-3.5 h-3.5" /></button>
                              ) : ten.subscriptionStatus === 'BLOCKED' ? (
                                <button onClick={() => handleChangeStatus(ten.id, 'ACTIVE')} className="p-1.5 hover:bg-emerald-600/20 rounded text-emerald-400" title="Débloquer"><Power className="w-3.5 h-3.5" /></button>
                              ) : (
                                <>
                                  <button onClick={() => handleChangeStatus(ten.id, 'SUSPENDED')} className="p-1.5 hover:bg-amber-600/20 rounded text-amber-400" title="Suspendre"><Power className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => handleChangeStatus(ten.id, 'BLOCKED')} className="p-1.5 hover:bg-red-600/20 rounded text-red-400" title="Bloquer"><Lock className="w-3.5 h-3.5" /></button>
                                </>
                              )}

                              <button onClick={() => handleExtendTrial(ten.id, 15)} className="p-1.5 hover:bg-blue-600/20 rounded text-blue-400" title="+15 jours d'essai"><Clock className="w-3.5 h-3.5" /></button>

                              <button onClick={() => { setExpiryForm({ tenantId: ten.id, endDate: ten.subscriptionEndDate?.split('T')[0] || '' }); }} className="p-1.5 hover:bg-violet-600/20 rounded text-violet-400" title="Modifier date expiration"><Calendar className="w-3.5 h-3.5" /></button>

                              <button onClick={() => handleDeleteTenant(ten.id)} className="p-1.5 hover:bg-red-600/20 rounded text-red-400" title="Supprimer"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Create Tenant Modal */}
              <AnimatePresence>
                {showCreateModal && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
                    <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-gray-900 border border-gray-800 rounded-2xl max-w-lg w-full p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2"><Building className="w-4 h-4 text-red-400" /> Nouvelle entreprise</h3>
                        <button onClick={() => setShowCreateModal(false)} className="p-1 hover:bg-gray-800 rounded"><X className="w-4 h-4 text-gray-500" /></button>
                      </div>

                      {createdResult ? (
                        <div className="space-y-4">
                          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
                            <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                            <p className="text-sm font-bold text-emerald-400">Entreprise créée avec succès !</p>
                          </div>
                          <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 space-y-2">
                            <p className="text-xs text-gray-400">Email admin: <span className="font-mono text-white font-bold">{createdResult.email}</span></p>
                            <p className="text-xs text-gray-400">Mot de passe: <span className="font-mono text-amber-400 font-bold">{createdResult.password}</span></p>
                            <p className="text-[10px] text-gray-500 mt-2">⚠️ Copiez ces informations. Le mot de passe ne sera plus affiché.</p>
                          </div>
                          <button onClick={() => { setShowCreateModal(false); setCreatedResult(null); }} className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold py-2 rounded-lg">Fermer</button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                              <label className="text-[10px] font-mono text-gray-500 block mb-1">Nom de l'entreprise *</label>
                              <input value={createForm.name} onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Pharmacie Centrale" className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
                            </div>
                            <div className="col-span-2">
                              <label className="text-[10px] font-mono text-gray-500 block mb-1">Email admin *</label>
                              <input value={createForm.email} onChange={e => setCreateForm(p => ({ ...p, email: e.target.value }))} placeholder="admin@entreprise.com" className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
                            </div>
                            <div>
                              <label className="text-[10px] font-mono text-gray-500 block mb-1">Téléphone</label>
                              <input value={createForm.phone} onChange={e => setCreateForm(p => ({ ...p, phone: e.target.value }))} placeholder="+224 ..." className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
                            </div>
                            <div>
                              <label className="text-[10px] font-mono text-gray-500 block mb-1">Devise</label>
                              <select value={createForm.currency} onChange={e => setCreateForm(p => ({ ...p, currency: e.target.value }))} className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white">
                                <option value="GNF">GNF</option><option value="EUR">EUR</option><option value="USD">USD</option><option value="XOF">XOF</option>
                              </select>
                            </div>
                            <div className="col-span-2">
                              <label className="text-[10px] font-mono text-gray-500 block mb-1">Adresse</label>
                              <input value={createForm.address} onChange={e => setCreateForm(p => ({ ...p, address: e.target.value }))} placeholder="Adresse" className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
                            </div>
                            <div>
                              <label className="text-[10px] font-mono text-gray-500 block mb-1">Ville</label>
                              <input value={createForm.city} onChange={e => setCreateForm(p => ({ ...p, city: e.target.value }))} placeholder="Conakry" className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
                            </div>
                            <div>
                              <label className="text-[10px] font-mono text-gray-500 block mb-1">Plan</label>
                              <select value={createForm.plan} onChange={e => setCreateForm(p => ({ ...p, plan: e.target.value }))} className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white">
                                <option value="Free">Free</option><option value="Standard">Standard</option><option value="Premium">Premium</option>
                              </select>
                            </div>
                          </div>
                          <div className="flex gap-2 justify-end pt-2">
                            <button onClick={() => setShowCreateModal(false)} className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold px-4 py-2 rounded-lg">Annuler</button>
                            <button onClick={handleCreateTenant} disabled={creating} className="bg-red-600 hover:bg-red-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1">
                              {creating ? 'Création...' : <><Plus className="w-3.5 h-3.5" /> Créer l'entreprise</>}
                            </button>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Expiry Modification Modal */}
              <AnimatePresence>
                {expiryForm.tenantId && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
                    <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-gray-900 border border-gray-800 rounded-2xl max-w-sm w-full p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2"><Calendar className="w-4 h-4 text-violet-400" /> Modifier date d'expiration</h3>
                        <button onClick={() => setExpiryForm({ tenantId: '', endDate: '' })} className="p-1 hover:bg-gray-800 rounded"><X className="w-4 h-4 text-gray-500" /></button>
                      </div>
                      <label className="text-[10px] font-mono text-gray-500 block mb-1">Nouvelle date d'expiration</label>
                      <input type="date" value={expiryForm.endDate} onChange={e => setExpiryForm(p => ({ ...p, endDate: e.target.value }))} className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white mb-4" />
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setExpiryForm({ tenantId: '', endDate: '' })} className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold px-4 py-2 rounded-lg">Annuler</button>
                        <button onClick={handleModifyExpiry} disabled={!expiryForm.endDate} className="bg-violet-600 hover:bg-violet-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-xs font-bold px-4 py-2 rounded-lg">Enregistrer</button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Tenant Detail Drawer */}
              <AnimatePresence>
                {selectedTenantId && tenantDetail && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
                    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-gray-900 border border-gray-800 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-rose-600 flex items-center justify-center text-sm font-bold text-white">{tenantDetail.name?.[0] || '?'}</div>
                          <div>
                            <h3 className="text-sm font-bold text-white">{tenantDetail.name}</h3>
                            <p className="text-[10px] text-gray-500 font-mono">{tenantDetail.email} | {tenantDetail.phone || '-'}</p>
                          </div>
                        </div>
                        <button onClick={() => { setSelectedTenantId(null); setTenantDetail(null); }} className="p-1 hover:bg-gray-800 rounded"><X className="w-4 h-4 text-gray-500" /></button>
                      </div>

                      {detailLoading ? (
                        <div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full" /></div>
                      ) : (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="bg-gray-950 border border-gray-800 rounded-xl p-3">
                              <p className="text-[9px] uppercase text-gray-500 font-mono">Plan</p>
                              <p className="text-xs font-bold font-mono text-white mt-1">{tenantDetail.plan}</p>
                            </div>
                            <div className="bg-gray-950 border border-gray-800 rounded-xl p-3">
                              <p className="text-[9px] uppercase text-gray-500 font-mono">Statut</p>
                              <p className="text-xs font-bold font-mono text-white mt-1">{tenantDetail.subscriptionStatus}</p>
                            </div>
                            <div className="bg-gray-950 border border-gray-800 rounded-xl p-3">
                              <p className="text-[9px] uppercase text-gray-500 font-mono">Date fin</p>
                              <p className="text-xs font-bold font-mono text-white mt-1">{tenantDetail.subscriptionEndDate ? new Date(tenantDetail.subscriptionEndDate).toLocaleDateString('fr-FR') : '-'}</p>
                            </div>
                            <div className="bg-gray-950 border border-gray-800 rounded-xl p-3">
                              <p className="text-[9px] uppercase text-gray-500 font-mono">Adresse</p>
                              <p className="text-xs font-bold font-mono text-white mt-1 truncate">{tenantDetail.address || '-'}</p>
                            </div>
                          </div>

                          {tenantStats && (
                            <div>
                              <h4 className="text-xs font-bold text-gray-300 uppercase font-mono mb-2 flex items-center gap-1"><Activity className="w-3 h-3" /> Statistiques d'utilisation</h4>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <div className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-center">
                                  <p className="text-lg font-bold font-mono text-white">{tenantStats.productCount}</p>
                                  <p className="text-[9px] text-gray-500">Produits</p>
                                </div>
                                <div className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-center">
                                  <p className="text-lg font-bold font-mono text-white">{tenantStats.saleCount}</p>
                                  <p className="text-[9px] text-gray-500">Ventes</p>
                                </div>
                                <div className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-center">
                                  <p className="text-lg font-bold font-mono text-white">{tenantStats.invoiceCount}</p>
                                  <p className="text-[9px] text-gray-500">Factures</p>
                                </div>
                                <div className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-center">
                                  <p className="text-lg font-bold font-mono text-white">{tenantStats.customerCount}</p>
                                  <p className="text-[9px] text-gray-500">Clients</p>
                                </div>
                                <div className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-center">
                                  <p className="text-lg font-bold font-mono text-white">{tenantStats.userCount}</p>
                                  <p className="text-[9px] text-gray-500">Utilisateurs</p>
                                </div>
                                <div className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-center">
                                  <p className="text-lg font-bold font-mono text-white">{Number(tenantStats.totalRevenue).toLocaleString()}</p>
                                  <p className="text-[9px] text-gray-500">CA total</p>
                                </div>
                                <div className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-center">
                                  <p className="text-lg font-bold font-mono text-white">{Number(tenantStats.totalSalesMonth).toLocaleString()}</p>
                                  <p className="text-[9px] text-gray-500">CA 30j</p>
                                </div>
                                <div className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-center">
                                  <p className="text-lg font-bold font-mono text-white">{tenantStats.expenseCount}</p>
                                  <p className="text-[9px] text-gray-500">Dépenses</p>
                                </div>
                              </div>
                            </div>
                          )}

                          {tenantLogs.length > 0 && (
                            <div>
                              <h4 className="text-xs font-bold text-gray-300 uppercase font-mono mb-2 flex items-center gap-1"><FileText className="w-3 h-3" /> Journal d'activité</h4>
                              <div className="max-h-[200px] overflow-y-auto space-y-1 bg-gray-950 rounded-xl p-2">
                                {tenantLogs.map((log: any) => (
                                  <div key={log.id} className="flex items-start gap-2 text-[10px] text-gray-400 py-1 border-b border-gray-800/30 last:border-0">
                                    <span className="font-mono text-gray-500 whitespace-nowrap">{new Date(log.timestamp).toLocaleDateString('fr-FR')}</span>
                                    <span className="bg-gray-800 px-1.5 py-0.5 rounded text-[8px] font-mono text-gray-300 whitespace-nowrap">{log.action}</span>
                                    <span className="flex-1">{log.details}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* TAB 3: MANAGING ALL USERS IN SYSTEM */}
          {activeSubTab === 'users' && (
            <motion.div
              key="users"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {/* Active Session Info - Seul le Super Admin voit cela */}
              {activeUserId && (
                (() => {
                  const connectedUser = db.users.find(u => u.id === activeUserId);
                  if (!connectedUser) return null;
                  const connectedTenant = db.tenants.find(t => t.id === connectedUser.tenantId);
                  return (
                    <div className="bg-emerald-950/20 border border-emerald-500/25 p-4 rounded-xl flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <span className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                        </span>
                        <div>
                          <p className="text-xs font-bold text-gray-200">Session de Contrôle Active</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            Super-administrateur actuellement connecté : <span className="text-emerald-400 font-bold">{connectedUser.name}</span> ({connectedUser.email}) — Boutique : <span className="text-blue-400 font-bold">{connectedTenant?.name || connectedUser.tenantId}</span>
                          </p>
                        </div>
                      </div>
                      <span className="text-[9px] font-mono font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-full uppercase tracking-wider">
                        Super Admin
                      </span>
                    </div>
                  );
                })()
              )}

              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 font-mono">Utilisateurs du SaaS (Multi-tenant)</h3>
                <input
                  type="text"
                  placeholder="Filtrer par nom, email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-gray-950 border border-gray-800 rounded-xl pl-4 pr-4 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="overflow-x-auto border border-gray-800 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-950 text-gray-400 font-mono text-[9px] uppercase border-b border-gray-800">
                    <tr>
                      <th className="p-3">Collaborateur</th>
                      <th className="p-3">Adresse E-mail</th>
                      <th className="p-3">Rôle Assigné</th>
                      <th className="p-3">Tenant (Boutique)</th>
                      <th className="p-3">Statut de Connexion</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-850">
                    {filteredUsers.map(u => {
                      const tenant = db.tenants.find(t => t.id === u.tenantId);
                      const tenantName = tenant ? tenant.name : 'Inconnu';
                      const isCurrentUser = u.id === activeUserId;

                      return (
                        <tr key={u.id} className={`hover:bg-gray-950/20 transition ${isCurrentUser ? 'bg-emerald-950/5' : ''}`}>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              {u.avatar ? (
                                <img src={u.avatar} alt={u.name} className="w-6 h-6 rounded-full object-cover border border-gray-800" />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-blue-600/20 text-blue-400 text-[10px] font-bold flex items-center justify-center uppercase font-mono">{u.name[0]}</div>
                              )}
                              <span className="font-bold text-gray-200">{u.name}</span>
                              {isCurrentUser && (
                                <span className="text-[8px] uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/15 text-emerald-400 px-1 py-0.2 rounded font-bold">Moi</span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 font-mono text-gray-400">{u.email}</td>
                          <td className="p-3">
                            <span className="text-[9px] font-mono bg-gray-950 border border-gray-800 px-2 py-0.5 rounded uppercase font-bold text-gray-400">
                              {u.role}
                            </span>
                          </td>
                          <td className="p-3 font-medium text-gray-300">{tenantName}</td>
                          <td className="p-3">
                            {isCurrentUser ? (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-bold font-mono">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                CONNECTÉ
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-gray-950 border border-gray-850 text-gray-500 text-[9px] font-medium font-mono">
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-800" />
                                HORS LIGNE
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right space-x-1">
                            <button
                              onClick={() => handleOpenPasswordModal(u.id)}
                              className="px-2 py-1 text-[10px] font-bold text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 border border-amber-500/20 rounded-lg transition"
                              title="Réinitialiser le mot de passe et forcer la modification lors de la prochaine connexion"
                            >
                              Réinitialiser MDP
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u.id)}
                              className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-red-500/10 transition inline-flex items-center"
                              title="Supprimer définitivement l'utilisateur"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {/* TAB 4: MANUAL OFFLINE PAYMENT REQUESTS AUDITING */}
          {activeSubTab === 'invoices' && (
            <motion.div
              key="invoices"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 font-mono">Validation des reçus de paiement hors ligne</h3>
                <p className="text-xs text-gray-400 mt-1">
                  Les clients du SaaS déclarent leurs paiements (Orange Money, Wave, Virement, cash) depuis leur panneau boutique. Auditez les preuves de paiement ci-dessous avant d'activer leur forfait.
                </p>
              </div>

              {/* 1. PENDING AUDIT LOGS */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-amber-400 animate-pulse" />
                  Dossiers en attente de vérification comptable ({pendingPayments.length})
                </h4>

                {pendingPayments.length === 0 ? (
                  <div className="bg-gray-950 border border-gray-850 rounded-xl p-8 text-center text-xs text-gray-500 italic">
                    Aucun reçu de paiement en attente d'audit pour le moment. Tout est à jour !
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {pendingPayments.map(p => (
                      <div key={p.id} className="bg-gray-950 border border-gray-800 rounded-xl p-5 space-y-4 relative overflow-hidden">
                        
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-[10px] bg-blue-500/10 border border-blue-500/20 text-blue-400 px-2 py-0.5 rounded font-mono font-bold uppercase">{p.paymentMethod}</span>
                            <h4 className="text-sm font-black text-white mt-1.5">{p.tenantName}</h4>
                            <p className="text-[10px] text-gray-500 font-mono">Date de déclaration : {new Date(p.createdAt).toLocaleDateString('fr-FR')} à {new Date(p.createdAt).toLocaleTimeString('fr-FR')}</p>
                          </div>

                          <div className="text-right">
                            <span className="text-[10px] font-mono text-gray-500">Forfait souhaité</span>
                            <p className="text-base font-black text-purple-400 font-mono">{p.planName}</p>
                            <p className="text-xs font-black text-white font-mono">{p.amount} {p.currency || db.saasCurrency || 'EUR'}</p>
                          </div>
                        </div>

                        {/* Transaction details card */}
                        <div className="grid grid-cols-2 gap-3 bg-gray-900/50 p-3 rounded-xl border border-gray-850 text-[11px] font-mono">
                          <div>
                            <span className="text-gray-500 block">Référence :</span>
                            <span className="text-gray-300 font-bold">{p.reference}</span>
                          </div>
                          <div>
                            <span className="text-gray-500 block">N° Émetteur :</span>
                            <span className="text-gray-300 font-bold">{p.transactionNumber}</span>
                          </div>
                        </div>

                        {p.comment && (
                          <div className="bg-gray-900 p-2.5 rounded-lg border border-gray-850 text-[11px] text-gray-400 leading-normal">
                            <strong className="text-gray-300">Note du client :</strong> "{p.comment}"
                          </div>
                        )}

                        {/* Receipt Screenshot Render */}
                        {p.receiptImage && (
                          <div className="space-y-1.5">
                            <span className="text-[10px] font-mono text-gray-500 block">Capture d'écran du transfert :</span>
                            <div className="relative group rounded-lg overflow-hidden border border-gray-800 bg-gray-900 max-h-48">
                              <img 
                                src={p.receiptImage} 
                                alt="Capture d'écran du reçu" 
                                className="w-full h-36 object-cover hover:scale-105 transition duration-300"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1554415707-6e8cfc93fe23?w=300&fit=crop&q=80";
                                }}
                              />
                              <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                <a href={p.receiptImage} target="_blank" rel="noreferrer" className="text-white text-xs font-bold underline flex items-center gap-1">
                                  <Eye className="w-4 h-4" /> Ouvrir dans un nouvel onglet
                                </a>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Admin Action Comments box */}
                        <div className="space-y-2 pt-2 border-t border-gray-900">
                          <label className="block text-[10px] font-mono text-gray-500 uppercase">Commentaire ou motif (Sera transmis au client) :</label>
                          <input
                            type="text"
                            placeholder="ex: Versement de 29 EUR reçu sur notre compte OM le 15/07. Compte activé."
                            value={adminComment}
                            onChange={(e) => setAdminComment(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-800 text-xs rounded-xl px-3 py-2 text-white placeholder-gray-700 focus:outline-none"
                          />
                        </div>

                        {/* Validation trigger buttons */}
                        <div className="flex gap-2 pt-1 justify-end">
                          <button
                            onClick={() => handleProcessPayment(p.id, 'REJECTED')}
                            className="bg-red-500/10 border border-red-500/25 hover:bg-red-500/20 text-red-400 font-bold text-xs px-4 py-2 rounded-lg transition flex items-center gap-1"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Rejeter le reçu
                          </button>
                          <button
                            onClick={() => handleProcessPayment(p.id, 'APPROVED')}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2 rounded-lg transition flex items-center gap-1 shadow-lg shadow-emerald-500/15"
                          >
                            <CheckCircle className="w-3.5 h-3.5" /> Approuver & Activer
                          </button>
                        </div>

                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 2. PROCESSED RECEIPTS ARCHIVE */}
              <div className="space-y-4 pt-4 border-t border-gray-850">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider font-mono">Historique des reçus audités</h4>

                <div className="overflow-x-auto border border-gray-850 rounded-xl">
                  <table className="w-full text-left text-xs font-sans">
                    <thead className="bg-gray-950 text-gray-400 font-mono text-[9px] uppercase border-b border-gray-850">
                      <tr>
                        <th className="p-3">Client</th>
                        <th className="p-3">Forfait</th>
                        <th className="p-3">Méthode</th>
                        <th className="p-3">Référence / Montant</th>
                        <th className="p-3">Décision</th>
                        <th className="p-3">Commentaire d'administration</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-850 font-medium">
                      {processedPayments.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-gray-500 italic">Aucun paiement traité archivé pour le moment.</td>
                        </tr>
                      ) : (
                        processedPayments.map(p => (
                          <tr key={p.id} className="hover:bg-gray-950/10 transition text-gray-300">
                            <td className="p-3 font-bold text-white">{p.tenantName}</td>
                            <td className="p-3 font-mono text-[11px] text-purple-400">{p.planName}</td>
                            <td className="p-3 font-mono text-gray-400">{p.paymentMethod}</td>
                            <td className="p-3">
                              <p className="font-mono text-[11px] font-bold text-gray-200">{p.reference}</p>
                              <p className="font-mono text-[10px] text-gray-500">{p.amount} {p.currency || db.saasCurrency || 'EUR'}</p>
                            </td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 text-[9px] font-black font-mono rounded uppercase ${
                                p.status === 'APPROVED' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'
                              }`}>
                                {p.status === 'APPROVED' ? 'Validé' : 'Rejeté'}
                              </span>
                            </td>
                            <td className="p-3 text-xs text-gray-400 italic font-sans max-w-xs truncate">{p.adminComment}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </motion.div>
          )}

          {/* TAB 5: EDITING TECHNICAL PRICING & PAYMENT INFRASTRUCTURES */}
          {activeSubTab === 'plans' && (() => {
            const currentSettings = localGlobalSaaSSettings || globalSaaSSettings;
            const currentPlans = localPricingPlans.length > 0 ? localPricingPlans : pricingPlans;
            const currentCurrency = localSaasCurrency;

            return (
              <motion.div
                key="plans"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                {/* Save button and explanation banner */}
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 bg-gray-950 border border-gray-855 p-4 rounded-xl">
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-gray-200 font-mono">Moduler les forfaits & Coordonnées de paiement</h3>
                    <p className="text-xs text-gray-400 mt-1">
                      Configurez en temps réel les tarifs de facturation, les seuils maximum d'isolation, ainsi que les informations de versement affichées aux clients pour l'offline-payment.
                    </p>
                  </div>
                  <div>
                    <button
                      onClick={handleSaveAllSaaSSettings}
                      disabled={isSaaSSettingsSaving}
                      className={`px-5 py-2 rounded-lg font-bold text-xs transition flex items-center gap-2 shadow-lg ${
                        isSaaSSettingsSaved 
                          ? 'bg-emerald-600 text-white shadow-emerald-500/10' 
                          : 'bg-red-600 hover:bg-red-500 text-white shadow-red-500/15'
                      }`}
                    >
                      {isSaaSSettingsSaving ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" /> Enregistrement...
                        </>
                      ) : isSaaSSettingsSaved ? (
                        <>
                          <Check className="w-4 h-4" /> Enregistré !
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4" /> Enregistrer la Configuration SaaS
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* SECTION A: PAYMENT INFRASTRUCTURE COORDINATES */}
                <div className="bg-gray-950 border border-gray-855 rounded-xl p-5 space-y-4">
                  <h4 className="text-xs font-bold text-gray-300 uppercase font-mono tracking-wider">A. Coordonnées de paiement affichées aux clients</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Numéro Orange Money *</label>
                      <input
                        type="text"
                        value={currentSettings?.orangeMoneyNumber || ''}
                        onChange={(e) => handleSaveGlobalPaymentsSettings('orangeMoneyNumber', e.target.value)}
                        className="w-full bg-gray-900 border border-gray-800 text-xs rounded-lg px-3.5 py-2 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Titulaire Compte Orange Money *</label>
                      <input
                        type="text"
                        value={currentSettings?.orangeMoneyName || ''}
                        onChange={(e) => handleSaveGlobalPaymentsSettings('orangeMoneyName', e.target.value)}
                        className="w-full bg-gray-900 border border-gray-800 text-xs rounded-lg px-3.5 py-2 text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Numéro MTN / Mobile Money *</label>
                      <input
                        type="text"
                        value={currentSettings?.mobileMoneyNumber || ''}
                        onChange={(e) => handleSaveGlobalPaymentsSettings('mobileMoneyNumber', e.target.value)}
                        className="w-full bg-gray-900 border border-gray-800 text-xs rounded-lg px-3.5 py-2 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Titulaire Compte Mobile Money *</label>
                      <input
                        type="text"
                        value={currentSettings?.mobileMoneyName || ''}
                        onChange={(e) => handleSaveGlobalPaymentsSettings('mobileMoneyName', e.target.value)}
                        className="w-full bg-gray-900 border border-gray-800 text-xs rounded-lg px-3.5 py-2 text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Coordonnées bancaires complètes (RIB/IBAN) *</label>
                      <textarea
                        rows={3}
                        value={currentSettings?.bankDetails || ''}
                        onChange={(e) => handleSaveGlobalPaymentsSettings('bankDetails', e.target.value)}
                        className="w-full bg-gray-900 border border-gray-800 text-xs rounded-lg px-3.5 py-2 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Instructions détaillées de paiement *</label>
                      <textarea
                        rows={3}
                        value={currentSettings?.paymentInstructions || ''}
                        onChange={(e) => handleSaveGlobalPaymentsSettings('paymentInstructions', e.target.value)}
                        className="w-full bg-gray-900 border border-gray-800 text-xs rounded-lg px-3.5 py-2 text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 border-t border-gray-900 pt-3 text-xs">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Devise de facturation globale (SaaS)</label>
                      <select
                        value={currentCurrency}
                        onChange={(e) => {
                          const newCurrency = e.target.value;
                          setLocalSaasCurrency(newCurrency);
                          setLocalPricingPlans(prev => prev.map(p => ({
                            ...p,
                            currency: newCurrency
                          })));
                        }}
                        className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-red-500"
                      >
                        <option value="EUR">EUR (€)</option>
                        <option value="USD">USD ($)</option>
                        <option value="GNF">GNF (FG)</option>
                        <option value="XOF">XOF (CFA)</option>
                        <option value="XAF">XAF (FCFA)</option>
                        <option value="CAD">CAD ($)</option>
                        <option value="GBP">GBP (£)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Durée d'essai gratuit (jours)</label>
                      <input
                        type="number"
                        value={currentSettings?.trialDays || 14}
                        onChange={(e) => handleSaveGlobalPaymentsSettings('trialDays', Number(e.target.value))}
                        className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3.5 py-1.5 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Période de grâce autorisée (jours)</label>
                      <input
                        type="number"
                        value={currentSettings?.gracePeriodDays || 5}
                        onChange={(e) => handleSaveGlobalPaymentsSettings('gracePeriodDays', Number(e.target.value))}
                        className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3.5 py-1.5 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Forfait de repli après expiration</label>
                      <select
                        value={currentSettings?.revertToPlanOnExpiry || 'Free'}
                        onChange={(e) => handleSaveGlobalPaymentsSettings('revertToPlanOnExpiry', e.target.value)}
                        className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5 text-white font-medium text-xs"
                      >
                        <option value="Free">Plan Free (Downgrade)</option>
                        <option value="ReadOnly">Mode lecture seule strict</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* SECTION B: PRICING FORFAITS EDITING */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-gray-300 uppercase font-mono tracking-wider">B. Tarification & Restrictions d'isolation des Forfaits</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {currentPlans.map((pl, idx) => (
                      <div key={pl.id} className="bg-gray-950 border border-gray-855 p-4 rounded-xl space-y-4 relative">
                        <span className="text-[10px] font-mono font-bold text-red-400 bg-red-500/10 border border-red-500/15 px-2.5 py-0.5 rounded-full absolute top-4 right-4">
                          {pl.name}
                        </span>

                        <div className="space-y-1.5 mt-2">
                          <label className="text-[10px] font-mono font-bold text-gray-500 uppercase">Tarif mensuel ({pl.currency || currentCurrency})</label>
                          <input
                            type="number"
                            value={pl.price}
                            onChange={(e) => handleSavePlanSettings(idx, 'price', e.target.value)}
                            className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5 text-xs font-mono text-white font-bold"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[9px] font-mono font-bold text-gray-500 uppercase">Produits max</label>
                            <input
                              type="number"
                              value={pl.limits.maxProducts}
                              onChange={(e) => handleSavePlanSettings(idx, 'limits.maxProducts', e.target.value)}
                              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-1 text-xs font-mono text-white"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-mono font-bold text-gray-500 uppercase">Ventes max</label>
                            <input
                              type="number"
                              value={pl.limits.maxSales || 100}
                              onChange={(e) => handleSavePlanSettings(idx, 'limits.maxSales', e.target.value)}
                              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-1 text-xs font-mono text-white"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[9px] font-mono font-bold text-gray-500 uppercase">Clients max</label>
                            <input
                              type="number"
                              value={pl.limits.maxCustomers || 50}
                              onChange={(e) => handleSavePlanSettings(idx, 'limits.maxCustomers', e.target.value)}
                              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-1 text-xs font-mono text-white"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-mono font-bold text-gray-500 uppercase">Utilisateurs max</label>
                            <input
                              type="number"
                              value={pl.limits.maxUsers}
                              onChange={(e) => handleSavePlanSettings(idx, 'limits.maxUsers', e.target.value)}
                              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-1 text-xs font-mono text-white"
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono font-bold text-gray-500 uppercase">Slogan descriptif du forfait</label>
                          <input
                            type="text"
                            value={pl.description}
                            onChange={(e) => handleSavePlanSettings(idx, 'description', e.target.value)}
                            className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-white"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bottom save bar */}
                <div className="flex justify-end pt-4 border-t border-gray-900">
                  <button
                    onClick={handleSaveAllSaaSSettings}
                    disabled={isSaaSSettingsSaving}
                    className={`px-6 py-2.5 rounded-xl font-bold text-xs transition flex items-center gap-2 shadow-lg ${
                      isSaaSSettingsSaved 
                        ? 'bg-emerald-600 text-white shadow-emerald-500/10' 
                        : 'bg-red-600 hover:bg-red-500 text-white shadow-red-500/15'
                    }`}
                  >
                    {isSaaSSettingsSaving ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" /> Enregistrement...
                      </>
                    ) : isSaaSSettingsSaved ? (
                      <>
                        <Check className="w-4 h-4" /> Enregistré !
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-4 h-4" /> Enregistrer la Configuration SaaS
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            );
          })()}

          {/* TAB 6: SUPPORT CLIENT TICKETS */}
          {activeSubTab === 'modules' && (
            <SuperAdminModuleManager />
          )}
          {activeSubTab === 'support' && (
            <motion.div
              key="support"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 font-mono">Assistance Client & Support Desk</h3>
              <p className="text-xs text-gray-400">
                Aidez vos clients en répondant directement à leurs questions techniques ou demandes d'activation manuelle.
              </p>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
                <div className="lg:col-span-5 space-y-3">
                  {supportTickets.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTicketId(t.id)}
                      className={`w-full p-4 rounded-xl border text-left transition ${
                        selectedTicketId === t.id 
                          ? 'bg-red-500/10 border-red-500/30 text-white' 
                          : 'bg-gray-950 border-gray-850 hover:border-gray-800 text-gray-400'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-gray-500">{t.date}</span>
                        <span className={`px-2 py-0.5 text-[8px] font-mono font-bold rounded uppercase ${
                          t.status === 'Ouvert' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-gray-800 text-gray-500'
                        }`}>
                          {t.status}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-gray-200 mt-2 truncate">{t.subject}</h4>
                      <p className="text-[10px] text-gray-500 mt-0.5 truncate">Par : {t.sender}</p>
                    </button>
                  ))}
                </div>

                <div className="lg:col-span-7">
                  {selectedTicketId ? (() => {
                    const ticket = supportTickets.find(t => t.id === selectedTicketId);
                    if (!ticket) return null;
                    return (
                      <div className="bg-gray-950 border border-gray-850 rounded-xl p-5 space-y-4">
                        <div>
                          <h4 className="text-xs font-bold text-gray-400 font-mono">Détails de la demande</h4>
                          <h3 className="text-sm font-bold text-white mt-1">{ticket.subject}</h3>
                          <p className="text-[10px] text-gray-500 mt-0.5">Expéditeur : {ticket.sender} | Date : {ticket.date}</p>
                        </div>

                        <div className="bg-gray-900 border border-gray-850 p-3.5 rounded-xl text-xs text-gray-300 leading-relaxed whitespace-pre-line font-medium">
                          {ticket.text}
                        </div>

                        {ticket.status === 'Ouvert' && (
                          <div className="space-y-3.5 pt-2 border-t border-gray-900">
                            <label className="block text-[10px] font-mono text-gray-500 uppercase">Rédiger votre réponse d'assistance :</label>
                            <textarea
                              rows={4}
                              value={replyText}
                              onChange={(e) => setReplyText(e.target.value)}
                              className="w-full bg-gray-900 border border-gray-850 text-xs rounded-xl px-4 py-2.5 text-white"
                              placeholder="ex: Bonjour, pour imprimer, cliquez sur le bouton PDF dans le POS ou Ctrl+P..."
                            />
                            <div className="flex justify-end">
                              <button
                                onClick={() => handleSendTicketReply(ticket.id)}
                                className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition"
                              >
                                Envoyer la réponse & Clôturer
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })() : (
                    <div className="bg-gray-950 border border-gray-850 rounded-xl p-8 text-center text-xs text-gray-500 italic h-full flex items-center justify-center">
                      Sélectionnez un ticket pour visualiser l'historique de la discussion.
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 7: GLOBAL AUDIT SYSTEM LOGS */}
          {activeSubTab === 'logs' && (
            <motion.div
              key="logs"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 font-mono">Chronologie des Événements & Audit Comptable</h3>
              <p className="text-xs text-gray-400">
                Chaque action sensible (activation, modification de prix, suppression d'article) est enregistrée de manière immuable pour l'audit.
              </p>

              <div className="overflow-x-auto border border-gray-800 rounded-xl mt-2 max-h-96">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-950 text-gray-400 font-mono text-[9px] uppercase border-b border-gray-800">
                    <tr>
                      <th className="p-3">Horodatage (UTC)</th>
                      <th className="p-3">Auteur</th>
                      <th className="p-3">Action Système</th>
                      <th className="p-3">Détails d'Évènement</th>
                      <th className="p-3">Boutique ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-850 font-mono text-[10.5px]">
                    {(db.auditLogs || []).map((lg, idx) => (
                      <tr key={idx} className="hover:bg-gray-950/20 transition text-gray-400">
                        <td className="p-3 text-gray-500 font-sans">{new Date(lg.timestamp).toLocaleString('fr-FR')}</td>
                        <td className="p-3 font-sans text-gray-200">{lg.userName}</td>
                        <td className="p-3 font-bold text-red-400 uppercase">{lg.action}</td>
                        <td className="p-3 text-gray-300 font-sans">{lg.details}</td>
                        <td className="p-3 text-gray-500">{lg.tenantId || 'SaaS root'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
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
