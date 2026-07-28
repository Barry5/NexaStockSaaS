import React from 'react';
import { motion } from 'motion/react';
import { BarChart3, Users, Building, FileText, Clock, Layers, LifeBuoy } from 'lucide-react';

interface AdminStatsProps {
  mrr: number;
  totalTenantsCount: number;
  totalUsersCount: number;
  totalProductsCount: number;
  totalGlobalSalesCount: number;
  totalGlobalVolume: number;
  pendingPayments: any[];
  supportTickets: any[];
  pricingPlans: any[];
  db: any;
  setActiveSubTab: (tab: any) => void;
}

export default function AdminStats({
  mrr,
  totalTenantsCount,
  totalUsersCount,
  totalProductsCount,
  totalGlobalSalesCount,
  totalGlobalVolume,
  pendingPayments,
  supportTickets,
  pricingPlans,
  db,
  setActiveSubTab,
}: AdminStatsProps) {
  return (
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
            {db.tenants.filter((t: any) => t.plan === 'Premium').length} Premium, {db.tenants.filter((t: any) => t.plan === 'Standard').length} Standard
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
              {supportTickets.filter((t: any) => t.status === 'Ouvert').length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-600 text-white font-extrabold rounded-full text-[8px] h-4 w-4 flex items-center justify-center border border-gray-950">
                  {supportTickets.filter((t: any) => t.status === 'Ouvert').length}
                </span>
              )}
            </div>
            <div>
              <p className="text-xs font-bold text-white">Tickets Support</p>
              <p className="text-[10px] text-gray-400 font-mono font-medium">{supportTickets.filter((t: any) => t.status === 'Ouvert').length} ouverts</p>
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
  );
}
