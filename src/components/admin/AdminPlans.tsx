import React, { useState } from 'react';
import { motion } from 'motion/react';
import { RefreshCw, Check, CreditCard, Plus, Trash2, Pencil } from 'lucide-react';

interface AdminPlansProps {
  localGlobalSaaSSettings: any;
  globalSaaSSettings: any;
  localPricingPlans: any[];
  pricingPlans: any[];
  localSaasCurrency: string;
  tenants: any[];
  setLocalSaasCurrency: (v: string) => void;
  setLocalPricingPlans: (v: any) => void;
  isSaaSSettingsSaved: boolean;
  isSaaSSettingsSaving: boolean;
  handleSaveAllSaaSSettings: () => void;
  handleSavePlanSettings: (idx: number, field: string, value: any) => void;
  handleSaveGlobalPaymentsSettings: (field: string, value: any) => void;
}

const PLAN_COLORS = ['gray', 'blue', 'purple', 'green', 'orange', 'red', 'pink', 'yellow', 'cyan'];

interface PlanForm {
  name: string;
  description: string;
  price: string;
  currency: string;
  durationDays: string;
  features: string;
  maxProducts: string;
  maxSales: string;
  maxCustomers: string;
  maxUsers: string;
  color: string;
  displayOrder: string;
  active: boolean;
}

function emptyForm(currency: string): PlanForm {
  return {
    name: '',
    description: '',
    price: '0',
    currency,
    durationDays: '30',
    features: '',
    maxProducts: '100',
    maxSales: '100',
    maxCustomers: '50',
    maxUsers: '1',
    color: 'gray',
    displayOrder: '99',
    active: true,
  };
}

function planToForm(plan: any, currency: string): PlanForm {
  return {
    name: plan.name || '',
    description: plan.description || '',
    price: String(plan.price ?? 0),
    currency: plan.currency || currency,
    durationDays: String(plan.durationDays ?? 30),
    features: Array.isArray(plan.features) ? plan.features.join(', ') : '',
    maxProducts: String(plan.limits?.maxProducts ?? 100),
    maxSales: String(plan.limits?.maxSales ?? 100),
    maxCustomers: String(plan.limits?.maxCustomers ?? 50),
    maxUsers: String(plan.limits?.maxUsers ?? 1),
    color: plan.color || 'gray',
    displayOrder: String(plan.displayOrder ?? 99),
    active: plan.active !== false,
  };
}

export default function AdminPlans({
  localGlobalSaaSSettings,
  globalSaaSSettings,
  localPricingPlans,
  pricingPlans,
  localSaasCurrency,
  tenants,
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

  const [planModal, setPlanModal] = useState<{ index: number; form: PlanForm } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ index: number; id: string; name: string } | null>(null);

  const openCreate = () => setPlanModal({ index: -1, form: emptyForm(currentCurrency) });
  const openEdit = (idx: number) => setPlanModal({ index: idx, form: planToForm(currentPlans[idx], currentCurrency) });

  const saveModal = () => {
    if (!planModal) return;
    const f = planModal.form;
    const built = {
      name: f.name.trim() || 'Nouveau forfait',
      description: f.description,
      price: Number(f.price) || 0,
      currency: f.currency || currentCurrency,
      durationDays: Number(f.durationDays) || 30,
      features: f.features.split(',').map((s: string) => s.trim()).filter(Boolean),
      limits: {
        maxProducts: Number(f.maxProducts) || 0,
        maxSales: Number(f.maxSales) || 0,
        maxCustomers: Number(f.maxCustomers) || 0,
        maxUsers: Number(f.maxUsers) || 1,
      },
      color: f.color,
      displayOrder: Number(f.displayOrder) || 99,
      active: f.active,
    };
    if (planModal.index === -1) {
      setLocalPricingPlans((prev: any[]) => [...prev, { id: `plan-${Date.now()}`, ...built }]);
    } else {
      setLocalPricingPlans((prev: any[]) =>
        prev.map((p: any, i: number) => (i === planModal.index ? { ...p, ...built } : p))
      );
    }
    setPlanModal(null);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const usage = tenants.filter(t => t.plan === deleteTarget.name).length;
    if (usage > 0) {
      window.alert(`Ce forfait est utilisé par ${usage} entreprise(s). Réaffectez-les avant de supprimer.`);
      setDeleteTarget(null);
      return;
    }
    setLocalPricingPlans((prev: any[]) => prev.filter((p: any) => p.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  const setForm = (patch: Partial<PlanForm>) =>
    setPlanModal(prev => (prev ? { ...prev, form: { ...prev.form, ...patch } } : prev));

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
            Créez, modifiez ou supprimez les forfaits de facturation, définissez les seuils maximum d'isolation, ainsi que les informations de versement affichées aux clients pour l'offline-payment.
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
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-gray-300 uppercase font-mono tracking-wider">B. Tarification & Restrictions d'isolation des Forfaits</h4>
          <button
            onClick={openCreate}
            className="px-4 py-2 rounded-lg font-bold text-xs transition flex items-center gap-2 bg-gray-900 border border-gray-800 text-gray-200 hover:border-red-500/40 hover:text-white shadow"
          >
            <Plus className="w-4 h-4" /> Nouveau forfait
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {currentPlans.map((pl: any, idx: number) => (
            <div key={pl.id} className="bg-gray-950 border border-gray-855 p-4 rounded-xl space-y-4 relative">
              <div className="flex items-center justify-between">
                <input
                  type="text"
                  value={pl.name}
                  onChange={(e) => handleSavePlanSettings(idx, 'name', e.target.value)}
                  className="bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-1 text-xs font-bold text-white font-mono w-36"
                />
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleSavePlanSettings(idx, 'active', !pl.active)}
                    title={pl.active ? 'Désactiver ce forfait' : 'Activer ce forfait'}
                    className={`px-2 py-1 rounded-md text-[9px] font-mono font-bold uppercase transition border ${
                      pl.active
                        ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                        : 'bg-gray-800 border-gray-700 text-gray-500'
                    }`}
                  >
                    {pl.active ? 'Actif' : 'Inactif'}
                  </button>
                  <button
                    onClick={() => openEdit(idx)}
                    className="p-1.5 rounded-md bg-gray-900 border border-gray-800 text-gray-400 hover:text-white hover:border-gray-600 transition"
                    title="Modifier le forfait"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget({ index: idx, id: pl.id, name: pl.name })}
                    className="p-1.5 rounded-md bg-gray-900 border border-gray-800 text-red-400/80 hover:text-red-400 hover:border-red-500/40 transition"
                    title="Supprimer le forfait"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono font-bold text-gray-500 uppercase">Tarif ({pl.currency || currentCurrency})</label>
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

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono font-bold text-gray-500 uppercase">Fonctionnalités (séparées par des virgules)</label>
                <input
                  type="text"
                  value={Array.isArray(pl.features) ? pl.features.join(', ') : pl.features || ''}
                  onChange={(e) => handleSavePlanSettings(idx, 'features', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="text-[9px] font-mono font-bold text-gray-500 uppercase">Durée (jours)</label>
                  <input
                    type="number"
                    value={pl.durationDays ?? 30}
                    onChange={(e) => handleSavePlanSettings(idx, 'durationDays', e.target.value)}
                    className="w-full bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-1 text-xs font-mono text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-mono font-bold text-gray-500 uppercase">Ordre</label>
                  <input
                    type="number"
                    value={pl.displayOrder ?? 99}
                    onChange={(e) => handleSavePlanSettings(idx, 'displayOrder', e.target.value)}
                    className="w-full bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-1 text-xs font-mono text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-mono font-bold text-gray-500 uppercase">Couleur</label>
                  <select
                    value={pl.color || 'gray'}
                    onChange={(e) => handleSavePlanSettings(idx, 'color', e.target.value)}
                    className="w-full bg-gray-900 border border-gray-800 rounded-lg px-2 py-1 text-xs text-white"
                  >
                    {PLAN_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
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

      {/* Create/Edit plan modal */}
      {planModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setPlanModal(null)}>
          <div
            className="bg-gray-950 border border-gray-800 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
              {planModal.index === -1 ? 'Créer un nouveau forfait' : 'Modifier le forfait'}
            </h4>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-gray-400 uppercase font-mono">Nom du forfait *</label>
              <input
                type="text"
                value={planModal.form.name}
                onChange={(e) => setForm({ name: e.target.value })}
                className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-gray-400 uppercase font-mono">Prix</label>
                <input
                  type="number"
                  value={planModal.form.price}
                  onChange={(e) => setForm({ price: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-gray-400 uppercase font-mono">Devise</label>
                <select
                  value={planModal.form.currency}
                  onChange={(e) => setForm({ currency: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white"
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
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-gray-400 uppercase font-mono">Durée (jours)</label>
                <input
                  type="number"
                  value={planModal.form.durationDays}
                  onChange={(e) => setForm({ durationDays: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-gray-400 uppercase font-mono">Ordre d'affichage</label>
                <input
                  type="number"
                  value={planModal.form.displayOrder}
                  onChange={(e) => setForm({ displayOrder: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-gray-400 uppercase font-mono">Slogan descriptif</label>
              <input
                type="text"
                value={planModal.form.description}
                onChange={(e) => setForm({ description: e.target.value })}
                className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-gray-400 uppercase font-mono">Fonctionnalités (séparées par des virgules)</label>
              <textarea
                rows={3}
                value={planModal.form.features}
                onChange={(e) => setForm({ features: e.target.value })}
                className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-gray-400 uppercase font-mono">Produits max</label>
                <input
                  type="number"
                  value={planModal.form.maxProducts}
                  onChange={(e) => setForm({ maxProducts: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-gray-400 uppercase font-mono">Ventes max</label>
                <input
                  type="number"
                  value={planModal.form.maxSales}
                  onChange={(e) => setForm({ maxSales: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-gray-400 uppercase font-mono">Clients max</label>
                <input
                  type="number"
                  value={planModal.form.maxCustomers}
                  onChange={(e) => setForm({ maxCustomers: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-gray-400 uppercase font-mono">Utilisateurs max</label>
                <input
                  type="number"
                  value={planModal.form.maxUsers}
                  onChange={(e) => setForm({ maxUsers: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-gray-400 uppercase font-mono">Couleur</label>
                <select
                  value={planModal.form.color}
                  onChange={(e) => setForm({ color: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white"
                >
                  {PLAN_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1.5 flex items-end">
                <button
                  onClick={() => setForm({ active: !planModal.form.active })}
                  className={`w-full px-3 py-2 rounded-lg text-xs font-bold uppercase font-mono transition border ${
                    planModal.form.active
                      ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                      : 'bg-gray-800 border-gray-700 text-gray-500'
                  }`}
                >
                  {planModal.form.active ? 'Actif' : 'Inactif'}
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-900">
              <button
                onClick={() => setPlanModal(null)}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-gray-900 border border-gray-800 text-gray-300 hover:border-gray-600 transition"
              >
                Annuler
              </button>
              <button
                onClick={saveModal}
                disabled={!planModal.form.name.trim()}
                className="px-5 py-2 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-500 text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {planModal.index === -1 ? 'Créer le forfait' : 'Enregistrer les modifications'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setDeleteTarget(null)}>
          <div
            className="bg-gray-950 border border-gray-800 rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-sm font-bold text-white font-mono uppercase tracking-wider">Supprimer le forfait</h4>
            <p className="text-xs text-gray-400">
              Voulez-vous vraiment supprimer le forfait <span className="text-white font-bold">{deleteTarget.name}</span> ?
              Cette action sera synchronisée sur toutes les entreprises.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-gray-900 border border-gray-800 text-gray-300 hover:border-gray-600 transition"
              >
                Annuler
              </button>
              <button
                onClick={confirmDelete}
                className="px-5 py-2 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-500 text-white transition"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
