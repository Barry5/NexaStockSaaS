import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  Clock,
  CreditCard,
  RefreshCw,
  ShieldAlert,
  Sparkles
} from 'lucide-react';
import { futurePaymentProviders } from '../../lib/subscriptionUtils';

interface SaaSSaasPanelProps {
  tenantPlanStatus: any;
  remainingDays: any;
  activeTenant: any;
  pricingPlans: any[];
  paymentTargetPlan: any;
  setPaymentTargetPlan: (p: any) => void;
  payAmount: number;
  setPayAmount: (v: number) => void;
  setIsPaymentFormOpen: (v: boolean) => void;
  handleSubmitPaymentRequest: (e: React.FormEvent) => void;
  globalSaaSSettings: any;
  payMethod: string;
  setPayMethod: (v: string) => void;
  payReference: string;
  setPayReference: (v: string) => void;
  payNumTransaction: string;
  setPayNumTransaction: (v: string) => void;
  payComment: string;
  setPayComment: (v: string) => void;
  payReceiptSim: string;
  setPayReceiptSim: (v: string) => void;
  paymentSuccess: boolean;
  tenantPayments: any[];
  isSyncing: boolean;
  handleSyncFromServer: () => void;
  db: any;
}

export default function SaaSSaasPanel({
  tenantPlanStatus,
  remainingDays,
  activeTenant,
  pricingPlans,
  paymentTargetPlan,
  setPaymentTargetPlan,
  payAmount,
  setPayAmount,
  setIsPaymentFormOpen,
  handleSubmitPaymentRequest,
  globalSaaSSettings,
  payMethod,
  setPayMethod,
  payReference,
  setPayReference,
  payNumTransaction,
  setPayNumTransaction,
  payComment,
  setPayComment,
  payReceiptSim,
  setPayReceiptSim,
  paymentSuccess,
  tenantPayments,
  isSyncing,
  handleSyncFromServer,
  db,
}: SaaSSaasPanelProps) {
  return (
    <>
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
    </>
  );
}
