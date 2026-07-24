/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Building, 
  Mail, 
  Lock, 
  UserPlus, 
  ArrowRight, 
  Sparkles, 
  ShieldCheck, 
  CheckCircle,
  HelpCircle,
  Smartphone,
  ChevronRight,
  Globe,
  Database,
  AlertTriangle
} from 'lucide-react';
import type { Tenant, User, SubscriptionPlan, UserRole } from '../types';
import { useDB, useApp } from '../context';
import { loginSchema, registerSchema } from '../lib/validation';
import type { z } from 'zod';

export default function SaaSAuth() {
  const { db, handleUpdateDb } = useDB();
  const { handleLoginSuccess, handleRegisterTenant } = useApp();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'firstLoginReset'>('login');
  const [selectedPresetUser, setSelectedPresetUser] = useState<string>('');

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>('Free');
  const [isSuccess, setIsSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [loginError, setLoginError] = useState('');

  // First Login Password Reset states
  const [resettingUser, setResettingUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetError, setResetError] = useState('');

  // Handle Preset Fast Login for dev/reviewers
  const handlePresetLogin = (userId: string) => {
    const user = db.users.find(u => u.id === userId);
    if (user) {
      if (user.firstLoginReset) {
        setResettingUser(user);
        setMode('firstLoginReset');
        onAddNotificationSimulated(`Première connexion détectée pour ${user.name}. Changement de mot de passe requis.`);
      } else {
        handleLoginSuccess(user.id, user.tenantId);
      }
    }
  };

  const onAddNotificationSimulated = (text: string) => {
    console.log("SaaS Notification:", text);
  };

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setFieldErrors({});

    const loginResult = loginSchema.safeParse({ email, password });
    if (!loginResult.success) {
      const errs: Record<string, string> = {};
      for (const issue of loginResult.error.issues) {
        const path = issue.path.join('.');
        if (!errs[path]) errs[path] = issue.message;
      }
      setFieldErrors(errs);
      return;
    }

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          localStorage.setItem('nexastock_token', data.token);
        }

        // Fetch fresh db state from server sync to make sure client has correct seed database
        const syncRes = await fetch('/api/sync');
        let nextDb = db;
        if (syncRes.ok) {
          nextDb = await syncRes.json();
          localStorage.setItem('nexastock_local_cache', JSON.stringify(nextDb));
        }

        if (data.user.firstLoginReset) {
          const matchedUser = nextDb.users.find((u: any) => u.id === data.user.id) || data.user;
          setResettingUser(matchedUser);
          setMode('firstLoginReset');
        } else {
          handleLoginSuccess(data.user.id, data.user.tenantId, nextDb);
        }
      } else {
        const errorData = await response.json();
        setLoginError(errorData.error || 'Identifiants incorrects.');
      }
    } catch (err) {
      console.error('Erreur lors de la tentative de connexion:', err);
      // Offline fallback: check local state
      const foundUser = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
      if (foundUser) {
        if (foundUser.password && foundUser.password !== password) {
          if (foundUser.password.startsWith('$2')) {
            setLoginError("La connexion hors-ligne est indisponible pour cet utilisateur sécurisé. Veuillez vous connecter avec une connexion Internet active.");
            return;
          } else {
            setLoginError("Mot de passe incorrect.");
            return;
          }
        }
        
        if (foundUser.firstLoginReset) {
          setResettingUser(foundUser);
          setMode('firstLoginReset');
        } else {
          handleLoginSuccess(foundUser.id, foundUser.tenantId);
        }
      } else {
        // Provision a custom user on the fly for testing convenience when offline
        const customUserId = `u-custom-${Date.now()}`;
        const customTenantId = db.tenants[0]?.id || 't-aura-tech';
        
        const nextUser: User = {
          id: customUserId,
          name: email.split('@')[0],
          email: email,
          role: 'owner',
          tenantId: customTenantId,
          active: true
        };

        const updatedDb = {
          ...db,
          users: [...db.users, nextUser]
        };

        handleLoginSuccess(customUserId, customTenantId, updatedDb);
      }
    }
  };

  const handleFirstLoginResetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingUser) return;
    if (!newPassword || newPassword.length < 4) {
      setResetError("Le mot de passe doit comporter au moins 4 caractères.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    // Update user password and clear firstLoginReset flag
    const updatedUsers = db.users.map(u => {
      if (u.id === resettingUser.id) {
        return {
          ...u,
          password: newPassword,
          firstLoginReset: false
        };
      }
      return u;
    });

    const audit: any = {
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: resettingUser.id,
      userName: resettingUser.name,
      action: 'PASSWORD_RESET_ON_FIRST_LOGIN',
      details: 'Changement obligatoire de mot de passe lors de la première connexion effectué avec succès.',
      tenantId: resettingUser.tenantId
    };

    const nextDb: any = {
      ...db,
      users: updatedUsers,
      auditLogs: [audit, ...(db.auditLogs || [])]
    };

    setIsSuccess(true);
    setSuccessMsg(`Votre mot de passe a été sécurisé avec succès ! Initialisation de votre espace client NexaStock...`);

    const syncPromise = handleUpdateDb(nextDb);
    setTimeout(async () => {
      try {
        await syncPromise;
      } catch {
        // continue even if sync fails
      }
      setIsSuccess(false);
      handleLoginSuccess(resettingUser.id, resettingUser.tenantId);
    }, 2000);
  };

  const [registerErrors, setRegisterErrors] = useState<Record<string, string>>({});

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterErrors({});

    const regResult = registerSchema.safeParse({ companyName, email, password: password || undefined, adminName });
    if (!regResult.success) {
      const errs: Record<string, string> = {};
      for (const issue of regResult.error.issues) {
        const path = issue.path.join('.');
        if (!errs[path]) errs[path] = issue.message;
      }
      setRegisterErrors(errs);
      return;
    }
    if (!adminName) {
      setRegisterErrors({ adminName: "Le nom de l'administrateur est requis." });
      return;
    }

    const newTenantId = `t-${companyName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Math.floor(Math.random() * 900 + 100)}`;
    const newUserId = `u-${Math.floor(Math.random() * 90000 + 10000)}`;

    const trialDays = 14;
    const trialStartDate = new Date().toISOString();
    const trialEndDate = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString();

    const newTenant: Tenant = {
      id: newTenantId,
      name: companyName,
      description: `Espace SaaS de ${companyName}`,
      plan: selectedPlan,
      logo: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=80&h=80&fit=crop&q=80',
      address: 'Adresse de l\'entreprise',
      phone: '+33 6 00 00 00 00',
      currency: db.saasCurrency || 'EUR',
      createdAt: new Date().toISOString(),
      subscriptionStatus: 'TRIAL',
      trialStartDate,
      trialEndDate,
      subscriptionEndDate: trialEndDate
    };

    const newUser: User = {
      id: newUserId,
      name: adminName,
      email: email,
      role: 'owner',
      tenantId: newTenantId,
      active: true,
      avatar: '',
      firstLoginReset: true
    };

    // Add some default products for the new tenant to look complete
    const defaultProducts = [
      {
        id: `p-${newTenantId}-1`,
        name: 'Produit Démo Standard A',
        sku: `SKU-A-${Math.floor(Math.random() * 9000 + 1000)}`,
        barcode: `330${Math.floor(Math.random() * 900000 + 100000)}`,
        description: 'Premier article de démonstration pour votre stock',
        category: 'Général',
        buyPrice: 15,
        sellPrice: 29.9,
        quantity: 25,
        alertThreshold: 5,
        tenantId: newTenantId,
        createdAt: new Date().toISOString()
      },
      {
        id: `p-${newTenantId}-2`,
        name: 'Produit Démo Premium B',
        sku: `SKU-B-${Math.floor(Math.random() * 9000 + 1000)}`,
        barcode: `330${Math.floor(Math.random() * 900000 + 100000)}`,
        description: 'Deuxième article de démonstration premium',
        category: 'Électronique',
        buyPrice: 120,
        sellPrice: 199,
        quantity: 8,
        alertThreshold: 3,
        tenantId: newTenantId,
        createdAt: new Date().toISOString()
      }
    ];

    const nextDb: any = {
      ...db,
      tenants: [...db.tenants, newTenant],
      users: [...db.users, newUser],
      products: [...db.products, ...defaultProducts],
      warehouses: [
        ...(db.warehouses || []),
        { id: `w-${newTenantId}-1`, name: 'Entrepôt Principal', location: 'Adresse principale', tenantId: newTenantId }
      ]
    };

    handleRegisterTenant(newTenant, newUser);
    handleUpdateDb(nextDb);
    setSuccessMsg(`Félicitations ! L'entreprise "${companyName}" a été créée avec succès sur le plan ${selectedPlan}.`);
    setIsSuccess(true);
    setTimeout(() => {
      handleLoginSuccess(newUser.id, newTenantId, nextDb);
    }, 2500);
  };

  const handleForgotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setIsSuccess(true);
    setSuccessMsg(`Un e-mail de réinitialisation de mot de passe a été simulé et envoyé à l'adresse ${email}.`);
    setTimeout(() => {
      setIsSuccess(false);
      setMode('login');
    }, 3500);
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col justify-between text-white font-sans overflow-hidden">
      


      <div className="flex-1 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 items-center p-4 lg:p-8 gap-8">
        
        {/* Left column: Value Proposition & Showcase */}
        <div className="lg:col-span-7 space-y-6 lg:pr-12">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-sm text-white shadow-md shadow-blue-500/20">
              N
            </div>
            <span className="font-bold tracking-wider text-sm font-display text-white">NexaStock SaaS</span>
            <span className="text-[10px] font-mono font-bold text-blue-400 bg-blue-500/10 border border-blue-500/15 px-2 py-0.5 rounded-full">v2.0 Enterprise Ready</span>
          </div>

          <div className="space-y-4">
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white leading-none">
              La plateforme de gestion <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400">intelligente</span> pour PME.
            </h1>
            <p className="text-sm md:text-base text-gray-400 max-w-xl leading-relaxed">
              Passez à la vitesse supérieure. Un ERP moderne multi-boutique intégrant l'IA pour la prédiction de réapprovisionnements, une caisse enregistreuse POS résiliente et une isolation stricte des données de vos clients.
            </p>
          </div>

          {/* Quick value features list */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl pt-2">
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-gray-900/40 border border-gray-850">
              <ShieldCheck className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-gray-200">Isolation Multi-Tenant</p>
                <p className="text-[11px] text-gray-400">Chaque organisation possède ses bases de données isolées de manière étanche.</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-gray-900/40 border border-gray-850">
              <Smartphone className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-gray-200">POS Offline-First</p>
                <p className="text-[11px] text-gray-400">Vendez même sans connexion Internet. Synchronisation instantanée automatique.</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-gray-900/40 border border-gray-850">
              <Sparkles className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-gray-200">Analyse de Trésorerie & IA</p>
                <p className="text-[11px] text-gray-400">Prédiction de ruptures et suggestions de commandes automatisées par Gemini.</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-gray-900/40 border border-gray-850">
              <Database className="w-4 h-4 text-indigo-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-gray-200">Multi-sites & Variantes</p>
                <p className="text-[11px] text-gray-400">Gérez plusieurs entrepôts et les attributs de produits (tailles, couleurs, etc.).</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right column: Form portal */}
        <div className="lg:col-span-5 bg-gray-900 border border-gray-850 rounded-2xl p-6 md:p-8 shadow-2xl relative">
          
          <AnimatePresence mode="wait">
            {isSuccess ? (
              <motion.div 
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="text-center py-8 space-y-4"
              >
                <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto animate-bounce" />
                <h3 className="text-lg font-bold text-white">Opération Réussie</h3>
                <p className="text-xs text-gray-400 leading-relaxed max-w-sm mx-auto">
                  {successMsg}
                </p>
                <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin mx-auto mt-4"></div>
              </motion.div>
            ) : mode === 'login' ? (
              <motion.div 
                key="login"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-white">Connexion Client</h3>
                  <p className="text-xs text-gray-400">Saisissez vos identifiants pour accéder à votre console.</p>
                </div>

                {loginError && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-xs font-semibold font-mono">
                    ⚠️ {loginError}
                  </div>
                )}

                <form onSubmit={handleLoginSubmit} className="space-y-3.5 pt-2" noValidate>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-mono font-bold text-gray-400 uppercase">Adresse E-mail</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input 
                        type="email" 
                        required
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); setFieldErrors(prev => { const n = {...prev}; delete n.email; return n; }); }}
                        placeholder="nom@entreprise.com"
                        className={`w-full bg-gray-950 border rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none transition ${fieldErrors.email ? 'border-red-500 focus:border-red-500' : 'border-gray-800 focus:border-blue-500'}`}
                      />
                    </div>
                    {fieldErrors.email && (
                      <p className="text-[10px] text-red-400 font-mono flex items-center gap-1 mt-1">
                        <AlertTriangle className="w-3 h-3" /> {fieldErrors.email}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] font-mono font-bold text-gray-400 uppercase">Mot de Passe</label>
                      <button 
                        type="button"
                        onClick={() => setMode('forgot')}
                        className="text-[10px] text-blue-400 hover:underline"
                      >
                        Mot de passe oublié ?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input 
                        type="password" 
                        required
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setFieldErrors(prev => { const n = {...prev}; delete n.password; return n; }); }}
                        placeholder="••••••••••••"
                        className={`w-full bg-gray-950 border rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none transition ${fieldErrors.password ? 'border-red-500 focus:border-red-500' : 'border-gray-800 focus:border-blue-500'}`}
                      />
                    </div>
                    {fieldErrors.password && (
                      <p className="text-[10px] text-red-400 font-mono flex items-center gap-1 mt-1">
                        <AlertTriangle className="w-3 h-3" /> {fieldErrors.password}
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-500 transition text-white text-xs font-bold py-2.5 rounded-xl shadow-lg shadow-blue-500/15 flex items-center justify-center gap-1.5 mt-2"
                  >
                    Se connecter à la console <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </form>

                <div className="border-t border-gray-800 pt-4 text-center">
                  <p className="text-xs text-gray-400">
                    Vous êtes un nouveau client ?{' '}
                    <button 
                      onClick={() => setMode('register')}
                      className="text-blue-400 font-semibold hover:underline"
                    >
                      Inscrire votre entreprise
                    </button>
                  </p>
                </div>
              </motion.div>
            ) : mode === 'register' ? (
              <motion.div 
                key="register"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-white flex items-center gap-1.5">
                    <UserPlus className="w-5 h-5 text-blue-400" />
                    Créer mon Compte SaaS
                  </h3>
                  <p className="text-xs text-gray-400">Configurez votre espace d'entreprise multi-tenant en 30 secondes.</p>
                </div>

                <form onSubmit={handleRegisterSubmit} className="space-y-3 pt-2" noValidate>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono font-bold text-gray-400 uppercase">Nom de votre Entreprise</label>
                    <div className="relative">
                      <Building className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input 
                        type="text" 
                        required
                        value={companyName}
                        onChange={(e) => { setCompanyName(e.target.value); setRegisterErrors(prev => { const n = {...prev}; delete n.companyName; return n; }); }}
                        placeholder="Ex: Pharma Saint-Jacques ou Supermarché Express"
                        className={`w-full bg-gray-950 border rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-gray-600 focus:outline-none transition ${registerErrors.companyName ? 'border-red-500' : 'border-gray-800 focus:border-blue-500'}`}
                      />
                    </div>
                    {registerErrors.companyName && (
                      <p className="text-[10px] text-red-400 font-mono flex items-center gap-1 mt-0.5"><AlertTriangle className="w-3 h-3" /> {registerErrors.companyName}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-mono font-bold text-gray-400 uppercase">Nom Complet Administrateur</label>
                    <input 
                      type="text" 
                      required
                      value={adminName}
                      onChange={(e) => { setAdminName(e.target.value); setRegisterErrors(prev => { const n = {...prev}; delete n.adminName; return n; }); }}
                      placeholder="Ex: Jean Dupont"
                      className={`w-full bg-gray-950 border rounded-xl px-4 py-2 text-xs text-white placeholder-gray-600 focus:outline-none transition ${registerErrors.adminName ? 'border-red-500' : 'border-gray-800 focus:border-blue-500'}`}
                    />
                    {registerErrors.adminName && (
                      <p className="text-[10px] text-red-400 font-mono flex items-center gap-1 mt-0.5"><AlertTriangle className="w-3 h-3" /> {registerErrors.adminName}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-mono font-bold text-gray-400 uppercase">Adresse E-mail Professionnelle</label>
                    <input 
                      type="email" 
                      required
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setRegisterErrors(prev => { const n = {...prev}; delete n.email; return n; }); }}
                      placeholder="nom@entreprise.com"
                      className={`w-full bg-gray-950 border rounded-xl px-4 py-2 text-xs text-white placeholder-gray-600 focus:outline-none transition ${registerErrors.email ? 'border-red-500' : 'border-gray-800 focus:border-blue-500'}`}
                    />
                    {registerErrors.email && (
                      <p className="text-[10px] text-red-400 font-mono flex items-center gap-1 mt-0.5"><AlertTriangle className="w-3 h-3" /> {registerErrors.email}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-mono font-bold text-gray-400 uppercase">Choisir un Forfait de Démarrage</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(['Free', 'Standard', 'Premium', 'Enterprise'] as SubscriptionPlan[]).map(plan => (
                        <button
                          key={plan}
                          type="button"
                          onClick={() => setSelectedPlan(plan)}
                          className={`py-1.5 rounded-lg text-[10px] font-bold border transition ${
                            selectedPlan === plan 
                              ? 'bg-blue-600 border-blue-500 text-white' 
                              : 'bg-gray-950 border-gray-800 text-gray-400 hover:border-gray-700'
                          }`}
                        >
                          {plan}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 transition text-white text-xs font-bold py-2.5 rounded-xl shadow-lg flex items-center justify-center gap-1.5 mt-2"
                  >
                    Activer mon Espace Cloud <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </form>

                <div className="border-t border-gray-800 pt-3 text-center">
                  <p className="text-xs text-gray-400">
                    Déjà client ?{' '}
                    <button 
                      onClick={() => setMode('login')}
                      className="text-blue-400 font-semibold hover:underline"
                    >
                      Se connecter
                    </button>
                  </p>
                </div>
              </motion.div>
            ) : mode === 'firstLoginReset' ? (
              <motion.div
                key="firstLoginReset"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div className="space-y-1 bg-amber-500/10 border border-amber-500/20 p-3.5 rounded-xl">
                  <h3 className="text-sm font-bold text-amber-400 flex items-center gap-1.5 uppercase font-mono">
                    <Lock className="w-4 h-4" />
                    Première connexion sécurisée
                  </h3>
                  <p className="text-[11px] text-gray-300 leading-normal">
                    L'administrateur système exige que vous personnalisiez votre mot de passe pour des raisons de sécurité avant d'accéder à la plateforme.
                  </p>
                </div>

                <form onSubmit={handleFirstLoginResetSubmit} className="space-y-3.5 pt-2">
                  {resetError && (
                    <p className="text-[11px] font-bold text-red-400 font-mono">{resetError}</p>
                  )}

                  <div className="space-y-1">
                    <label className="text-[10px] font-mono font-bold text-gray-400 uppercase">Nouveau Mot de Passe</label>
                    <input 
                      type="password" 
                      required
                      value={newPassword}
                      onChange={(e) => { setNewPassword(e.target.value); setResetError(''); }}
                      placeholder="Saisissez un mot de passe sécurisé"
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 transition"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-mono font-bold text-gray-400 uppercase">Confirmer le Mot de Passe</label>
                    <input 
                      type="password" 
                      required
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); setResetError(''); }}
                      placeholder="Retapez le mot de passe"
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 transition"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-amber-500 hover:bg-amber-400 text-gray-950 text-xs font-bold py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 mt-2"
                  >
                    Activer mon compte & Entrer <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </form>

                <div className="text-center pt-2">
                  <button 
                    type="button"
                    onClick={() => { setMode('login'); setResettingUser(null); }}
                    className="text-xs text-gray-400 hover:text-white underline"
                  >
                    Annuler et retourner au portail
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="forgot"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-white">Réinitialisation</h3>
                  <p className="text-xs text-gray-400">Saisissez l'adresse mail liée à votre organisation SaaS.</p>
                </div>

                <form onSubmit={handleForgotSubmit} className="space-y-3.5 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-mono font-bold text-gray-400 uppercase">Adresse E-mail</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input 
                        type="email" 
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="nom@entreprise.com"
                        className="w-full bg-gray-950 border border-gray-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-500 transition text-white text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5 mt-2"
                  >
                    Envoyer le lien de réinitialisation <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </form>

                <div className="text-center">
                  <button 
                    type="button"
                    onClick={() => setMode('login')}
                    className="text-xs text-blue-400 font-semibold hover:underline"
                  >
                    Retour à la connexion
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>

      {/* Footer Info bar */}
      <footer className="bg-gray-950/60 border-t border-gray-900 py-3 text-center text-[10px] text-gray-500 flex justify-center items-center gap-4">
        <span>&copy; {new Date().getFullYear()} NexaStock SaaS Central Console.</span>
        <span>|</span>
        <span className="flex items-center gap-1">
          <CheckCircle className="w-3 h-3 text-emerald-400" /> Infrastructure Cloud ISO-27001
        </span>
        <span>|</span>
        <span>RGPD Compliant & 99.9% SLA</span>
      </footer>

    </div>
  );
}
