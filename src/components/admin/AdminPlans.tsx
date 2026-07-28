import React from 'react';
import { motion } from 'motion/react';
import { RefreshCw, Check, CreditCard } from 'lucide-react';

interface AdminPlansProps {
  localGlobalSaaSSettings: any;
  globalSaaSSettings: any;
  localPricingPlans: any[];
  pricingPlans: any[];
  localSaasCurrency: string;
  setLocalSaasCurrency: (v: string) => void;
  setLocalPricingPlans: (v: any) => void;
  isSaaSSettingsSaved: boolean;
  isSaaSSettingsSaving: boolean;
  handleSaveAllSaaSSettings: () => void;
  handleSavePlanSettings: (idx: number, field: string, value: any) => void;
  handleSaveGlobalPaymentsSettings: (field: string, value: any) => void;
}

export default function AdminPlans({
  localGlobalSaaSSettings,
  globalSaaSSettings,
  localPricingPlans,
  pricingPlans,
  localSaasCurrency,
  setLocalSaasCurrency,
  setLocalPricingPlans,
  isSaaSSettingsSaved,
  isSaaSSettingsSaving,
  handleSaveAllSaaSSettings,
  handleSavePlanSettings,
  handleSaveGlobalPaymentsSettings,
}: AdminPlansProps) {
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
                setLocalPricingPlans((prev: any[]) => prev.map((p: any) => ({
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
          {currentPlans.map((pl: any, idx: number) => (
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
}
