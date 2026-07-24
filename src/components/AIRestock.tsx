import { useState, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, RefreshCw, ArrowRight, AlertTriangle, Coins, CheckCircle2, Mail, FileCheck, Zap, HelpCircle } from 'lucide-react';
import type { Product } from '../types';
import { useDB, useApp } from '../context';
import { formatCurrency } from '../utils';
import { LOADING_STEPS } from '../constants';
import { fetchAiRestock } from '../api';

interface RestockReport {
  summary: string;
  alertsCount: number;
  recommendations: { productName: string; currentStock: number; recommendedQuantity: number; estimatedCost: number; priority: 'Haute' | 'Moyenne' | 'Faible'; reasoning: string; }[];
  smartTips: string[];
}

function AIRestockInner() {
  const { db, handleProductsUpdate } = useDB();
  const { activeTenantId } = useApp();

  const activeTenant = db.tenants.find(t => t.id === activeTenantId);
  const tenantProducts = db.products.filter(p => p.tenantId === activeTenantId);

  const [loading, setLoading] = useState(false);
  const [loadingStepIdx, setLoadingStepIdx] = useState(0);
  const [report, setReport] = useState<RestockReport | null>(null);
  const [error, setError] = useState('');
  const [successOrderIdx, setSuccessOrderIdx] = useState<number | null>(null);

  useEffect(() => {
    let interval: any;
    if (loading) {
      interval = setInterval(() => setLoadingStepIdx(prev => (prev + 1) % LOADING_STEPS.length), 2500);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const triggerAiAnalysis = async () => {
    setLoading(true); setError(''); setReport(null); setLoadingStepIdx(0); setSuccessOrderIdx(null);
    try {
      const data = await fetchAiRestock({ tenantId: activeTenantId });
      setReport(data);
    } catch (e: any) {
      setError(e.message || "Impossible de joindre le serveur d'intelligence artificielle.");
    } finally {
      setLoading(false);
    }
  };

  const handleApproveRestockOrder = (idx: number, name: string, quantity: number) => {
    const prod = db.products.find(p => p.name === name && p.tenantId === activeTenantId);
    if (prod) {
      handleProductsUpdate(db.products.map(p => p.id === prod.id ? { ...p, quantity: p.quantity + quantity } : p));
      setSuccessOrderIdx(idx);
    } else {
      alert("Produit introuvable.");
    }
  };

  const formatted = (val: number) => formatCurrency(val, activeTenant?.currency, 0);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-purple-950/40 via-indigo-950/30 to-slate-900 border border-purple-500/10 p-6 rounded-2xl relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute top-1/2 left-1/3 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none"></div>
        <div className="max-w-2xl">
          <div className="bg-purple-500/15 text-purple-300 border border-purple-500/20 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5 mb-3">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" /> Module IA Decision-Making
          </div>
          <h1 className="text-xl font-bold font-display text-white tracking-tight">Réapprovisionnement Intelligent SaaS</h1>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">Grâce à l'analyse croisée de vos stocks actuels, de vos seuils d'alertes et de votre historique de ventes, notre agent Gemini préconise des volumes d'approvisionnement optimaux.</p>
        </div>
        <div className="mt-5">
          <button onClick={triggerAiAnalysis} disabled={loading}
            className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 transition text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-purple-500/15">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />{loading ? 'Consultation IA en cours...' : "Lancer l'Analyse Prédictive IA"}</button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-xs flex flex-col gap-2">
          <p className="font-semibold">L'analyse n'a pas pu aboutir :</p>
          <p className="font-mono bg-gray-950 p-2 rounded border border-gray-850">{error}</p>
          <p className="text-[10px] text-gray-500">Conseil : Assurez-vous d'avoir configuré une clé <strong>GEMINI_API_KEY</strong> valide.</p>
        </div>
      )}

      <AnimatePresence>
        {loading && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="bg-gray-900 border border-gray-800 p-8 rounded-2xl flex flex-col items-center justify-center text-center space-y-6">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-purple-500/20 border-t-purple-500 animate-spin"></div>
              <Sparkles className="w-6 h-6 text-purple-400 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pulse-soft" />
            </div>
            <div className="space-y-1 max-w-sm">
              <h3 className="text-sm font-bold text-gray-200">Consultation Gemini AI en cours...</h3>
              <p className="text-xs text-gray-400 italic">" {LOADING_STEPS[loadingStepIdx]} "</p>
            </div>
            <p className="text-[10px] text-gray-500 max-w-xs leading-relaxed">Le traitement prend généralement entre 3 et 6 secondes.</p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {report && !loading && (
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-5 lg:col-span-1">
              <div className="bg-gray-900 border border-gray-800 p-5 rounded-2xl">
                <div className="flex items-center gap-2 mb-3"><Sparkles className="w-4 h-4 text-purple-400" /><h3 className="text-xs font-bold uppercase tracking-wider text-gray-300">Synthèse Stratégique</h3></div>
                <p className="text-xs text-gray-300 leading-relaxed font-sans">{report.summary}</p>
                <div className="mt-4 pt-3 border-t border-gray-800 flex justify-between items-center text-xs">
                  <span className="text-gray-500">Alertes critiques résolues :</span>
                  <span className="font-mono bg-red-500/10 text-red-400 px-2.5 py-0.5 rounded-full font-bold border border-red-500/10">{report.alertsCount} alertes</span>
                </div>
              </div>
              <div className="bg-gray-900 border border-gray-800 p-5 rounded-2xl space-y-3">
                <div className="flex items-center gap-2"><Zap className="w-4 h-4 text-amber-400" /><h3 className="text-xs font-bold uppercase tracking-wider text-gray-300">Optimisations Financières</h3></div>
                <div className="space-y-2.5">{report.smartTips.map((tip, idx) => (
                  <div key={idx} className="flex gap-2.5 items-start p-2.5 bg-gray-950 rounded-xl border border-gray-850">
                    <Coins className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" /><p className="text-xs text-gray-400 leading-normal">{tip}</p></div>
                ))}</div>
              </div>
            </div>
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-gray-900 border border-gray-800 p-5 rounded-2xl">
                <div className="flex justify-between items-center mb-4">
                  <div><h3 className="text-sm font-semibold text-white font-display">Plan de Réapprovisionnement Conseillé</h3><p className="text-xs text-gray-500">Recommandations quantitatives générées automatiquement</p></div>
                  <span className="text-[10px] font-mono font-semibold text-gray-500">Achat direct simulé</span>
                </div>
                <div className="space-y-3.5 max-h-[500px] overflow-y-auto pr-1">
                  {report.recommendations.map((rec, idx) => {
                    const isSuccess = successOrderIdx === idx;
                    const priorityColor = rec.priority === 'Haute' ? 'text-red-400 bg-red-500/10' : rec.priority === 'Moyenne' ? 'text-amber-400 bg-amber-500/10' : 'text-blue-400 bg-blue-500/10';
                    return (
                      <div key={idx} className={`p-4 rounded-xl border transition ${isSuccess ? 'bg-emerald-950/20 border-emerald-500/20' : 'bg-gray-950/80 border-gray-800'}`}>
                        <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-2.5 mb-2.5">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-xs font-bold text-gray-100">{rec.productName}</h4>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold font-mono uppercase border ${priorityColor}`}>Priorité {rec.priority}</span>
                            </div>
                            <p className="text-[10px] text-gray-500 font-mono mt-0.5">Stock actuel : <strong className="text-gray-300">{rec.currentStock}</strong> | Quantité suggérée : <strong className="text-white">+{rec.recommendedQuantity}</strong></p>
                          </div>
                          <div className="text-left sm:text-right font-mono"><span className="text-[9px] text-gray-500 block uppercase">Coût estimé</span><span className="text-xs font-bold text-emerald-400">{formatted(rec.estimatedCost)}</span></div>
                        </div>
                        <p className="text-xs text-gray-400 leading-relaxed bg-gray-900/60 p-2.5 rounded-lg border border-gray-850 mb-3.5">{rec.reasoning}</p>
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => alert("Demande de devis transmise par email.")} className="flex items-center gap-1 bg-gray-900 hover:bg-gray-850 text-gray-400 hover:text-white px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border border-gray-800">
                            <Mail className="w-3.5 h-3.5" /> Devis Fournisseur</button>
                          <button type="button" disabled={isSuccess} onClick={() => handleApproveRestockOrder(idx, rec.productName, rec.recommendedQuantity)}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-semibold border transition ${isSuccess ? 'bg-emerald-500/10 text-brand-green border-emerald-500/15' : 'bg-brand-blue/10 hover:bg-brand-blue/20 text-brand-blue border-brand-blue/20'}`}>
                            {isSuccess ? <><CheckCircle2 className="w-3.5 h-3.5 text-brand-green" /> Livré & Stocké</> : <><FileCheck className="w-3.5 h-3.5" /> Commander & Intégrer</>}</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!report && !loading && (
        <div className="bg-gray-900/40 border border-gray-800/80 p-8 rounded-2xl text-center space-y-4 max-w-lg mx-auto">
          <HelpCircle className="w-12 h-12 text-gray-700 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-gray-300">Prêt pour l'Analyse d'Approvisionnement</h3>
            <p className="text-xs text-gray-500 leading-normal">Aucune analyse active. Cliquez pour envoyer vos données à Gemini et recevoir un plan d'action.</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(AIRestockInner);
