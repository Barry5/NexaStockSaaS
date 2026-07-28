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
import ShopSettings from './settings/ShopSettings';
import SaaSSaasPanel from './settings/SaaSSaasPanel';
import TeamSettings from './settings/TeamSettings';
import TenantSettings from './settings/TenantSettings';
import BackupSettings from './settings/BackupSettings';


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
  const [localRestoring, setLocalRestoring] = useState(false);
  const [localRestoreConfirm, setLocalRestoreConfirm] = useState<string | null>(null);
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
          manifestPath: data.backup.manifestPath,
        },
        ...prev,
      ]);
    } catch (err: any) {
      addNotification(err.message || 'Erreur de sauvegarde', 'error');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleLocalRestore = async (manifestPath: string) => {
    if (!isBackupAdmin || localRestoring) return;
    setLocalRestoring(true);
    const token = localStorage.getItem('nexastock_token');
    try {
      const res = await fetch('/api/admin/backups/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ manifestPath })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Échec de la restauration');
      addNotification('Restauration réussie ! Rechargez la page.', 'success');
      setLocalRestoreConfirm(null);
    } catch (err: any) {
      addNotification(err.message || 'Erreur de restauration', 'error');
    } finally {
      setLocalRestoring(false);
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
      <div className="flex flex-wrap gap-1 bg-gray-900/80 p-1.5 rounded-xl border border-gray-850 backdrop-blur-md tabs-scrollable">
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
            <ShopSettings
              activeTenant={activeTenant}
              shopName={shopName} setShopName={setShopName}
              shopDescription={shopDescription} setShopDescription={setShopDescription}
              shopCurrency={shopCurrency} setShopCurrency={setShopCurrency}
              shopTaxRate={shopTaxRate} setShopTaxRate={setShopTaxRate}
              shopAddress={shopAddress} setShopAddress={setShopAddress}
              shopPhone={shopPhone} setShopPhone={setShopPhone}
              shopLogo={shopLogo} setShopLogo={setShopLogo}
              isSaved={isSaved}
              saveLoading={saveLoading}
              handleSaveSettings={handleSaveSettings}
              handleLogoUpload={handleLogoUpload}
              formatSample={formatSample}
            />
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
            <SaaSSaasPanel
              tenantPlanStatus={tenantPlanStatus}
              remainingDays={remainingDays}
              activeTenant={activeTenant}
              pricingPlans={pricingPlans}
              paymentTargetPlan={paymentTargetPlan}
              setPaymentTargetPlan={setPaymentTargetPlan}
              payAmount={payAmount}
              setPayAmount={setPayAmount}
              setIsPaymentFormOpen={setIsPaymentFormOpen}
              handleSubmitPaymentRequest={handleSubmitPaymentRequest}
              globalSaaSSettings={globalSaaSSettings}
              payMethod={payMethod}
              setPayMethod={setPayMethod}
              payReference={payReference}
              setPayReference={setPayReference}
              payNumTransaction={payNumTransaction}
              setPayNumTransaction={setPayNumTransaction}
              payComment={payComment}
              setPayComment={setPayComment}
              payReceiptSim={payReceiptSim}
              setPayReceiptSim={setPayReceiptSim}
              paymentSuccess={paymentSuccess}
              tenantPayments={tenantPayments}
              isSyncing={isSyncing}
              handleSyncFromServer={handleSyncFromServer}
              db={db}
            />
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
            <TeamSettings
              tenantUsers={tenantUsers}
              tenantPlanStatus={tenantPlanStatus}
              handleCreateUser={handleCreateUser}
              handleDeleteTeamUser={handleDeleteTeamUser}
              handleOpenPasswordModal={handleOpenPasswordModal}
              newUserName={newUserName}
              setNewUserName={setNewUserName}
              newUserEmail={newUserEmail}
              setNewUserEmail={setNewUserEmail}
              newUserPassword={newUserPassword}
              setNewUserPassword={setNewUserPassword}
              newUserRole={newUserRole}
              setNewUserRole={setNewUserRole}
              activeUserId={activeUserId}
              handleSwitchUser={handleSwitchUser}
              db={db}
              activeTenantId={activeTenantId}
            />
          </motion.div>
        )}
        
        {/* TAB: BACKUP AND RESTORE */}
        {activeSettingsTab === 'backup' && (
          <motion.div key="backup" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
            <BackupSettings
              isBackupAdmin={isBackupAdmin}
              backupLoading={backupLoading}
              backupList={backupList}
              backupLabel={backupLabel}
              setBackupLabel={setBackupLabel}
              backupStrategy={backupStrategy}
              setBackupStrategy={setBackupStrategy}
              handleCreateBackup={handleCreateBackup}
              localRestoring={localRestoring}
              localRestoreConfirm={localRestoreConfirm}
              setLocalRestoreConfirm={setLocalRestoreConfirm}
              handleLocalRestore={handleLocalRestore}
              gdriveConnected={gdriveConnected}
              setGdriveConnected={setGdriveConnected}
              gdriveEmail={gdriveEmail}
              setGdriveEmail={setGdriveEmail}
              gdriveBackups={gdriveBackups}
              setGdriveBackups={setGdriveBackups}
              gdriveLoading={gdriveLoading}
              gdriveRestoring={gdriveRestoring}
              setGdriveRestoring={setGdriveRestoring}
              gdriveRestoreSteps={gdriveRestoreSteps}
              setGdriveRestoreSteps={setGdriveRestoreSteps}
              gdriveRestoreDone={gdriveRestoreDone}
              setGdriveRestoreDone={setGdriveRestoreDone}
              gdriveSelectedBackup={gdriveSelectedBackup}
              setGdriveSelectedBackup={setGdriveSelectedBackup}
              gdriveTenantId={gdriveTenantId}
              setGdriveTenantId={setGdriveTenantId}
              handleGdriveConnect={handleGdriveConnect}
              handleGdriveDisconnect={handleGdriveDisconnect}
              handleGdriveUpload={handleGdriveUpload}
              handleLoadGdriveBackups={handleLoadGdriveBackups}
              handleGdriveRestore={handleGdriveRestore}
              isSuperAdmin={isSuperAdmin}
              db={db}
            />
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
            <TenantSettings
              db={db}
              activeTenantId={activeTenantId}
              handleSwitchTenant={handleSwitchTenant}
            />
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
