import React from 'react';
import { motion } from 'motion/react';
import { Cloud, CloudLightning, Database, Clock, Zap, FileSearch } from 'lucide-react';
import type { SyncOverview } from '../../types/sync';

interface AdminSyncOverviewProps {
  overview: SyncOverview | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

const formatDate = (value: string | null): string => {
  if (!value) return 'Aucune donnée';
  return new Date(value).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
};

export default function AdminSyncOverview({ overview, loading, error, onRefresh }: AdminSyncOverviewProps) {
  return (
    <motion.div
      key="sync-overview"
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      className="space-y-6"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 font-mono">Supervision de la synchronisation</h3>
          <p className="mt-2 max-w-2xl text-sm text-gray-300">Surveillez l'état de la synchronisation entre SQLite local et Supabase central, le statut du worker, la file d'attente et les changements en attente.</p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-2xl border border-gray-700 bg-gray-950 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Rafraîchissement...' : 'Rafraîchir'}
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-600/20 bg-red-950/60 p-4 text-sm text-red-200">
          Echec de la récupération des données de synchronisation : {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-3xl border border-gray-850 bg-gray-950 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-400">Service de synchronisation</p>
              <p className="mt-2 text-3xl font-black text-white">{overview ? (overview.service.online ? 'En ligne' : 'Hors ligne') : '---'}</p>
            </div>
            <Cloud className="h-6 w-6 text-sky-400" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-gray-300">
            <div className="rounded-2xl bg-gray-900 p-3">
              <p className="text-[10px] uppercase text-gray-500">En attente</p>
              <p className="mt-2 text-lg font-semibold text-white">{overview?.service.pendingCount ?? '---'}</p>
            </div>
            <div className="rounded-2xl bg-gray-900 p-3">
              <p className="text-[10px] uppercase text-gray-500">Échecs</p>
              <p className="mt-2 text-lg font-semibold text-white">{overview?.service.failedCount ?? '---'}</p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-850 bg-gray-950 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-400">Worker</p>
              <p className="mt-2 text-3xl font-black text-white">{overview ? (overview.worker.running ? 'Actif' : 'Inactif') : '---'}</p>
            </div>
            <CloudLightning className="h-6 w-6 text-emerald-400" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-gray-300">
            <div className="rounded-2xl bg-gray-900 p-3">
              <p className="text-[10px] uppercase text-gray-500">Dernière exécution</p>
              <p className="mt-2 font-semibold text-white">{formatDate(overview?.worker.lastRunAt ?? null)}</p>
            </div>
            <div className="rounded-2xl bg-gray-900 p-3">
              <p className="text-[10px] uppercase text-gray-500">Cycles</p>
              <p className="mt-2 text-lg font-semibold text-white">{overview?.worker.cycleCount ?? '---'}</p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-850 bg-gray-950 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-400">File de synchronisation</p>
              <p className="mt-2 text-3xl font-black text-white">{overview?.queueSummary.total ?? '---'}</p>
            </div>
            <Database className="h-6 w-6 text-violet-400" />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-sm text-gray-300">
            <div className="rounded-2xl bg-gray-900 p-3">
              <p className="text-[10px] uppercase text-gray-500">Traitement</p>
              <p className="mt-2 font-semibold text-white">{overview?.queueSummary.processing ?? '---'}</p>
            </div>
            <div className="rounded-2xl bg-gray-900 p-3">
              <p className="text-[10px] uppercase text-gray-500">Échecs</p>
              <p className="mt-2 font-semibold text-white">{overview?.queueSummary.failed ?? '---'}</p>
            </div>
            <div className="rounded-2xl bg-gray-900 p-3">
              <p className="text-[10px] uppercase text-gray-500">Complétés</p>
              <p className="mt-2 font-semibold text-white">{overview?.queueSummary.completed ?? '---'}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-gray-850 bg-gray-950 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-400">Historique de la file</p>
              <p className="mt-2 text-sm text-gray-300">Les tables les plus actives et les opérations en attente.</p>
            </div>
            <FileSearch className="h-5 w-5 text-slate-300" />
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2 text-sm text-left text-gray-200">
              <thead>
                <tr>
                  <th className="pb-2 text-xs uppercase tracking-wider text-gray-500">Table</th>
                  <th className="pb-2 text-xs uppercase tracking-wider text-gray-500">Pending</th>
                  <th className="pb-2 text-xs uppercase tracking-wider text-gray-500">Échecs</th>
                  <th className="pb-2 text-xs uppercase tracking-wider text-gray-500">Créer</th>
                  <th className="pb-2 text-xs uppercase tracking-wider text-gray-500">Modifier</th>
                  <th className="pb-2 text-xs uppercase tracking-wider text-gray-500">Supprimer</th>
                </tr>
              </thead>
              <tbody>
                {overview?.queueSummary.perTable.length ? overview.queueSummary.perTable.map((row) => (
                  <tr key={row.table_name} className="rounded-3xl bg-gray-900/80 border border-gray-850">
                    <td className="px-3 py-3 font-semibold text-white">{row.table_name}</td>
                    <td className="px-3 py-3 text-gray-300">{row.pending}</td>
                    <td className="px-3 py-3 text-gray-300">{row.failed}</td>
                    <td className="px-3 py-3 text-gray-300">{row.create}</td>
                    <td className="px-3 py-3 text-gray-300">{row.update}</td>
                    <td className="px-3 py-3 text-gray-300">{row.delete}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} className="px-3 py-4 text-sm text-gray-500">Aucune donnée disponible.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-850 bg-gray-950 p-5 shadow-sm">
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-400">Changements en attente</p>
            <p className="mt-2 text-sm text-gray-300">Résumé des modifications locales à pousser vers Supabase.</p>
          </div>
          <div className="mt-5 grid gap-3 text-sm text-gray-200">
            <div className="rounded-2xl bg-gray-900 p-4">
              <p className="text-xs uppercase text-gray-500">Total changement</p>
              <p className="mt-2 text-lg font-semibold text-white">{overview?.pendingChanges.changelogCount ?? '---'}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-gray-900 p-4">
                <p className="text-[10px] uppercase text-gray-500">Créations</p>
                <p className="mt-2 text-lg font-semibold text-white">{overview?.pendingChanges.changelogByTable.reduce((sum, item) => sum + item.create, 0) ?? '---'}</p>
              </div>
              <div className="rounded-2xl bg-gray-900 p-4">
                <p className="text-[10px] uppercase text-gray-500">Modifications</p>
                <p className="mt-2 text-lg font-semibold text-white">{overview?.pendingChanges.changelogByTable.reduce((sum, item) => sum + item.update, 0) ?? '---'}</p>
              </div>
              <div className="rounded-2xl bg-gray-900 p-4">
                <p className="text-[10px] uppercase text-gray-500">Suppressions</p>
                <p className="mt-2 text-lg font-semibold text-white">{overview?.pendingChanges.deletionCount ?? '---'}</p>
              </div>
            </div>
            <div className="overflow-x-auto rounded-2xl bg-gray-900 p-3">
              <table className="min-w-full text-sm text-left text-gray-200">
                <thead>
                  <tr>
                    <th className="pb-2 text-xs uppercase tracking-wider text-gray-500">Table</th>
                    <th className="pb-2 text-xs uppercase tracking-wider text-gray-500">Créations</th>
                    <th className="pb-2 text-xs uppercase tracking-wider text-gray-500">Modifs</th>
                    <th className="pb-2 text-xs uppercase tracking-wider text-gray-500">Suppressions</th>
                  </tr>
                </thead>
                <tbody>
                  {overview?.pendingChanges.changelogByTable.length ? overview.pendingChanges.changelogByTable.map((row) => (
                    <tr key={row.table_name} className="border-t border-gray-800">
                      <td className="py-2 text-white">{row.table_name}</td>
                      <td className="py-2 text-gray-300">{row.create}</td>
                      <td className="py-2 text-gray-300">{row.update}</td>
                      <td className="py-2 text-gray-300">{row.delete}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={4} className="py-4 text-sm text-gray-500">Aucune donnée de changement en attente.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-gray-850 bg-gray-950 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-400">Derniers synchronisations par table</p>
            <p className="mt-2 text-sm text-gray-300">Contrôle de cohérence entre SQLite et Supabase pour chaque table suivie.</p>
          </div>
          <Clock className="h-5 w-5 text-slate-300" />
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-sm text-left text-gray-200">
            <thead>
              <tr>
                <th className="pb-2 text-xs uppercase tracking-wider text-gray-500">Table</th>
                <th className="pb-2 text-xs uppercase tracking-wider text-gray-500">Dernière synchro</th>
              </tr>
            </thead>
            <tbody>
              {overview?.lastSyncTimestamps.length ? overview.lastSyncTimestamps.map((row) => (
                <tr key={row.table_name} className="border-t border-gray-800">
                  <td className="py-2 text-white">{row.table_name}</td>
                  <td className="py-2 text-gray-300">{formatDate(row.last_sync_at)}</td>
                </tr>
              )) : (
                <tr><td colSpan={2} className="py-4 text-sm text-gray-500">Aucune information de dernière synchronisation.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
