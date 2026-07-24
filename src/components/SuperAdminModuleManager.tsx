import { useState, useEffect, useMemo } from 'react';
import { Package, Save, RefreshCw, Check, X, AlertTriangle, Layers } from 'lucide-react';
import { useDB, useApp } from '../context';

export default function SuperAdminModuleManager() {
  const { db, addNotification } = useDB();
  const { activeUser } = useApp();

  const [definitions, setDefinitions] = useState<any[]>([]);
  const [planModules, setPlanModules] = useState<Record<string, string[]>>({});
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const plans = useMemo(() => {
    return db.pricingPlans || [];
  }, [db.pricingPlans]);

  useEffect(() => {
    if (plans.length > 0 && !selectedPlanId) {
      setSelectedPlanId(plans[0].id);
    }
  }, [plans, selectedPlanId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('nexastock_token');
        const res = await fetch('/api/modules/definitions', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (res.ok) {
          const data = await res.json();
          setDefinitions(data.modules || []);
        }
      } catch {} finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedPlanId) return;
    (async () => {
      try {
        const token = localStorage.getItem('nexastock_token');
        const res = await fetch(`/api/modules/plan/${selectedPlanId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (res.ok) {
          const data = await res.json();
          const keys = (data.modules || []).map((m: any) => m.moduleKey);
          setPlanModules(prev => ({ ...prev, [selectedPlanId]: keys }));
        }
      } catch {}
    })();
  }, [selectedPlanId]);

  const currentModules = planModules[selectedPlanId] || [];

  const toggleModule = (moduleKey: string) => {
    const updated = currentModules.includes(moduleKey)
      ? currentModules.filter(k => k !== moduleKey)
      : [...currentModules, moduleKey];
    setPlanModules(prev => ({ ...prev, [selectedPlanId]: updated }));
  };

  const handleSave = async () => {
    if (!selectedPlanId) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('nexastock_token');
      const res = await fetch(`/api/modules/plan/${selectedPlanId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ modules: currentModules }),
      });
      if (!res.ok) throw new Error('Erreur de sauvegarde');
      addNotification('Modules du plan mis à jour avec succès.', 'success');
    } catch (e: any) {
      addNotification(e.message || 'Erreur de sauvegarde.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = useMemo(() => {
    if (!selectedPlanId) return false;
    return true;
  }, [selectedPlanId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        Chargement des modules...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold font-display text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-brand-blue" />
            Configuration des Modules par Plan
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Activez ou désactivez des modules entiers pour chaque formule d'abonnement.
            Les modules désactivés sont masqués dans l'interface des clients.
          </p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1.5 bg-brand-blue hover:bg-blue-600 disabled:opacity-50 text-white px-3 py-2 rounded-xl text-xs font-semibold transition"
        >
          {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? 'Sauvegarde...' : 'Enregistrer'}
        </button>
      </div>

      {/* Plan selector */}
      <div className="flex flex-wrap gap-2">
        {plans.map(plan => (
          <button key={plan.id}
            onClick={() => setSelectedPlanId(plan.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition border ${
              selectedPlanId === plan.id
                ? 'bg-brand-blue/10 border-brand-blue/30 text-blue-400'
                : 'bg-gray-850 border-gray-700 text-gray-400 hover:border-gray-600'
            }`}
          >
            {plan.name}
            <span className="text-[9px] font-mono opacity-60">{plan.price}€</span>
          </button>
        ))}
      </div>

      {/* Module grid */}
      {selectedPlanId && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800 bg-gray-950/20">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-300">
              Modules disponibles pour ce plan
            </h3>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {definitions.map(def => {
              const isEnabled = currentModules.includes(def.key);
              const isCore = def.is_core;
              return (
                <button key={def.key}
                  onClick={() => !isCore && toggleModule(def.key)}
                  disabled={isCore}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left transition ${
                    isCore
                      ? 'bg-gray-950/50 border-gray-700/30 opacity-60 cursor-not-allowed'
                      : isEnabled
                        ? 'bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10'
                        : 'bg-gray-950/30 border-gray-800 hover:border-gray-700'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${
                    isEnabled ? 'bg-emerald-500/10 text-emerald-400' : 'bg-gray-850 text-gray-500'
                  }`}>
                    {isEnabled ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-bold truncate ${isEnabled ? 'text-gray-200' : 'text-gray-500'}`}>
                      {def.label}
                    </p>
                    <p className="text-[9px] text-gray-600 truncate mt-0.5">{def.description}</p>
                  </div>
                  {isCore && (
                    <span className="text-[8px] font-mono font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">OBLIGATOIRE</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Module inheritance info */}
      <div className="bg-blue-500/5 border border-blue-500/10 p-4 rounded-xl">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-bold text-blue-300">Héritage des modules</p>
            <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">
              Les modules désactivés ici sont <strong className="text-gray-200">invisibles</strong> pour tous les clients sous ce plan.
              Les modules activés peuvent être désactivés individuellement par client via la console d'administration.
              Les modules marqués "OBLIGATOIRE" sont toujours disponibles quel que soit le plan.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
