import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Database, Cloud, ShieldCheck, Download, Trash2, RefreshCw, CheckCircle2, XCircle,
  AlertTriangle, ChevronDown, ChevronRight, HardDrive, Activity, Loader2, FileJson,
  History, Server, Eye, ArrowDownToLine, ShieldAlert, Clock,
} from 'lucide-react';
import type { AdminBackupRecord, CoherenceReport, RestoreReport } from '../../types/backup';
import {
  createSqliteBackup, createSupabaseBackup, listManagedBackups, verifyManagedBackup,
  deleteManagedBackup, restoreSqlite, restoreSupabase, runCoherenceCheck,
  coherenceQuickStatus, downloadBackupUrl,
} from '../../api/admin';

interface AdminBackupCenterProps {
  db: any;
}

type RestorePhase = 'confirm' | 'running' | 'done';
type ActionBusy = 'sqlite' | 'supabase' | 'coherence' | null;

const fmtDate = (v: string | null | undefined): string =>
  v ? new Date(v).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const fmtBytes = (b: number): string => {
  if (b < 1024) return `${b} o`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} Ko`;
  return `${(b / 1024 / 1024).toFixed(2)} Mo`;
};

const statusMeta: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
  ok: { icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />, label: 'Cohérent', cls: 'text-emerald-400' },
  pending: { icon: <AlertTriangle className="w-4 h-4 text-amber-400" />, label: 'Sync en attente', cls: 'text-amber-400' },
  incoherent: { icon: <XCircle className="w-4 h-4 text-red-400" />, label: 'Incohérent', cls: 'text-red-400' },
  unknown: { icon: <ShieldAlert className="w-4 h-4 text-gray-500" />, label: 'Inconnu', cls: 'text-gray-500' },
};

export default function AdminBackupCenter({ }: AdminBackupCenterProps) {
  const [backups, setBackups] = useState<AdminBackupRecord[]>([]);
  const [quickStatus, setQuickStatus] = useState<any>(null);
  const [coherence, setCoherence] = useState<CoherenceReport | null>(null);
  const [lastSyncStatus, setLastSyncStatus] = useState<any>(null);
  const [busy, setBusy] = useState<ActionBusy>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [coherenceLoading, setCoherenceLoading] = useState(false);
  const [deepMode, setDeepMode] = useState(true);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [verifyResults, setVerifyResults] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // État du modal de restauration
  const [restoreTarget, setRestoreTarget] = useState<AdminBackupRecord | null>(null);
  const [restorePhase, setRestorePhase] = useState<RestorePhase>('confirm');
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  const [restoreReport, setRestoreReport] = useState<RestoreReport | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const refreshAll = useCallback(async () => {
    try {
      const [bk, qs] = await Promise.all([listManagedBackups(), coherenceQuickStatus()]);
      setBackups(bk);
      setQuickStatus(qs);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAll();
    fetch('/api/sync/status', { headers: { Authorization: `Bearer ${localStorage.getItem('nexastock_token')}` } })
      .then(r => r.json().catch(() => null))
      .then(s => setLastSyncStatus(s))
      .catch(() => setLastSyncStatus(null));
  }, [refreshAll]);

  const handleCreateBackup = async (type: 'sqlite' | 'supabase') => {
    setBusy(type);
    setError(null);
    try {
      if (type === 'sqlite') await createSqliteBackup();
      else await createSupabaseBackup();
      await refreshAll();
    } catch (e: any) {
      setError(e.message || 'Échec de la sauvegarde');
    } finally {
      setBusy(null);
    }
  };

  const handleVerify = async (b: AdminBackupRecord) => {
    try {
      const res = await verifyManagedBackup(b.id);
      setVerifyResults(prev => ({ ...prev, [b.id]: { ok: res.ok, message: res.message } }));
      setBackups(await listManagedBackups());
    } catch (e: any) {
      setVerifyResults(prev => ({ ...prev, [b.id]: { ok: false, message: e.message } }));
    }
  };

  const handleDelete = async (b: AdminBackupRecord) => {
    if (!window.confirm(`Supprimer définitivement la sauvegarde « ${b.id} » ?`)) return;
    setDeletingId(b.id);
    try {
      await deleteManagedBackup(b.id);
      setBackups(await listManagedBackups());
    } catch (e: any) {
      setError(e.message || 'Échec de la suppression');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCoherenceCheck = async () => {
    setCoherenceLoading(true);
    setError(null);
    try {
      setCoherence(await runCoherenceCheck(deepMode));
    } catch (e: any) {
      setError(e.message || 'Échec du contrôle de cohérence');
    } finally {
      setCoherenceLoading(false);
    }
  };

  const openRestore = (b: AdminBackupRecord) => {
    setRestoreTarget(b);
    setRestorePhase('confirm');
    setRestoreConfirm(false);
    setRestoreReport(null);
    setRestoreError(null);
  };

  const runRestore = async () => {
    if (!restoreTarget) return;
    setRestorePhase('running');
    setRestoreError(null);
    try {
      const report = restoreTarget.type === 'sqlite'
        ? await restoreSqlite(restoreTarget.id)
        : await restoreSupabase(restoreTarget.id);
      setRestoreReport(report);
      setRestorePhase('done');
      await refreshAll();
    } catch (e: any) {
      setRestoreError(e.message || 'Échec de la restauration');
      setRestorePhase('done');
    }
  };

  const toggleTable = (table: string) => {
    setExpandedTables(prev => {
      const next = new Set(prev);
      if (next.has(table)) next.delete(table);
      else next.add(table);
      return next;
    });
  };

  const coherentTables = useMemo(() => backups.filter(b => b.type === 'sqlite'), [backups]);

  return (
    <motion.div key="backup-center" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="space-y-6">
      {/* HEADER + ACTIONS */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 font-mono">Sauvegardes & Restauration</h3>
          <p className="mt-2 max-w-2xl text-sm text-gray-300">
            Sauvegarde des bases <strong className="text-white">SQLite (locale)</strong> et <strong className="text-white">Supabase (cloud)</strong>, restauration sécurisée
            avec contrôle de cohérence avant/après, et diagnostic d'écarts entre les deux sources. <span className="text-amber-400 font-semibold">Diagnostic uniquement — aucune correction automatique.</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleCreateBackup('sqlite')}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-2xl border border-emerald-600/40 bg-emerald-950/50 px-4 py-2.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-900/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === 'sqlite' ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4" />}
            Sauvegarder SQLite
          </button>
          <button
            onClick={() => handleCreateBackup('supabase')}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-2xl border border-sky-600/40 bg-sky-950/50 px-4 py-2.5 text-xs font-semibold text-sky-300 transition hover:bg-sky-900/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === 'supabase' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
            Sauvegarder Supabase
          </button>
          <button
            onClick={handleCoherenceCheck}
            disabled={coherenceLoading}
            className="inline-flex items-center gap-2 rounded-2xl border border-violet-600/40 bg-violet-950/50 px-4 py-2.5 text-xs font-semibold text-violet-300 transition hover:bg-violet-900/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {coherenceLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
            Vérifier la cohérence
          </button>
          <button
            onClick={refreshAll}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-2xl border border-gray-700 bg-gray-950 px-4 py-2.5 text-xs font-semibold text-gray-200 transition hover:border-white/20 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-600/20 bg-red-950/60 p-4 text-sm text-red-200 flex items-start gap-3">
          <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* STATUS CARDS */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <div className="rounded-3xl border border-gray-850 bg-gray-950 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-400">État de cohérence</p>
              <p className={`mt-2 text-2xl font-black ${quickStatus ? (quickStatus.incoherent > 0 ? 'text-red-400' : quickStatus.pending > 0 ? 'text-amber-400' : 'text-emerald-400') : 'text-gray-500'}`}>
                {quickStatus ? (quickStatus.incoherent > 0 ? 'Incohérent' : quickStatus.pending > 0 ? 'Sync en attente' : 'Cohérent') : '—'}
              </p>
            </div>
            <Activity className="h-6 w-6 text-violet-400" />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs text-gray-300">
            <div className="rounded-xl bg-emerald-950/40 p-2">
              <p className="text-base font-bold text-emerald-400">{quickStatus?.coherent ?? '—'}</p>
              <p className="text-[10px] text-gray-500">OK</p>
            </div>
            <div className="rounded-xl bg-amber-950/40 p-2">
              <p className="text-base font-bold text-amber-400">{quickStatus?.pending ?? '—'}</p>
              <p className="text-[10px] text-gray-500">Attente</p>
            </div>
            <div className="rounded-xl bg-red-950/40 p-2">
              <p className="text-base font-bold text-red-400">{quickStatus?.incoherent ?? '—'}</p>
              <p className="text-[10px] text-gray-500">Écarts</p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-850 bg-gray-950 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-400">Changements en attente</p>
              <p className="mt-2 text-2xl font-black text-white">{quickStatus?.pendingTotal?.changelog ?? '—'}</p>
            </div>
            <Clock className="h-6 w-6 text-amber-400" />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs text-gray-300">
            <div className="rounded-xl bg-gray-900 p-2">
              <p className="text-base font-bold text-amber-400">{quickStatus?.pendingTotal?.deletions ?? '—'}</p>
              <p className="text-[10px] text-gray-500">Suppressions</p>
            </div>
            <div className="rounded-xl bg-gray-900 p-2">
              <p className="text-base font-bold text-red-400">{quickStatus?.pendingTotal?.deadLetters ?? '—'}</p>
              <p className="text-[10px] text-gray-500">Dead-letters</p>
            </div>
            <div className="rounded-xl bg-gray-900 p-2">
              <p className="text-base font-bold text-red-400">{quickStatus?.pendingTotal?.queueFailed ?? '—'}</p>
              <p className="text-[10px] text-gray-500">File échec</p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-850 bg-gray-950 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-400">Dernière sauvegarde SQLite</p>
              <p className="mt-2 text-sm font-bold text-white">{quickStatus?.lastBackupSqlite ? fmtDate(quickStatus.lastBackupSqlite.createdAt) : 'Aucune'}</p>
            </div>
            <HardDrive className="h-6 w-6 text-emerald-400" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-300">
            <div className="rounded-xl bg-gray-900 p-2">
              <p className="text-[10px] text-gray-500">Taille</p>
              <p className="mt-1 font-semibold text-white">{quickStatus?.lastBackupSqlite ? fmtBytes(quickStatus.lastBackupSqlite.size) : '—'}</p>
            </div>
            <div className="rounded-xl bg-gray-900 p-2">
              <p className="text-[10px] text-gray-500">Sauvegardes</p>
              <p className="mt-1 font-semibold text-white">{coherentTables.length}</p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-850 bg-gray-950 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-400">Dernière sauvegarde Supabase</p>
              <p className="mt-2 text-sm font-bold text-white">{quickStatus?.lastBackupSupabase ? fmtDate(quickStatus.lastBackupSupabase.createdAt) : 'Aucune'}</p>
            </div>
            <Cloud className="h-6 w-6 text-sky-400" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-300">
            <div className="rounded-xl bg-gray-900 p-2">
              <p className="text-[10px] text-gray-500">Taille</p>
              <p className="mt-1 font-semibold text-white">{quickStatus?.lastBackupSupabase ? fmtBytes(quickStatus.lastBackupSupabase.size) : '—'}</p>
            </div>
            <div className="rounded-xl bg-gray-900 p-2">
              <p className="text-[10px] text-gray-500">Worker sync</p>
              <p className={`mt-1 font-semibold ${lastSyncStatus?.worker?.running ? 'text-emerald-400' : 'text-red-400'}`}>
                {lastSyncStatus ? (lastSyncStatus.worker?.running ? 'Actif' : 'Inactif') : '—'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* COHERENCE REPORT */}
      {coherence && (
        <div className="rounded-3xl border border-gray-850 bg-gray-950 p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-400">Rapport de cohérence — SQLite ↔ Supabase</p>
              <p className="mt-1 text-xs text-gray-500">
                Généré le {fmtDate(coherence.generatedAt)} · {coherence.durationMs} ms · mode {coherence.deep ? 'complet' : 'rapide'} · {coherence.supabaseReachable ? 'Supabase joignable' : 'Supabase injoignable'}
              </p>
            </div>
            <div className={`text-sm font-black uppercase ${statusMeta[coherence.overall].cls}`}>
              {coherence.overall === 'ok' && '✅ Cohérent'}
              {coherence.overall === 'pending' && '⚠️ Synchronisation en attente'}
              {coherence.overall === 'incoherent' && '❌ Incohérences détectées'}
              {coherence.overall === 'unknown' && '❓ Supabase injoignable'}
            </div>
          </div>

          {/* SUMMARY BAR */}
          <div className="mt-4 grid grid-cols-4 gap-2 text-center">
            {[
              { n: coherence.summary.ok, label: 'Cohérents', cls: 'bg-emerald-950/40 text-emerald-400' },
              { n: coherence.summary.pending, label: 'En attente', cls: 'bg-amber-950/40 text-amber-400' },
              { n: coherence.summary.incoherent, label: 'Incohérents', cls: 'bg-red-950/40 text-red-400' },
              { n: coherence.summary.unknown, label: 'Injoignables', cls: 'bg-gray-900 text-gray-400' },
            ].map(s => (
              <div key={s.label} className={`rounded-2xl p-3 ${s.cls}`}>
                <p className="text-2xl font-black">{s.n}</p>
                <p className="text-[10px] uppercase tracking-wider opacity-80">{s.label}</p>
              </div>
            ))}
          </div>

          {coherence.pendingTotal.changelog + coherence.pendingTotal.deletions > 0 && (
            <p className="mt-3 text-xs text-amber-300 bg-amber-950/30 border border-amber-700/30 rounded-xl p-3">
              {coherence.pendingTotal.changelog} changement(s) et {coherence.pendingTotal.deletions} suppression(s) en attente de poussée vers Supabase. Déclenchez la synchronisation (Console → Sync) puis relancez le contrôle.
            </p>
          )}

          {/* PER-TABLE TABLE */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-900 text-gray-400 font-mono text-[9px] uppercase border-b border-gray-800">
                <tr>
                  <th className="p-3">Table</th>
                  <th className="p-3">Statut</th>
                  <th className="p-3">SQLite</th>
                  <th className="p-3">Supabase</th>
                  <th className="p-3">Uniquement local</th>
                  <th className="p-3">Uniquement cloud</th>
                  <th className="p-3">Versions</th>
                  <th className="p-3">En attente</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-850">
                {coherence.tables.map(t => {
                  const meta = statusMeta[t.status];
                  const expanded = expandedTables.has(t.table);
                  const pending = t.pendingCreates + t.pendingUpdates + t.pendingDeletes;
                  return (
                    <React.Fragment key={t.table}>
                      <tr className="hover:bg-gray-900/30 transition cursor-pointer" onClick={() => toggleTable(t.table)}>
                        <td className="p-3 font-mono text-gray-200">{t.table}</td>
                        <td className="p-3">
                          <span className={`inline-flex items-center gap-1.5 font-semibold ${meta.cls}`}>
                            {t.status === 'ok' ? '✅' : t.status === 'pending' ? '⚠️' : t.status === 'incoherent' ? '❌' : '❓'}
                            <span>{meta.label}</span>
                          </span>
                        </td>
                        <td className="p-3 font-mono text-gray-300">{t.sqliteCount}</td>
                        <td className="p-3 font-mono text-gray-300">{t.supabaseCount ?? '—'}</td>
                        <td className={`p-3 font-mono ${t.localOnlyCount > 0 ? 'text-amber-400' : 'text-gray-600'}`}>{t.localOnlyCount}</td>
                        <td className={`p-3 font-mono ${t.remoteOnlyCount > 0 ? 'text-red-400' : 'text-gray-600'}`}>{t.remoteOnlyCount}</td>
                        <td className={`p-3 font-mono ${t.versionMismatchCount > 0 ? 'text-red-400' : 'text-gray-600'}`}>{t.versionMismatchCount}</td>
                        <td className={`p-3 font-mono ${pending > 0 ? 'text-amber-400' : 'text-gray-600'}`}>{pending}</td>
                        <td className="p-3">
                          {expanded ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-gray-950/60">
                          <td colSpan={9} className="p-4">
                            <div className="space-y-3 text-xs">
                              <div className="rounded-2xl bg-gray-900 p-3">
                                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Cause</p>
                                <p className="text-gray-200">{t.cause}</p>
                              </div>
                              <div className="rounded-2xl bg-gray-900 p-3">
                                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Recommandation</p>
                                <p className="text-gray-200">{t.recommendation}</p>
                              </div>
                              <div className="rounded-2xl bg-gray-900 p-3">
                                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Action</p>
                                <p className="text-gray-200">{t.action}</p>
                              </div>
                              {t.issues.length > 0 && (
                                <div className="rounded-2xl bg-gray-900 p-3">
                                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Détail des écarts ({t.issues.length} affichés / max 100)</p>
                                  <div className="max-h-48 overflow-y-auto space-y-1">
                                    {t.issues.map((issue, i) => (
                                      <div key={i} className="flex items-center gap-2 font-mono text-[11px] text-gray-300 bg-gray-950/60 rounded-lg px-2 py-1">
                                        <span className={issue.type === 'remote_only' ? 'text-red-400' : issue.type === 'version_mismatch' ? 'text-amber-400' : 'text-sky-400'}>
                                          {issue.type === 'local_only' ? 'LOCAL SEUL' : issue.type === 'remote_only' ? 'CLOUD SEUL' : 'VERSION'}
                                        </span>
                                        <span>{issue.id}</span>
                                        {issue.localVersion !== undefined && (
                                          <span className="text-gray-500">
                                            v{issue.localVersion} → v{issue.remoteVersion}
                                            {issue.localUpdatedAt && issue.remoteUpdatedAt ? ` · ${new Date(issue.localUpdatedAt).toLocaleString('fr-FR')} vs ${new Date(issue.remoteUpdatedAt).toLocaleString('fr-FR')}` : ''}
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* BACKUPS TABLE */}
      <div className="rounded-3xl border border-gray-850 bg-gray-950 p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-400">Sauvegardes gérées ({backups.length})</p>
            <p className="mt-1 text-xs text-gray-500">Checksum SHA-256 vérifié avant toute restauration. Les 10 dernières sauvegardes par type sont conservées.</p>
          </div>
          <History className="h-5 w-5 text-slate-400" />
        </div>
        {loading ? (
          <div className="py-10 text-center text-sm text-gray-500 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
          </div>
        ) : backups.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">
            Aucune sauvegarde gérée. Cliquez sur « Sauvegarder SQLite » ou « Sauvegarder Supabase » pour créer la première.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-900 text-gray-400 font-mono text-[9px] uppercase border-b border-gray-800">
                <tr>
                  <th className="p-3">ID</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Date (UTC)</th>
                  <th className="p-3">Taille</th>
                  <th className="p-3">Statut</th>
                  <th className="p-3">Checksum</th>
                  <th className="p-3">Version</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-850 font-mono">
                {backups.map(b => {
                  const v = verifyResults[b.id];
                  return (
                    <tr key={b.id} className="hover:bg-gray-900/30 transition">
                      <td className="p-3 text-gray-200">{b.id}</td>
                      <td className="p-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${b.type === 'sqlite' ? 'bg-emerald-950/60 text-emerald-400' : 'bg-sky-950/60 text-sky-400'}`}>
                          {b.type === 'sqlite' ? <HardDrive className="w-3 h-3" /> : <Cloud className="w-3 h-3" />}
                          {b.type === 'sqlite' ? 'SQLite' : 'Supabase'}
                        </span>
                      </td>
                      <td className="p-3 text-gray-400">{fmtDate(b.createdAt)}</td>
                      <td className="p-3 text-gray-300">{fmtBytes(b.size)}</td>
                      <td className="p-3">
                        <span className={`inline-flex items-center gap-1 font-semibold ${b.status === 'verified' ? 'text-emerald-400' : b.status === 'error' ? 'text-red-400' : 'text-gray-400'}`}>
                          {b.status === 'verified' ? <CheckCircle2 className="w-3.5 h-3.5" /> : b.status === 'error' ? <XCircle className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                          {b.status}
                        </span>
                        {v && <p className={`text-[10px] mt-0.5 ${v.ok ? 'text-emerald-500' : 'text-red-400'}`}>{v.message}</p>}
                      </td>
                      <td className="p-3 text-gray-500" title={b.checksum}>{b.checksum ? `${b.checksum.slice(0, 12)}…` : '—'}</td>
                      <td className="p-3 text-gray-500">{b.baseVersion || b.version || '—'}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <a
                            href={downloadBackupUrl(b.id)}
                            title="Télécharger"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-sky-300 hover:bg-gray-800 transition"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                          <button
                            onClick={() => handleVerify(b)}
                            title="Vérifier (checksum + intégrité)"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-300 hover:bg-gray-800 transition"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openRestore(b)}
                            title="Restaurer"
                            disabled={b.status === 'error'}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-violet-300 hover:bg-gray-800 transition disabled:opacity-30"
                          >
                            <ArrowDownToLine className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(b)}
                            disabled={deletingId === b.id}
                            title="Supprimer"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-300 hover:bg-gray-800 transition disabled:opacity-30"
                          >
                            {deletingId === b.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* RESTORE MODAL */}
      <AnimatePresence>
        {restoreTarget && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => { if (restorePhase !== 'running') setRestoreTarget(null); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-2xl rounded-3xl border border-gray-800 bg-gray-950 p-6 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold uppercase tracking-wider text-gray-300 font-mono flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-violet-400" /> Restauration — {restoreTarget.id}
                </h4>
                {restorePhase !== 'running' && (
                  <button onClick={() => setRestoreTarget(null)} className="text-gray-500 hover:text-white">✕</button>
                )}
              </div>

              <p className="mt-2 text-xs text-gray-400">
                Sauvegarde {restoreTarget.type === 'sqlite' ? 'SQLite (locale)' : 'Supabase (cloud)'} du {fmtDate(restoreTarget.createdAt)} · {fmtBytes(restoreTarget.size)} · checksum {restoreTarget.checksum.slice(0, 12)}…
              </p>

              {restorePhase === 'confirm' && (
                <div className="mt-5 space-y-4">
                  <div className={`rounded-2xl border p-4 text-xs ${restoreTarget.type === 'sqlite' ? 'border-amber-700/40 bg-amber-950/30 text-amber-200' : 'border-sky-700/40 bg-sky-950/30 text-sky-200'}`}>
                    <p className="font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" /> Avertissement
                    </p>
                    {restoreTarget.type === 'sqlite' ? (
                      <p>
                        La restauration <strong>remplace TOUTES les données locales</strong> par le contenu de cette sauvegarde :
                        une sauvegarde de sécurité de l'état actuel sera créée automatiquement, les files de synchronisation seront purgées,
                        puis un contrôle de cohérence avant/après sera effectué.
                      </p>
                    ) : (
                      <p>
                        La restauration <strong>vide puis ré-écrit TOUTES les tables Supabase</strong> (par ordre de dépendance FK) à partir de cette sauvegarde.
                        Une sauvegarde de sécurité locale sera créée automatiquement et un contrôle de cohérence avant/après sera effectué.
                        L'opération est <strong>irréversible</strong> côté cloud.
                      </p>
                    )}
                  </div>
                  <label className="flex items-start gap-3 text-xs text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={restoreConfirm}
                      onChange={e => setRestoreConfirm(e.target.checked)}
                      className="mt-0.5 accent-violet-500"
                    />
                    <span>
                      J'ai compris que cette opération remplace les données {restoreTarget.type === 'sqlite' ? 'locales (SQLite)' : 'cloud (Supabase)'} par la sauvegarde « {restoreTarget.id} ».
                    </span>
                  </label>
                  <div className="flex justify-end gap-2 pt-2">
                    <button onClick={() => setRestoreTarget(null)} className="px-4 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-750 text-xs font-semibold text-gray-300 transition">
                      Annuler
                    </button>
                    <button
                      onClick={runRestore}
                      disabled={!restoreConfirm}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-xs font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ArrowDownToLine className="w-4 h-4" /> Lancer la restauration sécurisée
                    </button>
                  </div>
                </div>
              )}

              {restorePhase === 'running' && (
                <div className="mt-6 space-y-3">
                  <div className="flex items-center gap-3 text-sm text-gray-300">
                    <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
                    Restauration en cours — vérification, sauvegarde de sécurité, restauration, contrôle de cohérence…
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <FileJson className="w-4 h-4" /> Cette opération peut prendre plusieurs minutes selon la volumétrie.
                  </div>
                </div>
              )}

              {restorePhase === 'done' && (
                <div className="mt-5 space-y-4">
                  {restoreError ? (
                    <div className="rounded-2xl border border-red-600/20 bg-red-950/60 p-4 text-sm text-red-200 flex items-start gap-2">
                      <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {restoreError}
                    </div>
                  ) : restoreReport && (
                    <>
                      <div className={`rounded-2xl border p-4 text-sm flex items-start gap-3 ${restoreReport.success ? 'border-emerald-700/40 bg-emerald-950/40 text-emerald-200' : 'border-red-700/40 bg-red-950/40 text-red-200'}`}>
                        {restoreReport.success ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <XCircle className="w-5 h-5 flex-shrink-0" />}
                        <div>
                          <p className="font-bold">{restoreReport.success ? 'Restauration réussie' : 'Restauration avec erreurs'}</p>
                          <p className="mt-1 text-xs opacity-90">{restoreReport.message}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="rounded-2xl bg-gray-900 p-3">
                          <p className="text-[10px] uppercase text-gray-500">Vérification</p>
                          <p className={`mt-1 font-bold ${restoreReport.verified ? 'text-emerald-400' : 'text-red-400'}`}>{restoreReport.verified ? 'Checksum OK' : 'Échec'}</p>
                        </div>
                        <div className="rounded-2xl bg-gray-900 p-3">
                          <p className="text-[10px] uppercase text-gray-500">Sauvegarde de sécurité</p>
                          <p className="mt-1 font-bold text-white">{restoreReport.safetyBackupId || '—'}</p>
                        </div>
                        <div className="rounded-2xl bg-gray-900 p-3">
                          <p className="text-[10px] uppercase text-gray-500">Intégrité SQLite</p>
                          <p className={`mt-1 font-bold ${restoreReport.integrity?.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                            {restoreReport.integrity ? (restoreReport.integrity.ok ? 'OK' : `ÉCHEC: ${restoreReport.integrity.details}`) : '—'}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-gray-900 p-3">
                          <p className="text-[10px] uppercase text-gray-500">Lignes restaurées</p>
                          <p className="mt-1 font-bold text-white">{restoreReport.tables.restored} / {restoreReport.tables.wiped} tables</p>
                        </div>
                      </div>

                      <div className="grid gap-3 lg:grid-cols-2 text-xs">
                        <div className="rounded-2xl bg-gray-900 p-3">
                          <p className="text-[10px] uppercase text-gray-500">Cohérence AVANT</p>
                          <CoherenceMini report={restoreReport.coherenceBefore} />
                        </div>
                        <div className="rounded-2xl bg-gray-900 p-3">
                          <p className="text-[10px] uppercase text-gray-500">Cohérence APRÈS</p>
                          <CoherenceMini report={restoreReport.coherenceAfter} />
                        </div>
                      </div>
                    </>
                  )}
                  <div className="flex justify-end gap-2 pt-1">
                    <button onClick={() => setRestoreTarget(null)} className="px-4 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-750 text-xs font-semibold text-gray-300 transition">
                      Fermer
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function CoherenceMini({ report }: { report: CoherenceReport | null }) {
  if (!report) return <p className="mt-1 text-gray-500">Non exécuté</p>;
  const meta = statusMeta[report.overall];
  return (
    <div className="mt-1">
      <p className={`font-bold ${meta.cls}`}>
        {report.overall === 'ok' && '✅ Cohérent'}
        {report.overall === 'pending' && '⚠️ Sync en attente'}
        {report.overall === 'incoherent' && '❌ Incohérent'}
        {report.overall === 'unknown' && '❓ Injoignable'}
      </p>
      <p className="mt-1 text-gray-500">
        {report.summary.ok} OK · {report.summary.pending} attente · {report.summary.incoherent} écart(s) · {report.durationMs} ms
      </p>
    </div>
  );
}
