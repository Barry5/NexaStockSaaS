/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CreditCard,
  Layers,
  ShieldCheck,
  RefreshCw,
  Building,
  Check,
  Users,
  Lock,
  UserCircle,
  TrendingUp,
  Sparkles,
  Globe,
  Coins,
  Save,
  FileText,
  AlertCircle,
  AlertTriangle,
  ShieldAlert,
  Plus,
  Trash2,
  Clock,
  DollarSign,
  Palette,
  ArrowRight,
  Upload,
  Phone,
  Tag,
  Key,
  HelpCircle,
  Eye,
  EyeOff
} from 'lucide-react';
import type { Tenant, User, SubscriptionPlan, UserRole, SubscriptionPayment, PricingPlan } from '../types';
import { useDB, useApp } from '../context';
import { getTenantPlanStatus, getRemainingDays, getActivePlan, futurePaymentProviders } from '../lib/subscriptionUtils.js';
import { Modal } from './shared/Modal';
import { ConfirmDialog } from './shared/ConfirmDialog';
import { AppearanceSettings } from '../pages/AppearanceSettings';


export default function SaaSSettings() {
  const { db, handleUpdateDb, isSyncing, handleSyncFromServer, addNotification } = useDB();
  const { activeTenantId, activeUserId, handleSwitchTenant, handleSwitchUser, handleUpdateTenantPlan } = useApp();
  
  const activeTenant = useMemo(() => db.tenants.find(t => t.id === activeTenantId), [db.tenants, activeTenantId]);
  const activeUser = useMemo(() => db.users.find(u => u.id === activeUserId), [db.users, activeUserId]);

  const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const isSuperAdmin = activeUser?.role === 'superadmin';
  const [activeSettingsTab, setActiveSettingsTab] = useState<'boutique' | 'saas' | 'team' | 'tenants' | 'backup'>('boutique');

  // Redirect away from tenants tab if not superadmin
  React.useEffect(() => {
    if (activeSettingsTab === 'tenants' && !isSuperAdmin) {
      setActiveSettingsTab('boutique');
    }
  }, [activeSettingsTab, isSuperAdmin]);
  const [shopName, setShopName] = useState('');
  const [shopDescription, setShopDescription] = useState('');
  const [shopCurrency, setShopCurrency] = useState('EUR');
  const [shopTaxRate, setShopTaxRate] = useState<number | string>(20);
  const [shopAddress, setShopAddress] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [shopLogo, setShopLogo] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  // User Management local form state
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('vendeur');
  const [newUserPassword, setNewUserPassword] = useState('');

  // Offline Payment local form state
  const [isPaymentFormOpen, setIsPaymentFormOpen] = useState(false);
  const [paymentTargetPlan, setPaymentTargetPlan] = useState<PricingPlan | null>(null);
  const [payAmount, setPayAmount] = useState(29);
  const [payMethod, setPayMethod] = useState('Orange Money');
  const [payReference, setPayReference] = useState('');
  const [payNumTransaction, setPayNumTransaction] = useState('');
  const [payComment, setPayComment] = useState('');
  const [payReceiptSim, setPayReceiptSim] = useState('');
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupList, setBackupList] = useState<any[]>([]);
  const [backupLabel, setBackupLabel] = useState('Sauvegarde manuelle');
  const [backupStrategy, setBackupStrategy] = useState<'full' | 'incremental' | 'differential'>('full');
  const [backupDestination, setBackupDestination] = useState<'local' | 'remote'>('local');
  const [gdriveConnected, setGdriveConnected] = useState(false);
  const [gdriveEmail, setGdriveEmail] = useState<string | null>(null);
  const [gdriveBackups, setGdriveBackups] = useState<any[]>([]);
  const [gdriveLoading, setGdriveLoading] = useState(false);
  const [gdriveRestoring, setGdriveRestoring] = useState(false);
  const [gdriveRestoreSteps, setGdriveRestoreSteps] = useState<string[]>([]);
  const [gdriveRestoreDone, setGdriveRestoreDone] = useState(false);
  const [gdriveSelectedBackup, setGdriveSelectedBackup] = useState<any | null>(null);
  const [gdriveTenantId, setGdriveTenantId] = useState<string>(activeTenantId);

  const [deleteTeamUserData, setDeleteTeamUserData] = useState<{ id: string; name: string } | null>(null);

  // Active pricing plans and global config resolved with safe defaults
  const pricingPlans = useMemo(() => {
    const currency = activeTenant?.currency || db.saasCurrency || 'EUR';
    const plans = db.pricingPlans && db.pricingPlans.length > 0 ? db.pricingPlans : [
      { id: 'plan-free', name: 'Free', description: 'Idéal pour tester l\'application.', price: 0, currency: 'EUR', durationDays: 14, features: [], limits: { maxProducts: 50, maxSales: 100, maxCustomers: 20, maxUsers: 1 }, color: 'gray', displayOrder: 1, active: true },
      { id: 'plan-standard', name: 'Standard', description: 'Pour les PME établies.', price: 29, currency: 'EUR', durationDays: 30, features: [], limits: { maxProducts: 9999, maxSales: 9999, maxCustomers: 9999, maxUsers: 5 }, color: 'blue', displayOrder: 2, active: true },
      { id: 'plan-premium', name: 'Premium', description: 'Le summum de l\'intelligence.', price: 79, currency: 'EUR', durationDays: 30, features: [], limits: { maxProducts: 99999, maxSales: 99999, maxCustomers: 99999, maxUsers: 99 }, color: 'purple', displayOrder: 3, active: true }
    ];
    return plans.map(p => ({
      ...p,
      currency
    }));
  }, [db.pricingPlans, db.saasCurrency, activeTenant?.currency]);

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

  // Current tenant stats and limits
  const tenantPlanStatus = useMemo(() => {
    if (!activeTenant) return null;
    return getTenantPlanStatus(activeTenant, db);
  }, [activeTenant, db]);

  const remainingDays = useMemo(() => {
    if (!activeTenant) return { days: 0, isExpired: false, text: '' };
    return getRemainingDays(activeTenant);
  }, [activeTenant]);

  const tenantUsers = useMemo(() => {
    return db.users.filter(u => u.tenantId === activeTenantId);
  }, [db.users, activeTenantId]);

  const tenantPayments = useMemo(() => {
    return (db.subscriptionPayments || []).filter(p => p.tenantId === activeTenantId);
  }, [db.subscriptionPayments, activeTenantId]);

  useEffect(() => {
    if (activeTenant) {
      setShopName(activeTenant.name || '');
      setShopDescription(activeTenant.description || '');
      setShopCurrency(activeTenant.currency || 'EUR');
      setShopTaxRate(activeTenant.taxRate !== undefined ? activeTenant.taxRate : 20);
      setShopAddress(activeTenant.address || '');
      setShopPhone(activeTenant.phone || '');
      setShopLogo(activeTenant.logo || '');
      setIsSaved(false);
    }
  }, [activeTenant]);

  const formatSample = (val: number, currCode: string) => {
    try {
      return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: currCode.toUpperCase().trim(),
        minimumFractionDigits: 2
      }).format(val);
    } catch (err) {
      return `${val.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currCode.toUpperCase()}`;
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert("Le logo est trop volumineux. La taille maximale autorisée est de 2 Mo.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        if (reader.result) {
          setShopLogo(reader.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTenant) return;
    setSaveLoading(true);

    setTimeout(() => {
      const updatedTenant: Tenant = {
        ...activeTenant,
        name: shopName,
        description: shopDescription,
        currency: shopCurrency.toUpperCase().trim(),
        taxRate: shopTaxRate === '' ? 0 : Number(shopTaxRate),
        address: shopAddress,
        phone: shopPhone,
        logo: shopLogo
      };

      const audit: any = {
        id: `aud-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: activeUserId,
        userName: activeUser?.name || 'Système',
        action: 'PARAMETRES_BOUTIQUE_MODIFIES',
        details: `Identité, Devise (${shopCurrency}) et TVA de l'organisation mises à jour.`,
        tenantId: activeTenantId
      };

      const finalDb = {
        ...db,
        tenants: db.tenants.map(t => t.id === activeTenant.id ? updatedTenant : t),
        auditLogs: [audit, ...(db.auditLogs || [])]
      };

      handleUpdateDb(finalDb);
      setSaveLoading(false);
      setIsSaved(true);

      setTimeout(() => {
        setIsSaved(false);
      }, 3000);
    }, 600);
  };

  // Submit offline payment details
  const handleSubmitPaymentRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTenant || !paymentTargetPlan) return;

    const paymentId = `pm-${Date.now()}`;
    const newPayment: SubscriptionPayment = {
      id: paymentId,
      tenantId: activeTenantId,
      tenantName: activeTenant.name,
      planId: paymentTargetPlan.id,
      planName: paymentTargetPlan.name,
      amount: payAmount,
      currency: paymentTargetPlan.currency || db.saasCurrency || 'EUR',
      paymentMethod: payMethod,
      reference: payReference,
      transactionNumber: payNumTransaction,
      date: new Date().toISOString().split('T')[0],
      comment: payComment,
      receiptImage: payReceiptSim || 'https://images.unsplash.com/photo-1554415707-6e8cfc93fe23?w=300&fit=crop&q=80',
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Update Tenant Status to PENDING
    const updatedTenants = db.tenants.map(t => {
      if (t.id === activeTenantId) {
        return {
          ...t,
          subscriptionStatus: 'PENDING' as const,
          subscriptionPlanId: paymentTargetPlan.id
        };
      }
      return t;
    });

    const audit: any = {
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUserId,
      userName: activeUser?.name || 'Client',
      action: 'PAIEMENT_SOUMIS',
      details: `Déclaration de paiement hors plateforme de ${payAmount} ${paymentTargetPlan?.currency || db.saasCurrency || 'EUR'} (${payMethod}). Dossier en attente de validation. Ref: ${payReference}`,
      tenantId: activeTenantId
    };

    const nextDb = {
      ...db,
      tenants: updatedTenants,
      subscriptionPayments: [newPayment, ...(db.subscriptionPayments || [])],
      auditLogs: [audit, ...(db.auditLogs || [])]
    };

    handleUpdateDb(nextDb);
    setPaymentSuccess(true);
    setTimeout(() => {
      setPaymentSuccess(false);
      setIsPaymentFormOpen(false);
      setPayReference('');
      setPayNumTransaction('');
      setPayComment('');
      setPayReceiptSim('');
    }, 3000);
  };

  // Manage Enterprise Users (CRUD)
  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTenant || !newUserName || !newUserEmail || !newUserPassword) return;

    // Plan limits check
    if (tenantPlanStatus && tenantPlanStatus.users.isLimitReached) {
      alert(`Limite de comptes d'utilisateurs atteinte pour votre plan actif (${tenantPlanStatus.users.max} max). Veuillez faire évoluer votre abonnement.`);
      return;
    }

    const newId = `u-team-${Date.now()}`;
    const newUserObj: User = {
      id: newId,
      name: newUserName,
      email: newUserEmail,
      role: newUserRole,
      tenantId: activeTenantId,
      active: true,
      password: newUserPassword,
      firstLoginReset: true // Force password modification on first connection
    };

    const audit: any = {
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUserId,
      userName: activeUser?.name || 'Admin',
      action: 'TEAM_USER_CREATED',
      details: `Création du collaborateur ${newUserName} (${newUserRole}). Premier mot de passe configuré.`,
      tenantId: activeTenantId
    };

    const nextDb = {
      ...db,
      users: [...db.users, newUserObj],
      auditLogs: [audit, ...(db.auditLogs || [])]
    };

    handleUpdateDb(nextDb);
    setNewUserName('');
    setNewUserEmail('');
    setNewUserPassword('');
    alert(`Collaborateur ${newUserName} créé avec succès ! Il devra réinitialiser son mot de passe lors de sa première connexion.`);
  };

  const handleDeleteTeamUser = (userId: string, name: string) => {
    if (userId === activeUserId) {
      alert("Impossible de supprimer votre propre compte actif !");
      return;
    }
    setDeleteTeamUserData({ id: userId, name });
  };

  const confirmDeleteTeamUser = () => {
    if (!deleteTeamUserData) return;
    const nextUsers = db.users.filter(u => u.id !== deleteTeamUserData.id);

    const audit: any = {
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUserId,
      userName: activeUser?.name || 'Admin',
      action: 'TEAM_USER_REVOKED',
      details: `Révocation d'accès pour ${deleteTeamUserData.name}`,
      tenantId: activeTenantId
    };

    const nextDb = {
      ...db,
      users: nextUsers,
      auditLogs: [audit, ...(db.auditLogs || [])]
    };

    handleUpdateDb(nextDb);
    setDeleteTeamUserData(null);
  };

  const handleOpenPasswordModal = (userId: string) => {
    setResetPasswordUserId(userId);
    setResetPasswordValue('');
    setResetPasswordConfirm('');
    setShowResetPassword(true);
  };

  const handleConfirmPasswordReset = () => {
    if (!resetPasswordUserId) return;
    if (resetPasswordValue.length < 4) return;
    if (resetPasswordValue !== resetPasswordConfirm) return;

    const nextUsers = db.users.map(u => {
      if (u.id === resetPasswordUserId) {
        return {
          ...u,
          password: resetPasswordValue,
          firstLoginReset: false
        };
      }
      return u;
    });

    const target = db.users.find(u => u.id === resetPasswordUserId);

    const audit: any = {
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: activeUserId,
      userName: activeUser?.name || 'Admin',
      action: 'MOT_DE_PASSE_REINITIALISE_PREMIERE_CONNEXION',
      details: `Le mot de passe de ${target?.name} a été réinitialisé.`,
      tenantId: activeTenantId
    };

    const nextDb = {
      ...db,
      users: nextUsers,
      auditLogs: [audit, ...(db.auditLogs || [])]
    };

    handleUpdateDb(nextDb);
    setShowResetPassword(false);
    setResetPasswordUserId(null);
    addNotification(`Mot de passe réinitialisé pour ${target?.name}`);
  };

  // Use JWT token role (not UI-switched activeUser) to match server-side auth
  const jwtRole = useMemo(() => {
    try {
      const token = localStorage.getItem('nexastock_token');
      if (!token) return null;
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.role as string | null;
    } catch { return null; }
  }, []);
  const isBackupAdmin = jwtRole === 'superadmin' || jwtRole === 'owner' || jwtRole === 'admin';

  useEffect(() => {
    if (!isBackupAdmin) return;
    const token = localStorage.getItem('nexastock_token');
    fetch('/api/admin/backups/enterprise', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
      .then(res => res.ok ? res.json() : Promise.reject(res))
      .then(data => setBackupList(data.backups || []))
      .catch(() => setBackupList([]));
  }, [isBackupAdmin]);

  const handleCreateBackup = async () => {
    if (!isBackupAdmin) return;
    setBackupLoading(true);
    const token = localStorage.getItem('nexastock_token');
    try {
      const res = await fetch('/api/admin/backups/enterprise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          label: backupLabel,
          strategy: backupStrategy,
          destination: backupDestination,
          tenantId: activeTenantId,
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Échec de la sauvegarde');
      addNotification(`Sauvegarde créée : ${data.backup.manifest.label}`, 'success');
      setBackupList(prev => [
        {
          id: data.backup.manifest.id,
          label: data.backup.manifest.label,
          strategy: data.backup.manifest.strategy,
          destination: data.backup.manifest.destination,
          createdAt: data.backup.manifest.createdAt,
          encrypted: data.backup.manifest.encrypted,
          size: data.backup.manifest.size,
        },
        ...prev,
      ]);
    } catch (err: any) {
      addNotification(err.message || 'Erreur de sauvegarde', 'error');
    } finally {
      setBackupLoading(false);
    }
  };

  const authHeader = () => { const t = localStorage.getItem('nexastock_token'); return t ? { Authorization: `Bearer ${t}` } : {}; };

  useEffect(() => {
    if (!isBackupAdmin) return;
    const params = new URLSearchParams({ tenantId: gdriveTenantId });
    fetch(`/api/admin/backups/gdrive/status?${params}`, { headers: authHeader() })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { setGdriveConnected(d.connected); setGdriveEmail(d.email); })
      .catch(() => {});
  }, [isBackupAdmin, gdriveTenantId]);

  const handleGdriveConnect = async () => {
    const params = new URLSearchParams({ tenantId: gdriveTenantId });
    const res = await fetch(`/api/admin/backups/gdrive/auth-url?${params}`, { headers: authHeader() });
    const { url } = await res.json();
    const popup = window.open(url, 'gdrive-auth', 'width=500,height=600');
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'GDRIVE_AUTH_SUCCESS') {
        setGdriveConnected(true);
        setGdriveEmail(e.data.email);
        if (e.data.tenantId) setGdriveTenantId(e.data.tenantId);
        window.removeEventListener('message', handler);
        popup?.close();
      }
    };
    window.addEventListener('message', handler);
  };

  const handleGdriveDisconnect = async () => {
    const params = new URLSearchParams({ tenantId: gdriveTenantId });
    await fetch(`/api/admin/backups/gdrive/revoke?${params}`, { method: 'DELETE', headers: authHeader() });
    setGdriveConnected(false);
    setGdriveEmail(null);
    setGdriveBackups([]);
  };

  const handleGdriveUpload = async () => {
    setGdriveLoading(true);
    try {
      const res = await fetch('/api/admin/backups/gdrive/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ label: backupLabel, strategy: backupStrategy, tenantId: gdriveTenantId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Échec');
      addNotification(`Sauvegarde Drive créée : ${data.manifest.label}`, 'success');
      setGdriveBackups(prev => [data.manifest, ...prev]);
    } catch (err: any) {
      addNotification(err.message || 'Erreur Drive', 'error');
    } finally {
      setGdriveLoading(false);
    }
  };

  const handleLoadGdriveBackups = async () => {
    setGdriveLoading(true);
    try {
      const params = new URLSearchParams({ tenantId: gdriveTenantId });
      const res = await fetch(`/api/admin/backups/gdrive/list?${params}`, { headers: authHeader() });
      const data = await res.json();
      setGdriveBackups(data.backups || []);
    } catch { setGdriveBackups([]); }
    finally { setGdriveLoading(false); }
  };

  const handleGdriveRestore = async () => {
    if (!gdriveSelectedBackup) return;
    setGdriveRestoring(true);
    setGdriveRestoreSteps([]);
    setGdriveRestoreDone(false);
    const steps = ['Produits', 'Clients', 'Ventes', 'Stock', 'Paiements'];
    try {
      const res = await fetch('/api/admin/backups/gdrive/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ manifestId: gdriveSelectedBackup.id, tenantId: gdriveTenantId }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d?.error || 'Échec restauration'); }
      for (const step of steps) {
        await new Promise(r => setTimeout(r, 400));
        setGdriveRestoreSteps(prev => [...prev, step]);
      }
      setGdriveRestoreDone(true);
    } catch (err: any) {
      addNotification(err.message || 'Erreur restauration', 'error');
      setGdriveRestoring(false);
    }
  };

  const permissionsMatrix = [
    { action: "Saisir des ventes (Caisse POS)", admin: true, gerant: true, vendeur: true },
    { action: "Gérer le catalogue (Produits & Prix)", admin: true, gerant: true, vendeur: false },
    { action: "Module dépenses & financements", admin: true, gerant: true, vendeur: false },
    { action: "Réapprovisionnement Intelligent (Gemini IA)", admin: true, gerant: false, vendeur: false },
    { action: "Changer de plan de facturation SaaS", admin: true, gerant: false, vendeur: false },
    { action: "Supprimer des écritures d'audit comptable", admin: true, gerant: false, vendeur: false },
  ];

  return (
    <div className="space-y-6 animate-fade-in text-white">
      
      {/* Settings Sub-Tab Navigation Bar */}
      <div className="flex flex-wrap gap-1 bg-gray-900/80 p-1.5 rounded-xl border border-gray-850 backdrop-blur-md">
        <button
          onClick={() => setActiveSettingsTab('boutique')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg transition ${
            activeSettingsTab === 'boutique' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-850'
          }`}
        >
          <Building className="w-3.5 h-3.5" /> Identité & Devise Boutique
        </button>
        <button
          onClick={() => setActiveSettingsTab('saas')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg transition ${
            activeSettingsTab === 'saas' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-850'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" /> Forfaits & Abonnements SaaS
        </button>
        <button
          onClick={() => setActiveSettingsTab('team')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg transition ${
            activeSettingsTab === 'team' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-850'
          }`}
        >
          <Users className="w-3.5 h-3.5" /> Gestion des Utilisateurs d'Entreprise
        </button>
        {isSuperAdmin && (
          <button
            onClick={() => setActiveSettingsTab('tenants')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg transition ${
              activeSettingsTab === 'tenants' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-850'
            }`}
          >
            <Globe className="w-3.5 h-3.5" /> Multi-Boutiques (Isolation SaaS)
          </button>
        )}
        <button
          onClick={() => setActiveSettingsTab('backup')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg transition ${
            activeSettingsTab === 'backup' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-850'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" /> Sauvegardes & Restauration
        </button>
        <button
          onClick={() => setActiveSettingsTab('appearance')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg transition ${
            activeSettingsTab === 'appearance' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-850'
          }`}
        >
          <Palette className="w-3.5 h-3.5" /> Apparence
        </button>
      </div>

      <AnimatePresence mode="wait">
        
        {/* TAB 1: BOUTIQUE IDENTITY & LOCALIZATION SETTINGS */}
        {activeSettingsTab === 'boutique' && (
          <motion.div
            key="boutique"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div className="bg-gray-900 border border-gray-850 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-5 border-b border-gray-800 bg-gray-950/25 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-blue-600/15 border border-blue-500/25 rounded-xl flex items-center justify-center text-blue-400">
                    <Building className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                      Configuration de la Boutique : <span className="text-blue-400 font-sans">{activeTenant?.name}</span>
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">Personnalisez l'identité de l'établissement, l'adresse de facturation, la taxe TVA et la devise active.</p>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold bg-purple-500/10 border border-purple-500/20 text-purple-400 px-2.5 py-1 rounded-lg uppercase self-start sm:self-auto">
                  Plan {activeTenant?.plan}
                </span>
              </div>

              <form onSubmit={handleSaveSettings} className="p-6 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Nom de la Boutique *</label>
                      <input
                        type="text"
                        required
                        value={shopName}
                        onChange={(e) => setShopName(e.target.value)}
                        className="w-full bg-gray-950 border border-gray-850 focus:border-blue-500/50 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition font-medium"
                        placeholder="Ex: Pharmacie du Centre, Supermarché Nexa"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Slogan ou Description d'Activité</label>
                      <input
                        type="text"
                        value={shopDescription}
                        onChange={(e) => setShopDescription(e.target.value)}
                        className="w-full bg-gray-950 border border-gray-850 focus:border-blue-500/50 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition font-medium"
                        placeholder="Ex: Commerce général de gros et détail"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Adresse Physique</label>
                        <input
                          type="text"
                          value={shopAddress}
                          onChange={(e) => setShopAddress(e.target.value)}
                          className="w-full bg-gray-950 border border-gray-850 focus:border-blue-500/50 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition font-medium"
                          placeholder="Ex: 45 Rue de la Liberté, Dakar"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Téléphone Professionnel</label>
                        <input
                          type="text"
                          value={shopPhone}
                          onChange={(e) => setShopPhone(e.target.value)}
                          className="w-full bg-gray-950 border border-gray-850 focus:border-blue-500/50 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition font-medium font-mono"
                          placeholder="Ex: +221 33 800 00 00"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider flex justify-between">
                          <span>Devise Active</span>
                        </label>
                        <select
                          value={shopCurrency}
                          onChange={(e) => setShopCurrency(e.target.value)}
                          className="w-full bg-gray-950 border border-gray-850 focus:border-blue-500/50 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition font-medium"
                        >
                          <option value="EUR">EUR (€ - Euro)</option>
                          <option value="USD">USD ($ - Dollar US)</option>
                          <option value="XOF">XOF (CFA - Ouest-Africain)</option>
                          <option value="XAF">XAF (FCFA - Centre-Africain)</option>
                          <option value="MAD">MAD (DH - Dirham Marocain)</option>
                          <option value="CAD">CAD ($ - Dollar Canadien)</option>
                          <option value="GBP">GBP (£ - Livre de Sterling)</option>
                          <option value="CHF">CHF (CHF - Franc Suisse)</option>
                          <option value="GNF">GNF (FG - Franc Guinéen)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider flex justify-between">
                          <span>Taxe TVA (%) *</span>
                        </label>
                        <input
                          type="number"
                          required
                          min="0"
                          max="100"
                          step="any"
                          value={shopTaxRate}
                          onChange={(e) => setShopTaxRate(e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-full bg-gray-950 border border-gray-855 focus:border-blue-500/50 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition font-mono font-bold"
                          placeholder="Ex: 20, 18, 5"
                        />
                      </div>
                    </div>

                    <div className="bg-gray-950 border border-gray-855 p-3.5 rounded-xl space-y-2">
                      <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-wider text-gray-500 font-mono">
                        <span>Aperçu de la Facturation de {shopName || 'Boutique'}</span>
                        <span className="flex items-center gap-1 text-emerald-400 font-bold"><Coins className="w-3 h-3" /> Dynamique</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-gray-900 border border-gray-850 p-2 rounded-lg text-center">
                          <p className="text-[9px] text-gray-500 uppercase font-mono">Taux de TVA</p>
                          <p className="text-[11px] font-bold text-cyan-400 font-mono mt-0.5 truncate">{shopTaxRate} %</p>
                        </div>
                        <div className="bg-gray-900 border border-gray-850 p-2 rounded-lg text-center">
                          <p className="text-[9px] text-gray-500 uppercase font-mono">Prix Unitaire</p>
                          <p className="text-[11px] font-bold text-emerald-400 font-mono mt-0.5 truncate">{formatSample(8.99, shopCurrency)}</p>
                        </div>
                        <div className="bg-gray-900 border border-gray-850 p-2 rounded-lg text-center">
                          <p className="text-[9px] text-gray-500 uppercase font-mono">Dépense / Dette</p>
                          <p className="text-[11px] font-bold text-red-400 font-mono mt-0.5 truncate">{formatSample(-45.00, shopCurrency)}</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider font-sans">Logo de la Boutique</label>
                      <div className="flex flex-col sm:flex-row gap-4 items-center">
                        <div className="relative group">
                          <img
                            src={shopLogo || "https://images.unsplash.com/photo-1549421263-524f8dcef8d3?w=100&auto=format&fit=crop&q=60"}
                            alt="Logo boutique"
                            className="w-16 h-16 rounded-2xl object-cover border border-gray-800 bg-gray-950 shadow-md transition group-hover:border-blue-500"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1549421263-524f8dcef8d3?w=100&auto=format&fit=crop&q=60";
                            }}
                          />
                          {shopLogo && (
                            <button
                              type="button"
                              onClick={() => setShopLogo('')}
                              className="absolute -top-1.5 -right-1.5 bg-red-600 hover:bg-red-500 text-white rounded-full p-1 shadow-md transition"
                              title="Supprimer le logo"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        
                        <div className="flex-1 w-full">
                          <label
                            htmlFor="logo-upload-input"
                            className="flex flex-col items-center justify-center border-2 border-dashed border-gray-800 hover:border-blue-500/50 bg-gray-950/50 hover:bg-gray-950 rounded-2xl p-4 cursor-pointer transition text-center"
                          >
                            <Upload className="w-5 h-5 text-gray-500 mb-1" />
                            <span className="text-xs text-gray-300 font-semibold">Cliquer pour uploader le logo</span>
                            <span className="text-[10px] text-gray-500 mt-0.5">Format PNG, JPG ou SVG (Max. 2 Mo)</span>
                          </label>
                          <input
                            type="file"
                            accept="image/*"
                            id="logo-upload-input"
                            className="hidden"
                            onChange={handleLogoUpload}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between pt-4 border-t border-gray-850 gap-3">
                  <div className="flex items-center gap-2">
                    <AnimatePresence>
                      {isSaved && (
                        <motion.div
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -10 }}
                          className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 bg-emerald-500/5 border border-emerald-500/10 px-3.5 py-1.5 rounded-xl"
                        >
                          <Check className="w-4 h-4 text-emerald-400" /> Configuration enregistrée avec succès !
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <button
                    type="submit"
                    disabled={saveLoading}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold text-xs px-6 py-3 rounded-xl shadow-lg shadow-blue-500/15 hover:shadow-blue-500/25 transition disabled:opacity-50"
                  >
                    {saveLoading ? (
                      <>
                        <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin"></div>
                        <span>Enregistrement...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>Enregistrer la Boutique</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
        
        {/* TAB 2: SAAS PLANS SUBSCRIPTIONS & OFFLINE PAYMENTS */}
        {activeSettingsTab === 'saas' && (
          <motion.div
            key="saas"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* 1. Subscription Header Summary Card */}
            {tenantPlanStatus && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                {/* Background lighting ornament */}
                <div className={`absolute top-0 right-0 w-48 h-48 rounded-full blur-3xl opacity-10 -mr-12 -mt-12 bg-${tenantPlanStatus.planColor === 'purple' ? 'purple-500' : 'blue-500'}`} />

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                  <div className="space-y-2">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-500">Statut de l'Abonnement Actuel</span>
                    
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-xl font-black text-white flex items-center gap-2">
                        Plan {tenantPlanStatus.planName}
                      </h2>
                      
                      {/* Status badge representing user requirements */}
                      <span className={`px-2.5 py-1 text-[10px] font-bold font-mono rounded-lg border uppercase tracking-wide flex items-center gap-1 ${
                        tenantPlanStatus.status === 'ACTIVE'
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                          : tenantPlanStatus.status === 'TRIAL'
                          ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                          : tenantPlanStatus.status === 'PENDING'
                          ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                          : tenantPlanStatus.status === 'EXPIRED'
                          ? 'bg-red-500/10 border-red-500/20 text-red-400'
                          : 'bg-gray-800 border-gray-700 text-gray-400'
                      }`}>
                        {tenantPlanStatus.status === 'TRIAL' && <Clock className="w-3 h-3 animate-pulse" />}
                        {tenantPlanStatus.status === 'ACTIVE' && <Check className="w-3 h-3" />}
                        {tenantPlanStatus.status === 'PENDING' && <RefreshCw className="w-3 h-3 animate-spin" />}
                        {tenantPlanStatus.status === 'EXPIRED' && <AlertCircle className="w-3 h-3 animate-bounce" />}
                        {tenantPlanStatus.status === 'TRIAL' ? 'Essai Gratuit' : tenantPlanStatus.status}
                      </span>
                    </div>

                    <p className="text-xs text-gray-400 flex items-center gap-1.5 font-medium">
                      <Clock className="w-3.5 h-3.5 text-gray-500" />
                      {remainingDays.text}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        const standardPlan = pricingPlans.find(p => p.id === 'plan-standard') || pricingPlans[1];
                        setPaymentTargetPlan(standardPlan);
                        setPayAmount(standardPlan.price);
                        setIsPaymentFormOpen(true);
                      }}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-blue-500/10"
                    >
                      <CreditCard className="w-4 h-4" />
                      Renouveler / S'abonner
                    </button>
                    <button
                      onClick={() => {
                        const premiumPlan = pricingPlans.find(p => p.id === 'plan-premium') || pricingPlans[2];
                        setPaymentTargetPlan(premiumPlan);
                        setPayAmount(premiumPlan.price);
                        setIsPaymentFormOpen(true);
                      }}
                      className="bg-purple-600/10 border border-purple-500/30 hover:bg-purple-600/20 text-purple-400 font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Changer de Forfait
                    </button>
                  </div>
                </div>

                {/* Trial Countdown or Status alerts */}
                {activeTenant?.subscriptionStatus === 'TRIAL' && (
                  <div className="mt-5 p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/10 flex items-center gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <p className="text-xs text-amber-300 font-medium leading-relaxed">
                      Compte en période d'essai gratuit. Il vous reste <strong className="text-white font-mono font-bold bg-amber-500/20 px-1.5 py-0.5 rounded">{remainingDays.days} jours</strong> pour explorer l'ensemble de l'écosystème commercial avant suspension des accès d'écriture.
                    </p>
                  </div>
                )}

                {activeTenant?.subscriptionStatus === 'EXPIRED' && (
                  <div className="mt-5 p-3.5 rounded-xl bg-red-500/5 border border-red-500/15 flex items-center gap-2.5">
                    <ShieldAlert className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <p className="text-xs text-red-300 font-medium leading-relaxed animate-pulse">
                      <strong>Votre abonnement a expiré !</strong> L'accès d'écriture au POS, catalogue d'articles et clients est bloqué (mode Lecture Seule). Veuillez déclarer un paiement ci-dessous pour lever la suspension de votre service.
                    </p>
                  </div>
                )}
                
                {activeTenant?.subscriptionStatus === 'PENDING' && (
                  <div className="mt-5 p-3.5 rounded-xl bg-blue-500/5 border border-blue-500/15 flex items-center gap-2.5">
                    <RefreshCw className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
                    <p className="text-xs text-blue-300 font-medium leading-relaxed">
                      <strong>Déclaration de paiement reçue !</strong> Votre dossier de transaction est en cours de vérification manuelle par notre équipe d'administration. Vos accès Premium restent actifs durant l'audit.
                    </p>
                  </div>
                )}

                {/* 2. Usage Meters Block */}
                <div className="mt-6 pt-6 border-t border-gray-850 space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 font-mono">Consommation des ressources du forfait</h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Products meter */}
                    <div className="bg-gray-950 p-3.5 rounded-xl border border-gray-855 space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400 font-semibold">Fiche Articles</span>
                        <span className="font-mono text-gray-300 font-bold">
                          {tenantPlanStatus.products.current} / {tenantPlanStatus.products.max === 99999 ? '∞' : tenantPlanStatus.products.max}
                        </span>
                      </div>
                      <div className="w-full bg-gray-900 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-500 rounded-full ${tenantPlanStatus.products.isLimitReached ? 'bg-red-500' : 'bg-blue-500'}`}
                          style={{ width: `${Math.min(100, (tenantPlanStatus.products.current / (tenantPlanStatus.products.max || 1)) * 100)}%` }}
                        />
                      </div>
                      {tenantPlanStatus.products.isLimitReached && (
                        <p className="text-[10px] text-red-400 font-bold uppercase tracking-wide">Limite atteinte !</p>
                      )}
                    </div>

                    {/* Sales POS meter */}
                    <div className="bg-gray-950 p-3.5 rounded-xl border border-gray-855 space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400 font-semibold">Ventes & Encaissements</span>
                        <span className="font-mono text-gray-300 font-bold">
                          {tenantPlanStatus.sales.current} / {tenantPlanStatus.sales.max === 99999 ? '∞' : tenantPlanStatus.sales.max}
                        </span>
                      </div>
                      <div className="w-full bg-gray-900 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-500 rounded-full ${tenantPlanStatus.sales.isLimitReached ? 'bg-red-500' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min(100, (tenantPlanStatus.sales.current / (tenantPlanStatus.sales.max || 1)) * 100)}%` }}
                        />
                      </div>
                      {tenantPlanStatus.sales.isLimitReached && (
                        <p className="text-[10px] text-red-400 font-bold uppercase tracking-wide">Limite atteinte !</p>
                      )}
                    </div>

                    {/* Users count meter */}
                    <div className="bg-gray-950 p-3.5 rounded-xl border border-gray-855 space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400 font-semibold">Collaborateurs</span>
                        <span className="font-mono text-gray-300 font-bold">
                          {tenantPlanStatus.users.current} / {tenantPlanStatus.users.max}
                        </span>
                      </div>
                      <div className="w-full bg-gray-900 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-500 rounded-full ${tenantPlanStatus.users.isLimitReached ? 'bg-red-500' : 'bg-purple-500'}`}
                          style={{ width: `${Math.min(100, (tenantPlanStatus.users.current / (tenantPlanStatus.users.max || 1)) * 100)}%` }}
                        />
                      </div>
                      {tenantPlanStatus.users.isLimitReached && (
                        <p className="text-[10px] text-red-400 font-bold uppercase tracking-wide">Limite atteinte !</p>
                      )}
                    </div>

                    {/* Warehouses/Boutiques count */}
                    <div className="bg-gray-950 p-3.5 rounded-xl border border-gray-855 space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400 font-semibold">Boutiques / Dépôts</span>
                        <span className="font-mono text-gray-300 font-bold">
                          {tenantPlanStatus.warehouses.current} / {tenantPlanStatus.warehouses.max}
                        </span>
                      </div>
                      <div className="w-full bg-gray-900 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-500 rounded-full ${tenantPlanStatus.warehouses.isLimitReached ? 'bg-red-500' : 'bg-cyan-500'}`}
                          style={{ width: `${Math.min(100, (tenantPlanStatus.warehouses.current / (tenantPlanStatus.warehouses.max || 1)) * 100)}%` }}
                        />
                      </div>
                      {tenantPlanStatus.warehouses.isLimitReached && (
                        <p className="text-[10px] text-red-400 font-bold uppercase tracking-wide">Limite atteinte !</p>
                      )}
                    </div>

                  </div>
                </div>
              </div>
            )}

            {/* Offline Cloud Synchronization Status Indicator */}
            <div className="bg-gradient-to-r from-blue-950/20 via-slate-900 to-gray-900 border border-blue-500/10 p-5 rounded-2xl flex flex-col sm:flex-row justify-between sm:items-center gap-4">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-1.5 font-sans">
                  <RefreshCw className={`w-4 h-4 text-brand-blue ${isSyncing ? 'animate-spin' : ''}`} />
                  Synchronisation Résiliente Hors Connexion
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  Notre architecture d'abonnement est conçue pour continuer à fonctionner même lors des pannes de connexion. Synchronisez vos données à tout moment.
                </p>
              </div>

              <button
                onClick={handleSyncFromServer}
                disabled={isSyncing}
                className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 transition text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-blue-500/15 disabled:opacity-50"
              >
                {isSyncing ? 'Synchronisation Cloud...' : 'Forcer Synchronisation Cloud'}
              </button>
            </div>

            {/* Sub-Tab Content split: Plans list vs Submited requests */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Left Column: Offline Payment Submit Form */}
              <div className="lg:col-span-7 space-y-6">
                
                {/* 1. PLANS GRID SELECTOR FOR OFFLINE SUBSCRIBING */}
                <div className="bg-gray-900 border border-gray-850 p-5 rounded-2xl space-y-4 shadow-xl">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-gray-300 font-mono">Grille des Forfaits Disponibles</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {pricingPlans.map(p => {
                      const isCurrent = activeTenant?.plan === p.name;
                      const isTarget = paymentTargetPlan?.id === p.id;
                      return (
                        <div 
                          key={p.id}
                          className={`p-4 rounded-xl border flex flex-col justify-between transition cursor-pointer ${
                            isCurrent 
                              ? 'bg-blue-500/5 border-blue-500/40 text-white ring-1 ring-blue-500/20' 
                              : isTarget
                              ? 'bg-purple-500/5 border-purple-500/50 text-white'
                              : 'bg-gray-950 border-gray-850 hover:border-gray-800'
                          }`}
                          onClick={() => {
                            setPaymentTargetPlan(p);
                            setPayAmount(p.price);
                          }}
                        >
                          <div>
                            <p className="text-xs font-black uppercase font-mono text-gray-400">{p.name}</p>
                            <p className="text-base font-black font-mono text-white mt-1">{p.price} {p.currency || db.saasCurrency || 'EUR'} / mois</p>
                            <p className="text-[10px] text-gray-500 leading-normal mt-1">{p.description}</p>
                          </div>

                          <div className="mt-4 pt-2 border-t border-gray-900 flex justify-between items-center">
                            {isCurrent ? (
                              <span className="text-[9px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded font-mono font-bold uppercase">Actif</span>
                            ) : (
                              <span className="text-[9px] text-gray-500 font-mono">Sélectionner</span>
                            )}
                            <ArrowRight className="w-3.5 h-3.5 text-gray-500" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. SUBMIT OFFLINE FORM */}
                {paymentTargetPlan && (
                  <div className="bg-gray-900 border border-gray-850 rounded-2xl overflow-hidden shadow-xl">
                    <div className="p-4 border-b border-gray-800 bg-gray-950/30 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4.5 h-4.5 text-purple-400" />
                        <div>
                          <h4 className="text-xs font-bold uppercase text-white font-mono">Déclarer un paiement hors plateforme</h4>
                          <p className="text-[10px] text-gray-400">Pour le plan <strong className="text-purple-400">{paymentTargetPlan.name}</strong> ({paymentTargetPlan.price} {paymentTargetPlan.currency}/mois)</p>
                        </div>
                      </div>
                    </div>

                    <form onSubmit={handleSubmitPaymentRequest} className="p-5 space-y-4">
                      {/* Payment Instructions provided by administrator */}
                      <div className="bg-gray-950 border border-purple-500/10 p-4 rounded-xl space-y-2 text-xs">
                        <p className="font-bold text-purple-400 uppercase tracking-wide font-mono text-[9px]">Instructions administratives :</p>
                        <p className="text-gray-300 leading-relaxed text-[11px] font-medium">{globalSaaSSettings.paymentInstructions}</p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 text-[10px] text-gray-400 divide-y md:divide-y-0 md:divide-x divide-gray-800">
                          {globalSaaSSettings.orangeMoneyNumber && (
                            <div className="pt-2 md:pt-0 md:pl-2">
                              <span className="font-bold text-orange-400 font-mono">🍊 Orange Money :</span>
                              <p className="text-white font-mono mt-0.5">{globalSaaSSettings.orangeMoneyNumber}</p>
                              <p className="text-[9px] text-gray-500">{globalSaaSSettings.orangeMoneyName}</p>
                            </div>
                          )}
                          {globalSaaSSettings.mobileMoneyNumber && (
                            <div className="pt-2 md:pt-0 md:pl-3">
                              <span className="font-bold text-yellow-500 font-mono">💛 MTN / Mobile Money :</span>
                              <p className="text-white font-mono mt-0.5">{globalSaaSSettings.mobileMoneyNumber}</p>
                              <p className="text-[9px] text-gray-500">{globalSaaSSettings.mobileMoneyName}</p>
                            </div>
                          )}
                          {globalSaaSSettings.bankDetails && (
                            <div className="pt-2 md:pt-0 md:pl-3">
                              <span className="font-bold text-blue-400 font-mono">🏦 Virement Bancaire :</span>
                              <p className="text-[9px] text-white whitespace-pre-line leading-snug mt-0.5">{globalSaaSSettings.bankDetails}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Moyen de paiement utilisé *</label>
                          <select
                            value={payMethod}
                            onChange={(e) => setPayMethod(e.target.value)}
                            className="w-full bg-gray-950 border border-gray-855 text-xs rounded-xl px-3.5 py-2.5 text-white"
                          >
                            <option value="Orange Money">Orange Money</option>
                            <option value="MTN Mobile Money">MTN Mobile Money</option>
                            <option value="Wave">Wave</option>
                            <option value="Virement bancaire">Virement bancaire</option>
                            <option value="Espèces (Remise physique)">Espèces</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Montant payé ({paymentTargetPlan.currency}) *</label>
                          <input
                            type="number"
                            required
                            min="1"
                            value={payAmount}
                            onChange={(e) => setPayAmount(Number(e.target.value))}
                            className="w-full bg-gray-950 border border-gray-850 text-xs rounded-xl px-3.5 py-2.5 text-white font-mono font-bold"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Référence de Transaction *</label>
                          <input
                            type="text"
                            required
                            value={payReference}
                            onChange={(e) => setPayReference(e.target.value)}
                            className="w-full bg-gray-950 border border-gray-850 text-xs rounded-xl px-3.5 py-2.5 text-white font-mono"
                            placeholder="ex: VIR-73849182390"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Numéro d'expédition / de transaction *</label>
                          <input
                            type="text"
                            required
                            value={payNumTransaction}
                            onChange={(e) => setPayNumTransaction(e.target.value)}
                            className="w-full bg-gray-950 border border-gray-850 text-xs rounded-xl px-3.5 py-2.5 text-white font-mono"
                            placeholder="ex: +224 622 11 22 33"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Commentaire additionnel</label>
                        <textarea
                          value={payComment}
                          onChange={(e) => setPayComment(e.target.value)}
                          rows={2}
                          className="w-full bg-gray-950 border border-gray-850 text-xs rounded-xl px-3.5 py-2.5 text-white font-medium"
                          placeholder="Note de précision, nom du déposant, date exacte..."
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono flex justify-between">
                          <span>Reçu ou Capture d'écran (Simulé / URL optionnel)</span>
                          <span className="text-gray-600 tracking-normal text-[9px] uppercase font-bold">Mock d'importation</span>
                        </label>
                        <input
                          type="text"
                          value={payReceiptSim}
                          onChange={(e) => setPayReceiptSim(e.target.value)}
                          className="w-full bg-gray-950 border border-gray-855 text-[10px] rounded-xl px-3 py-2.5 text-white font-mono"
                          placeholder="ex: https://images.unsplash.com/photo-1554415707-6e8cfc93fe23..."
                        />
                      </div>

                      <div className="flex justify-between items-center pt-3 border-t border-gray-850">
                        {paymentSuccess ? (
                          <span className="text-xs text-emerald-400 font-bold bg-emerald-500/5 px-3 py-2 rounded-xl border border-emerald-500/10">
                            ✓ Reçu soumis avec succès ! Dossier EN ATTENTE DE VALIDATION.
                          </span>
                        ) : (
                          <div className="flex-1 text-[10px] text-gray-500 font-mono leading-snug mr-4">
                            L'activation du forfait est soumise à la confirmation des fonds par notre pôle comptabilité.
                          </div>
                        )}
                        <button
                          type="submit"
                          disabled={paymentSuccess}
                          className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-5 py-3 rounded-xl shadow-lg transition disabled:opacity-50"
                        >
                          Déclarer le Paiement
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>

              {/* Right Column: Submitted receipts history & Payment Provider Future Architecture */}
              <div className="lg:col-span-5 space-y-6">
                
                {/* 1. RECEIPTS HISTORY */}
                <div className="bg-gray-900 border border-gray-855 p-5 rounded-2xl space-y-4 shadow-xl">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-gray-300 font-mono">Historique de vos Reçus & Factures</h3>
                  
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                    {tenantPayments.length === 0 ? (
                      <p className="text-xs text-gray-500 italic text-center py-6">Aucune déclaration de paiement soumise pour cette boutique.</p>
                    ) : (
                      tenantPayments.map(p => (
                        <div key={p.id} className="p-3.5 rounded-xl bg-gray-950 border border-gray-855 space-y-2.5">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-xs font-black text-gray-200">Plan {p.planName}</p>
                              <p className="text-[10px] text-gray-500 font-mono mt-0.5">{new Date(p.createdAt).toLocaleDateString('fr-FR')} - {p.paymentMethod}</p>
                            </div>

                            <span className={`px-2 py-0.5 text-[9px] font-black font-mono rounded uppercase border tracking-wide ${
                              p.status === 'APPROVED'
                                ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-400'
                                : p.status === 'PENDING'
                                ? 'bg-blue-500/5 border-blue-500/10 text-blue-400'
                                : 'bg-red-500/5 border-red-500/10 text-red-400'
                            }`}>
                              {p.status === 'APPROVED' ? 'Validé' : p.status === 'PENDING' ? 'En Attente' : 'Rejeté'}
                            </span>
                          </div>

                          <div className="flex justify-between text-[11px] font-mono border-t border-gray-900 pt-2 font-bold">
                            <span className="text-gray-500">Ref: {p.reference}</span>
                            <span className="text-white">{p.amount} EUR</span>
                          </div>

                          {p.adminComment && (
                            <div className="bg-gray-900 p-2 rounded-lg border border-gray-800 text-[10px] text-gray-400 leading-normal">
                              <strong className="text-gray-300 font-bold">Retour administration :</strong> {p.adminComment}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 2. FUTURE PAYMENT ARCHITECTURE BLUEPRINT (PROVIDER INTERFACE) */}
                <div className="bg-gray-900 border border-gray-855 p-5 rounded-2xl space-y-4 shadow-xl">
                  <div className="flex justify-between items-start">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-gray-300 font-mono">Architecture de Paiement (Évolution)</h3>
                    <span className="text-[9px] font-mono font-bold bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded uppercase">V3.0 Specs</span>
                  </div>
                  
                  <p className="text-xs text-gray-400 leading-relaxed font-sans">
                    Le module implémente une couche d'abstraction (interface <code>PaymentProvider</code>). Ceci permettra un branchement direct et instantané de Stripe, PayPal ou d'APIs locales (Orange Money, Wave, CinetPay) sans modifier le code métier.
                  </p>

                  <div className="space-y-2 border-t border-gray-850 pt-3">
                    <p className="text-[10px] font-mono font-bold text-gray-500 uppercase">Fournisseurs Pré-Branchés (Maquettes d'Intégration) :</p>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      {futurePaymentProviders.map(p => (
                        <div key={p.id} className="bg-gray-950 p-2 rounded-lg border border-gray-855 flex items-center justify-between font-mono">
                          <span className="text-gray-200 font-bold">{p.logo} {p.name}</span>
                          <span className="text-cyan-400 font-bold uppercase text-[8px]">Prêt</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

              </div>

            </div>

          </motion.div>
        )}
        
        {/* TAB 3: ENTERPRISE TEAM & USER MANAGEMENT (CLIENT SIDE CRITICAL SPEC) */}
        {activeSettingsTab === 'team' && (
          <motion.div
            key="team"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* 1. ACTIVE USERS TABLE & CRUD FOR CURRENT TENANT */}
            <div className="bg-gray-900 border border-gray-850 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-5 border-b border-gray-800 bg-gray-950/25 flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Collaborateurs de l'entreprise</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Ajoutez et gérez les comptes d'accès pour les gérants et vendeurs de votre boutique.</p>
                </div>
                {tenantPlanStatus && (
                  <span className="text-[10px] font-mono font-bold bg-blue-500/10 border border-blue-500/20 text-blue-400 px-3 py-1 rounded-lg uppercase">
                    Utilisateurs : {tenantPlanStatus.users.current} / {tenantPlanStatus.users.max}
                  </span>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-950 text-gray-400 font-mono text-[9px] uppercase border-b border-gray-800">
                    <tr>
                      <th className="p-3.5">Avatar / Nom</th>
                      <th className="p-3.5">Email</th>
                      <th className="p-3.5">Rôle Système</th>
                      <th className="p-3.5">Statut de Connexion</th>
                      <th className="p-3.5 text-right">Actions de Contrôle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-850 font-medium text-gray-300">
                    {tenantUsers.map(u => (
                      <tr key={u.id} className="hover:bg-gray-950/10 transition">
                        <td className="p-3.5 flex items-center gap-2.5">
                          {u.avatar ? (
                            <img src={u.avatar} alt={u.name} className="w-7 h-7 rounded-full object-cover border border-gray-800" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-500/20 text-blue-400 flex items-center justify-center font-bold font-mono uppercase text-xs">
                              {u.name[0]}
                            </div>
                          )}
                          <span className="text-white font-bold">{u.name}</span>
                        </td>
                        <td className="p-3.5 font-mono text-[11px] text-gray-400">{u.email}</td>
                        <td className="p-3.5">
                          <span className="text-[9px] font-mono bg-gray-950 border border-gray-800 px-2 py-0.5 rounded uppercase font-bold text-gray-400">
                            {u.role}
                          </span>
                        </td>
                        <td className="p-3.5">
                          {u.firstLoginReset ? (
                            <span className="text-[9px] font-bold font-mono text-amber-400 bg-amber-500/5 border border-amber-500/10 px-2 py-0.5 rounded uppercase flex items-center gap-1 w-max">
                              <Key className="w-2.5 h-2.5 animate-pulse" /> Réinitialisation requise
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold font-mono text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 px-2 py-0.5 rounded uppercase flex items-center gap-1 w-max">
                              <Check className="w-2.5 h-2.5" /> Compte Validé
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-right space-x-1.5">
                          {u.firstLoginReset && (
                            <button
                              onClick={() => handleOpenPasswordModal(u.id)}
                              className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 border border-amber-500/20 transition text-[10px] px-2 py-1 rounded font-bold"
                              title="Déclencher la modification du MDP à la première connexion"
                            >
                              Changer Mot de passe
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteTeamUser(u.id, u.name)}
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/15 p-1.5 rounded transition inline-flex items-center"
                            title="Révoquer l'accès"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Form to create a brand new team user */}
              <div className="lg:col-span-7 bg-gray-900 border border-gray-850 rounded-2xl p-5 shadow-xl space-y-4">
                <div className="flex items-center gap-2">
                  <Plus className="w-4.5 h-4.5 text-blue-400" />
                  <h4 className="text-xs font-bold uppercase text-white font-mono">Ajouter un collaborateur d'équipe</h4>
                </div>

                <form onSubmit={handleCreateUser} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Nom complet *</label>
                      <input
                        type="text"
                        required
                        value={newUserName}
                        onChange={(e) => setNewUserName(e.target.value)}
                        className="w-full bg-gray-950 border border-gray-850 text-xs rounded-xl px-3.5 py-2.5 text-white"
                        placeholder="ex: Mamadou Diallo"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Adresse email d'accès *</label>
                      <input
                        type="email"
                        required
                        value={newUserEmail}
                        onChange={(e) => setNewUserEmail(e.target.value)}
                        className="w-full bg-gray-950 border border-gray-850 text-xs rounded-xl px-3.5 py-2.5 text-white font-mono"
                        placeholder="ex: m.diallo@gstock.com"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Mot de passe provisoire *</label>
                      <input
                        type="password"
                        required
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                        className="w-full bg-gray-950 border border-gray-855 text-xs rounded-xl px-3.5 py-2.5 text-white font-mono"
                        placeholder="••••••••"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">Rôle / Habilitation *</label>
                      <select
                        value={newUserRole}
                        onChange={(e) => setNewUserRole(e.target.value as any)}
                        className="w-full bg-gray-950 border border-gray-850 text-xs rounded-xl px-3.5 py-2.5 text-white"
                      >
                        <option value="vendeur">Vendeur (POS Caisse Uniquement)</option>
                        <option value="gerant">Gérant de Boutique (POS + Catalogue)</option>
                        <option value="owner">Co-propriétaire (Tous droits d'écriture)</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-3 border-t border-gray-850">
                    <p className="text-[9px] text-gray-500 font-mono leading-relaxed max-w-sm">
                      * Le mot de passe devra être obligatoirement modifié par le gérant lors de sa toute première connexion afin de garantir la sécurité.
                    </p>
                    <button
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition"
                    >
                      Ajouter à l'Équipe
                    </button>
                  </div>
                </form>
              </div>

              {/* RBAC Rules Matrix */}
              <div className="lg:col-span-5 bg-gray-900 border border-gray-850 rounded-2xl p-5 shadow-xl space-y-4">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-gray-400" />
                  <h4 className="text-xs font-bold uppercase text-white font-mono">Habilitations des Rôles (RBAC)</h4>
                </div>
                
                <p className="text-[11px] text-gray-400 leading-normal">
                  Chaque rôle d'équipe correspond à un niveau d'accès strict. Pour tester un rôle différent, vous pouvez basculer d'avatar ci-dessous :
                </p>

                {/* Switcher avatar simulation */}
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {db.users.filter(u => u.tenantId === activeTenantId).map(u => {
                    const isActive = u.id === activeUserId;
                    return (
                      <button
                        key={u.id}
                        onClick={() => handleSwitchUser(u.id)}
                        className={`w-full flex items-center justify-between p-2 rounded-xl border text-left transition ${
                          isActive 
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-white' 
                            : 'bg-gray-950 border-gray-855 hover:border-gray-800 text-gray-400'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-gray-800 flex items-center justify-center font-bold text-[10px] text-white uppercase">
                            {u.name[0]}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-gray-200">{u.name}</p>
                            <p className="text-[9px] text-gray-500 uppercase">{u.role}</p>
                          </div>
                        </div>
                        {isActive && <span className="text-[8px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-mono font-bold uppercase">Connecté</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>

          </motion.div>
        )}
        
        {/* TAB: BACKUP AND RESTORE */}
        {activeSettingsTab === 'backup' && (
          <motion.div key="backup" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">

            {/* LOCAL BACKUP */}
            <div className="bg-gray-900 border border-gray-850 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-5 border-b border-gray-800 bg-gray-950/25 flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Sauvegarde locale</h3>
                  <p className="text-xs text-gray-400 mt-0.5">AES-256 Â· SHA-256 Â· stockÃ©e sur le serveur</p>
                </div>
                {!isBackupAdmin && <span className="text-[10px] font-mono font-bold bg-amber-500/10 border border-amber-500/20 text-amber-400 px-3 py-1 rounded-lg uppercase">AccÃ¨s restreint</span>}
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">LibellÃ©</label>
                    <input value={backupLabel} onChange={e => setBackupLabel(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-xs text-white" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 font-mono">StratÃ©gie</label>
                    <select value={backupStrategy} onChange={e => setBackupStrategy(e.target.value as any)} className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-xs text-white">
                      <option value="full">ComplÃ¨te</option>
                      <option value="incremental">IncrÃ©mentale</option>
                      <option value="differential">DiffÃ©rentielle</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button onClick={handleCreateBackup} disabled={backupLoading || !isBackupAdmin} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2">
                      <ShieldCheck className="w-3.5 h-3.5" />{backupLoading ? 'CrÃ©ation...' : 'Sauvegarder maintenant'}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {backupList.length === 0 ? (
                    <p className="text-xs text-gray-500 italic">Aucune sauvegarde locale.</p>
                  ) : backupList.map(item => (
                    <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between rounded-xl border border-gray-800 bg-gray-950 p-3 gap-2">
                      <div>
                        <p className="text-xs font-semibold text-white">{item.label}</p>
                        <p className="text-[10px] text-gray-500">{new Date(item.createdAt).toLocaleString('fr-FR')} Â· {item.strategy}</p>
                      </div>
                      <div className="text-[10px] text-gray-400 flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-gray-800">{item.encrypted ? 'ChiffrÃ©e' : 'Non chiffrÃ©e'}</span>
                        <span>{Math.round((item.size || 0) / 1024)} KB</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* GOOGLE DRIVE BACKUP */}
            <div className="bg-gray-900 border border-gray-850 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-5 border-b border-gray-800 bg-gray-950/25 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0a15.92 15.92 0 001.65 7.2z" fill="#0066da"/>
                    <path d="M43.65 25L29.9 1.2a15.92 15.92 0 00-3.3 3.3L1.65 45.5A15.92 15.92 0 000 52.7h27.5z" fill="#00ac47"/>
                    <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25a15.92 15.92 0 001.65-7.2H59.8l5.85 11.2z" fill="#ea4335"/>
                    <path d="M43.65 25L57.4 1.2C56.05.43 54.5 0 52.85 0H34.45c-1.65 0-3.2.43-4.55 1.2z" fill="#00832d"/>
                    <path d="M59.8 52.7H27.5L13.75 76.5c1.35.77 2.9 1.2 4.55 1.2h50.7c1.65 0 3.2-.43 4.55-1.2z" fill="#2684fc"/>
                    <path d="M73.4 26.5l-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.15 27.7h27.45a15.92 15.92 0 00-1.65-7.2z" fill="#ffba00"/>
                  </svg>
                  <h3 className="text-sm font-bold text-white">Sauvegarde Google Drive</h3>
                </div>
                {gdriveConnected && (
                  <span className="text-[10px] font-mono font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1 rounded-lg flex items-center gap-1">
                    <Check className="w-3 h-3" /> ConnectÃ©
                  </span>
                )}
              </div>
              <div className="p-5 space-y-5">

                {/* Tenant selector for superadmin */}
                {isSuperAdmin && (
                  <div className="bg-gray-950 border border-gray-800 rounded-xl p-3 flex items-center gap-3">
                    <Building className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <select
                      value={gdriveTenantId}
                      onChange={(e) => { setGdriveTenantId(e.target.value); setGdriveConnected(false); setGdriveEmail(null); setGdriveBackups([]); setGdriveSelectedBackup(null); setGdriveRestoreDone(false); }}
                      className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white"
                    >
                      <option value="__superadmin__">Super Admin (Drive global)</option>
                      {db.tenants.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Connection card */}
                <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    {gdriveConnected ? (
                      <>
                        <p className="text-xs font-bold text-white">Compte connectÃ©</p>
                        <p className="text-[11px] text-emerald-400 font-mono mt-0.5">{gdriveEmail}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">Ã‰tat : ConnectÃ© âœ“</p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs font-bold text-white">Non connectÃ©</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">Connectez votre compte Google pour activer la sauvegarde distante.</p>
                      </>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {!gdriveConnected ? (
                      <button onClick={handleGdriveConnect} disabled={!isBackupAdmin} className="flex items-center gap-2 bg-white hover:bg-gray-100 text-gray-800 text-xs font-bold px-4 py-2.5 rounded-xl transition disabled:opacity-50 shadow">
                        <svg className="w-4 h-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                        Connecter Google Drive
                      </button>
                    ) : (
                      <button onClick={handleGdriveDisconnect} className="flex items-center gap-1.5 text-xs text-red-400 border border-red-500/20 hover:bg-red-500/10 px-3 py-2 rounded-xl transition">
                        DÃ©connecter
                      </button>
                    )}
                  </div>
                </div>

                {gdriveConnected && (
                  <>
                    {/* Upload controls */}
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input value={backupLabel} onChange={e => setBackupLabel(e.target.value)} placeholder="LibellÃ© de la sauvegarde" className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-xs text-white" />
                      <select value={backupStrategy} onChange={e => setBackupStrategy(e.target.value as any)} className="bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-xs text-white">
                        <option value="full">ComplÃ¨te</option>
                        <option value="incremental">IncrÃ©mentale</option>
                        <option value="differential">DiffÃ©rentielle</option>
                      </select>
                      <button onClick={handleGdriveUpload} disabled={gdriveLoading || !isBackupAdmin} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition disabled:opacity-50 whitespace-nowrap">
                        <ShieldCheck className="w-3.5 h-3.5" />{gdriveLoading ? 'Envoi...' : 'Sauvegarder maintenant'}
                      </button>
                    </div>

                    {/* Restore section */}
                    <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-white">Restaurer depuis Google Drive</h4>
                        <button onClick={handleLoadGdriveBackups} disabled={gdriveLoading} className="text-[10px] text-blue-400 border border-blue-500/20 hover:bg-blue-500/10 px-3 py-1.5 rounded-lg transition flex items-center gap-1">
                          <RefreshCw className="w-3 h-3" /> Actualiser
                        </button>
                      </div>

                      {gdriveBackups.length === 0 ? (
                        <p className="text-xs text-gray-500 italic">Aucune sauvegarde trouvÃ©e. Cliquez sur Actualiser.</p>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-[10px] text-gray-500 uppercase font-mono border-b border-gray-800">
                              <th className="text-left pb-2 pr-4">Date</th>
                              <th className="text-left pb-2 pr-4">Taille</th>
                              <th className="text-left pb-2 pr-4">Version</th>
                              <th className="text-left pb-2">Type</th>
                              <th className="pb-2"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-800">
                            {gdriveBackups.map(b => (
                              <tr
                                key={b.id}
                                className="cursor-pointer transition"
                                onClick={() => { setGdriveSelectedBackup(b); setGdriveRestoring(false); setGdriveRestoreDone(false); setGdriveRestoreSteps([]); }}
                              >
                                <td className="py-2 pr-4 text-gray-300">{new Date(b.createdAt).toLocaleString('fr-FR')}</td>
                                <td className="py-2 pr-4 text-gray-400">{Math.round((b.driveSize || b.size || 0) / (1024 * 1024))} Mo</td>
                                <td className="py-2 pr-4 text-gray-400 font-mono">v{b.version || '1'}</td>
                                <td className="py-2"><span className="text-[9px] font-mono bg-gray-800 px-2 py-0.5 rounded uppercase text-gray-300">{b.strategy || 'full'}</span></td>
                                <td className="py-2 text-right">{gdriveSelectedBackup?.id === b.id && <Check className="w-3.5 h-3.5 text-blue-400 inline" />}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      {/* Selected backup confirm */}
                      {gdriveSelectedBackup && !gdriveRestoring && !gdriveRestoreDone && (
                        <div className="bg-gray-900 border border-blue-500/20 rounded-xl p-4 space-y-3">
                          <p className="text-xs font-bold text-blue-400">Sauvegarde sÃ©lectionnÃ©e</p>
                          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[11px]">
                            <div><span className="text-gray-500">Date :</span> <span className="text-white font-mono">{new Date(gdriveSelectedBackup.createdAt).toLocaleString('fr-FR')}</span></div>
                            <div><span className="text-gray-500">Version :</span> <span className="text-white font-mono">v{gdriveSelectedBackup.version || '1'}</span></div>
                            <div><span className="text-gray-500">Taille :</span> <span className="text-white font-mono">{Math.round((gdriveSelectedBackup.driveSize || gdriveSelectedBackup.size || 0) / (1024 * 1024))} Mo</span></div>
                            <div><span className="text-gray-500">Type :</span> <span className="text-white font-mono capitalize">{gdriveSelectedBackup.strategy || 'ComplÃ¨te'}</span></div>
                          </div>
                          <p className="text-[10px] text-amber-400 bg-amber-500/5 border border-amber-500/10 rounded-lg px-3 py-2">âš  Cette opÃ©ration remplacera la base de donnÃ©es actuelle.</p>
                          <p className="text-[11px] text-gray-300 font-medium">Voulez-vous restaurer cette sauvegarde ?</p>
                          <div className="flex gap-2">
                            <button onClick={() => setGdriveSelectedBackup(null)} className="flex-1 text-xs text-gray-400 border border-gray-700 hover:bg-gray-800 px-4 py-2.5 rounded-xl transition">Annuler</button>
                            <button onClick={handleGdriveRestore} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition">Restaurer</button>
                          </div>
                        </div>
                      )}

                      {/* Restore progress */}
                      {gdriveRestoring && !gdriveRestoreDone && (
                        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
                          <p className="text-xs font-bold text-white flex items-center gap-2">
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" /> Restauration en cours...
                          </p>
                          <div className="space-y-2 font-mono text-xs">
                            {['Produits', 'Clients', 'Ventes', 'Stock', 'Paiements'].map(step => (
                              <div key={step} className="flex items-center gap-3">
                                <span className="text-gray-400 w-24">{step}</span>
                                <span className="flex-1 text-gray-700 tracking-widest">Â·Â·Â·Â·Â·Â·Â·Â·Â·Â·</span>
                                {gdriveRestoreSteps.includes(step)
                                  ? <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                                  : <div className="w-3.5 h-3.5 rounded-full border border-gray-600 animate-pulse flex-shrink-0" />}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Restore done */}
                      {gdriveRestoreDone && (
                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-5 space-y-3 text-center">
                          <Check className="w-8 h-8 text-emerald-400 mx-auto" />
                          <p className="text-sm font-bold text-white">âœ“ Restauration terminÃ©e</p>
                          <p className="text-xs text-gray-400">Les donnÃ©es ont Ã©tÃ© restaurÃ©es avec succÃ¨s.</p>
                          <p className="text-xs text-gray-500">RedÃ©marrer l'application ?</p>
                          <button onClick={() => window.location.reload()} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-6 py-2.5 rounded-xl transition">
                            RedÃ©marrer
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* TAB 4: ISOLATION MULTI-BOUTIQUES */}
        {activeSettingsTab === 'tenants' && (
          <motion.div
            key="tenants"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <div className="bg-gray-900 border border-gray-800 p-5 rounded-2xl space-y-4 shadow-xl">
              <div className="flex items-center gap-2">
                <Building className="w-4 h-4 text-brand-blue" />
                <h3 className="text-sm font-semibold text-white">Console Multi-Tenant (Boutiques Simulées)</h3>
              </div>
              <p className="text-xs text-gray-400">
                Changer instantanément de tenant pour tester la modularité SaaS. Chaque boutique isole son catalogue, ses clients, ses finances, sa taxe TVA et sa devise active.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {db.tenants.map(ten => {
                  const isActive = ten.id === activeTenantId;
                  const prodCount = db.products.filter(p => p.tenantId === ten.id).length;
                  return (
                    <button
                      key={ten.id}
                      onClick={() => handleSwitchTenant(ten.id)}
                      className={`flex flex-col justify-between p-4 rounded-xl border text-left transition ${
                        isActive 
                          ? 'bg-brand-blue/10 border-brand-blue/40 text-white shadow-lg' 
                          : 'bg-gray-950 border-gray-850 hover:border-gray-800 text-gray-400'
                      }`}
                    >
                      <div className="flex items-start gap-3 mb-4">
                        <img src={ten.logo} alt={ten.name} className="w-9 h-9 rounded-lg object-cover border border-gray-800 bg-gray-950 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-gray-200">{ten.name}</p>
                          <p className="text-[10px] text-gray-500 line-clamp-2 mt-0.5">{ten.description}</p>
                        </div>
                      </div>

                      <div className="w-full flex items-center justify-between pt-3.5 border-t border-gray-850/80">
                        <span className="text-[9px] bg-gray-900 border border-gray-800 px-2 py-0.5 rounded text-gray-400 font-mono">
                          {prodCount} produits
                        </span>
                        <span className="text-[9px] bg-gray-900 border border-gray-800 px-2 py-0.5 rounded text-gray-400 font-mono font-bold">
                          {ten.currency} / {ten.taxRate !== undefined ? `${ten.taxRate}%` : '20%'}
                        </span>
                        <span className={`text-[10px] font-bold uppercase ${
                          ten.plan === 'Premium' ? 'text-purple-400' : ten.plan === 'Standard' ? 'text-brand-blue' : 'text-gray-500'
                        }`}>
                          {ten.plan}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {/* TAB: APPEARANCE */}
        {activeSettingsTab === 'appearance' && (
          <motion.div key="appearance" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <div className="bg-gray-900 border border-gray-850 rounded-2xl p-5 shadow-xl">
              <AppearanceSettings />
            </div>
          </motion.div>
        )}

      </AnimatePresence>

      <Modal
        isOpen={showResetPassword}
        onClose={() => { setShowResetPassword(false); setResetPasswordUserId(null); }}
        title="Réinitialiser le mot de passe"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            Saisir un nouveau mot de passe pour <strong className="text-white">{db.users.find(u => u.id === resetPasswordUserId)?.name}</strong>
          </p>
          <div>
            <label className="block text-xs text-gray-500 font-semibold mb-1.5">Nouveau mot de passe</label>
            <div className="relative">
              <input
                type={passwordVisible ? 'text' : 'password'}
                value={resetPasswordValue}
                onChange={e => setResetPasswordValue(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-brand-blue/60 transition pr-10"
                placeholder="Minimum 4 caractères"
              />
              <button
                type="button"
                onClick={() => setPasswordVisible(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                {passwordVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 font-semibold mb-1.5">Confirmer le mot de passe</label>
            <input
              type="password"
              value={resetPasswordConfirm}
              onChange={e => setResetPasswordConfirm(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-brand-blue/60 transition"
              placeholder="Retapez le mot de passe"
            />
            {resetPasswordConfirm && resetPasswordValue !== resetPasswordConfirm && (
              <p className="text-xs text-red-400 mt-1">Les mots de passe ne correspondent pas.</p>
            )}
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => { setShowResetPassword(false); setResetPasswordUserId(null); }}
              className="flex-1 px-4 py-2.5 bg-gray-800 hover:bg-gray-750 text-gray-300 text-xs font-semibold rounded-xl transition"
            >
              Annuler
            </button>
            <button
              onClick={handleConfirmPasswordReset}
              disabled={resetPasswordValue.length < 4 || resetPasswordValue !== resetPasswordConfirm}
              className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-xs font-bold rounded-xl transition"
            >
              Réinitialiser
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={deleteTeamUserData !== null}
        title="Révoquer l'accès"
        message={deleteTeamUserData ? `Êtes-vous sûr de vouloir révoquer l'accès de ${deleteTeamUserData.name} ?` : ''}
        confirmLabel="Révoquer"
        variant="warning"
        onConfirm={confirmDeleteTeamUser}
        onCancel={() => setDeleteTeamUserData(null)}
      />
    </div>
  );
}
