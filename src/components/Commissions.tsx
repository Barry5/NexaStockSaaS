import { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users, UserPlus, Search, Filter, X, Check, AlertTriangle, Clock,
  DollarSign, ArrowLeft, Plus, TrendingUp, BarChart3, CreditCard,
  Printer, FileText, Percent, Circle, Trash2, Ban, Undo2, Gift,
  Phone, Mail, MapPin, Building, Award, Star, ChevronDown, ChevronRight,
  MoreHorizontal, Edit3, Download, RefreshCw, Wallet, PiggyBank,
  TrendingDown, Eye, Settings2, Calendar
} from 'lucide-react';
import { useDB, useApp } from '../context';
import { formatCurrency } from '../utils';
import { ConfirmDialog } from './shared/ConfirmDialog';
import {
  AFFILIATE_STATUS_LABELS, COMMISSION_STATUS_LABELS,
  COMMISSION_RULE_TYPES, COMMISSION_PAYMENT_METHODS, CHART_COLORS
} from '../constants';
import type { Affiliate, CommissionRule, CommissionLedgerEntry, CommissionPayment } from '../types';

function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('nexastock_token');
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

type CommissionsTab = 'dashboard' | 'affiliates' | 'affiliate-detail' | 'rules' | 'payments';

const COLORS = CHART_COLORS;
const statusColors: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  available: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  to_pay: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  partially_paid: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  paid: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  cancelled: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  recalculated: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
};

function StatusBadge({ status, labels }: { status: string; labels: Record<string, string> }) {
  return (
    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${statusColors[status] || 'bg-gray-500/10 text-gray-400'} whitespace-nowrap font-mono uppercase tracking-wider`}>
      {labels[status] || status}
    </span>
  );
}

function formatDate(d: string) {
  if (!d) return '-';
  try { return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return d; }
}

function formatDateTime(d: string) {
  if (!d) return '-';
  try { return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return d; }
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] uppercase tracking-wider text-gray-500 font-mono">{label}</span>
        <div className={`w-7 h-7 ${color}/10 rounded-lg flex items-center justify-center`}>
          <Icon className={`w-3.5 h-3.5 text-${color.replace('bg-', '')}`} />
        </div>
      </div>
      <p className="text-lg font-bold font-mono text-white">{value}</p>
    </div>
  );
}

function DashboardView({ onNavigate }: { onNavigate: (tab: CommissionsTab, id?: string) => void }) {
  const { db } = useDB();
  const { activeTenantId } = useApp();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    authFetch(`/api/commissions/v2/dashboard/enhanced?tenantId=${activeTenantId}`)
      .then(async r => {
        if (!r.ok) { const e = await r.json().catch(() => ({ error: r.statusText })); throw new Error(e.error || 'Erreur serveur'); }
        return r.json();
      })
      .then(setData)
      .catch(err => console.error('Commission dashboard fetch error:', err));
  }, [activeTenantId]);

  const formatted = useCallback((v: number) => {
    const t = db.tenants.find((t: any) => t.id === activeTenantId);
    return formatCurrency(v, t?.currency || 'GNF');
  }, [db.tenants, activeTenantId]);

  const maxComm = useMemo(() => {
    if (!data?.monthlyStats?.length) return 1;
    return Math.max(...data.monthlyStats.map((m: any) => m.comm || 0), 1);
  }, [data?.monthlyStats]);

  if (!data) return <div className="flex justify-center py-16"><div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" /></div>;

  const { stats, topAffiliates, topProducts, statusBreakdown, monthlyStats } = data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-lg font-bold text-white">Commissions</h1><p className="text-xs text-gray-500">Tableau de bord des apporteurs d'affaires</p></div>
        <div className="flex gap-2">
          <button onClick={() => onNavigate('affiliates')} className="bg-gray-800 hover:bg-gray-700 text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Apporteurs</button>
          <button onClick={() => onNavigate('rules')} className="bg-gray-800 hover:bg-gray-700 text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1"><Settings2 className="w-3.5 h-3.5" /> Règles</button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Apporteurs actifs" value={String(stats.activeAffiliates)} icon={Users} color="bg-blue-500" />
        <StatCard label="À payer" value={formatted(stats.totalToPay)} icon={Wallet} color="bg-amber-500" />
        <StatCard label="Déjà payé" value={formatted(stats.totalPaid)} icon={PiggyBank} color="bg-emerald-500" />
        <StatCard label="Ventes ajd" value={`${stats.totalSalesToday} (${stats.salesWithCommission} comm.)`} icon={BarChart3} color="bg-violet-500" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
          <p className="text-[9px] uppercase text-gray-500 font-mono mb-1">Commission ajd</p>
          <p className="text-xs font-mono text-emerald-400">{formatted(stats.todayCommission)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
          <p className="text-[9px] uppercase text-gray-500 font-mono mb-1">Commission mois</p>
          <p className="text-xs font-mono text-emerald-400">{formatted(stats.monthCommission)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
          <p className="text-[9px] uppercase text-gray-500 font-mono mb-1">Ventes sans comm.</p>
          <p className="text-xs font-mono text-gray-400">{stats.salesWithoutCommission}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
          <p className="text-[9px] uppercase text-gray-500 font-mono mb-1">Taux d'utilisation</p>
          <p className="text-xs font-mono text-blue-400">{stats.totalSalesToday > 0 ? ((stats.salesWithCommission / stats.totalSalesToday) * 100).toFixed(0) : 0}%</p>
        </div>
      </div>

      {/* Top affiliates */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider font-mono mb-3">Top 10 apporteurs</h3>
        {topAffiliates.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-6">Aucun apporteur pour le moment</p>
        ) : (
          <div className="space-y-1">
            {topAffiliates.map((a: any, i: number) => (
              <div key={a.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-950/50 cursor-pointer" onClick={() => onNavigate('affiliate-detail', a.id)}>
                <span className="text-[10px] font-mono text-gray-600 w-5 text-center">{i + 1}</span>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                  {(a.firstName?.[0] || '?')}{(a.lastName?.[0] || '')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">{a.firstName} {a.lastName}</p>
                  <p className="text-[9px] text-gray-500">{a.saleCount} vente(s)</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold font-mono text-emerald-400">{formatted(a.totalCommission)}</p>
                  <p className="text-[8px] text-gray-600">dû: {formatted(a.totalCommission - a.totalPaid)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top products */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider font-mono mb-3">Top produits par commission</h3>
        {!topProducts?.length ? (
          <p className="text-xs text-gray-500 text-center py-6">Aucune commission sur produit</p>
        ) : (
          <div className="space-y-1">
            {topProducts.slice(0, 8).map((p: any, i: number) => (
              <div key={p.productName} className="flex items-center gap-3 p-2 rounded-lg">
                <span className="text-[10px] font-mono text-gray-600 w-4">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white truncate">{p.productName}</p>
                  <p className="text-[9px] text-gray-500">{p.totalQty} unité(s)</p>
                </div>
                <span className="text-xs font-mono font-bold text-amber-400">{formatted(p.totalComm)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status breakdown */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider font-mono mb-3">Statut des commissions</h3>
          {!statusBreakdown?.length ? (
            <p className="text-xs text-gray-500 text-center py-4">Aucune donnée</p>
          ) : (
            <div className="space-y-2">
              {statusBreakdown.map((s: any) => (
                <div key={s.status} className="flex items-center gap-2">
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border whitespace-nowrap font-mono uppercase tracking-wider text-gray-300 border-gray-700 bg-gray-800">
                    {COMMISSION_STATUS_LABELS[s.status] || s.status}
                  </span>
                  <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${s.status === 'paid' ? 'bg-emerald-500' : s.status === 'pending' ? 'bg-amber-500' : s.status === 'partially_paid' ? 'bg-violet-500' : 'bg-blue-500'}`}
                      style={{ width: `${(s.cnt / Math.max(...statusBreakdown.map((x: any) => x.cnt))) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-gray-400 w-12 text-right">{s.cnt}</span>
                  <span className="text-[10px] font-mono font-bold text-white w-20 text-right">{formatted(s.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Monthly evolution */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider font-mono mb-3">Évolution mensuelle</h3>
          {!monthlyStats?.length ? (
            <p className="text-xs text-gray-500 text-center py-4">Aucune donnée</p>
          ) : (
            <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
              {monthlyStats.slice().reverse().map((m: any) => (
                <div key={m.month} className="flex items-center gap-2">
                  <span className="text-[9px] font-mono text-gray-500 w-14 flex-shrink-0">{m.month}</span>
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center gap-1">
                      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500/70 rounded-full transition-all" style={{ width: `${(m.comm / maxComm) * 100}%` }} />
                      </div>
                      <span className="text-[8px] font-mono text-emerald-400 w-16 text-right">{formatted(m.comm)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500/70 rounded-full transition-all" style={{ width: `${(m.paid / maxComm) * 100}%` }} />
                      </div>
                      <span className="text-[8px] font-mono text-amber-400 w-16 text-right">{formatted(m.paid)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AffiliatesList({ onSelect }: { onSelect: (id: string) => void }) {
  const { db, handleUpdateDb, addNotification } = useDB();
  const { activeTenantId } = useApp();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', address: '', city: '', country: 'Guinée', company: '', idNumber: '', notes: '' });

  const affiliates = useMemo(() => {
    let list = (db.affiliates || []).filter((a: Affiliate) => a.tenantId === activeTenantId);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((a: Affiliate) =>
        `${a.firstName} ${a.lastName}`.toLowerCase().includes(q) || a.phone?.includes(q) || a.code?.toLowerCase().includes(q)
      );
    }
    if (statusFilter) list = list.filter((a: Affiliate) => a.status === statusFilter);
    return list;
  }, [db.affiliates, activeTenantId, search, statusFilter]);

  const handleCreate = async () => {
    if (!form.firstName || !form.lastName) { addNotification('Prénom et nom requis', 'error'); return; }
    try {
      const res = await authFetch('/api/commissions/affiliates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const aff = await res.json();
      handleUpdateDb({ ...db, affiliates: [...(db.affiliates || []), aff] });
      setShowForm(false);
      setForm({ firstName: '', lastName: '', phone: '', email: '', address: '', city: '', country: 'Guinée', company: '', idNumber: '', notes: '' });
      addNotification(aff.notification?.text || 'Apporteur créé', aff.notification?.type as any);
    } catch (err: any) { addNotification(err.message || 'Erreur', 'error'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-bold text-white">Apporteurs d'affaires</h2><p className="text-xs text-gray-500">{affiliates.length} apporteur(s)</p></div>
        <button onClick={() => setShowForm(true)} className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1">
          <UserPlus className="w-3.5 h-3.5" /> Nouveau
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-xs text-white">
          <option value="">Tous</option>
          <option value="active">Actif</option>
          <option value="suspended">Suspendu</option>
          <option value="blocked">Bloqué</option>
        </select>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-bold text-white uppercase font-mono">Nouvel apporteur</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input value={form.firstName} onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))} placeholder="Prénom *" className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
              <input value={form.lastName} onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))} placeholder="Nom *" className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
              <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="Téléphone" className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
              <input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="Email" className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
              <input value={form.company} onChange={e => setForm(p => ({ ...p, company: e.target.value }))} placeholder="Entreprise" className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
              <input value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} placeholder="Ville" className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
              <input value={form.idNumber} onChange={e => setForm(p => ({ ...p, idNumber: e.target.value }))} placeholder="N° d'identification" className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
              <input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="Adresse" className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
              <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Observations" className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setShowForm(false)} className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold px-3 py-1.5 rounded-lg">Annuler</button>
              <button onClick={handleCreate} className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-1.5 rounded-lg">Créer l'apporteur</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {affiliates.map((aff: Affiliate) => (
          <motion.div key={aff.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
            onClick={() => onSelect(aff.id)}
            className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition cursor-pointer">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                {aff.firstName[0]}{aff.lastName[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-bold text-white truncate">{aff.firstName} {aff.lastName}</h4>
                  <StatusBadge status={aff.status} labels={AFFILIATE_STATUS_LABELS} />
                </div>
                <p className="text-[10px] text-gray-500 font-mono">{aff.code}</p>
                {aff.phone && <p className="text-[10px] text-gray-400 flex items-center gap-1 mt-1"><Phone className="w-3 h-3" />{aff.phone}</p>}
                {aff.email && <p className="text-[10px] text-gray-400 flex items-center gap-1"><Mail className="w-3 h-3" />{aff.email}</p>}
                {aff.company && <p className="text-[10px] text-gray-400 flex items-center gap-1"><Building className="w-3 h-3" />{aff.company}</p>}
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-800 flex items-center justify-between">
              <span className="text-[10px] text-gray-500">Solde</span>
              <span className="text-sm font-bold font-mono text-emerald-400">{(aff as any).balance?.toFixed(0) || '0'}</span>
            </div>
          </motion.div>
        ))}
      </div>
      {affiliates.length === 0 && !showForm && (
        <div className="text-center py-12 text-gray-500">
          <Users className="w-10 h-10 mx-auto mb-2 text-gray-700" />
          <p className="text-sm">Aucun apporteur</p>
          <button onClick={() => setShowForm(true)} className="mt-3 text-xs text-blue-400 hover:text-blue-300">Créer le premier apporteur</button>
        </div>
      )}
    </div>
  );
}

function AffiliateDetail({ affiliateId, onBack }: { affiliateId: string; onBack: () => void }) {
  const { db, handleUpdateDb, addNotification } = useDB();
  const { activeTenantId } = useApp();
  const [affiliate, setAffiliate] = useState<Affiliate | null>(null);
  const [ledger, setLedger] = useState<CommissionLedgerEntry[]>([]);
  const [balance, setBalance] = useState(0);
  const [editForm, setEditForm] = useState(false);
  const [showPayForm, setShowPayForm] = useState(false);
  const [showCalcForm, setShowCalcForm] = useState(false);
  const [calcInvoiceId, setCalcInvoiceId] = useState('');
  const [activeLedgerTab, setActiveLedgerTab] = useState('all');

  useEffect(() => {
    const aff = db.affiliates?.find((a: Affiliate) => a.id === affiliateId);
    setAffiliate(aff || null);
    authFetch(`/api/commissions/ledger/${affiliateId}`)
      .then(r => r.json())
      .then(d => { setLedger(d.entries || []); setBalance(d.balance || 0); })
      .catch(() => {});
  }, [affiliateId, db]);

  const filteredLedger = useMemo(() => {
    if (activeLedgerTab === 'all') return ledger;
    if (activeLedgerTab === 'credits') return ledger.filter(e => e.credit > 0);
    if (activeLedgerTab === 'debits') return ledger.filter(e => e.debit > 0);
    return ledger.filter(e => e.status === activeLedgerTab);
  }, [ledger, activeLedgerTab]);

  const formatted = useCallback((v: number) => formatCurrency(v, 'GNF'), []);

  const handleUpdateStatus = async (status: string) => {
    try {
      const res = await authFetch(`/api/commissions/affiliates/${affiliateId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status })
      });
      const updated = await res.json();
      setAffiliate(updated);
      handleUpdateDb({ ...db, affiliates: (db.affiliates || []).map((a: Affiliate) => a.id === affiliateId ? updated : a) });
      addNotification(`Statut changé: ${AFFILIATE_STATUS_LABELS[status] || status}`);
    } catch { addNotification('Erreur', 'error'); }
  };

  const handleAddLedgerEntry = async (type: string, credit: number, debit: number, description: string) => {
    try {
      await authFetch('/api/commissions/ledger', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ affiliateId, type, credit, debit, description })
      });
      const d = await authFetch(`/api/commissions/ledger/${affiliateId}`).then(r => r.json());
      setLedger(d.entries || []); setBalance(d.balance || 0);
      addNotification('Écriture comptable ajoutée');
    } catch { addNotification('Erreur', 'error'); }
  };

  const handleCalculateCommission = async () => {
    if (!calcInvoiceId) { addNotification('Référence de facture requise', 'error'); return; }
    try {
      const inv = db.invoices?.find((i: any) => i.invoiceNumber === calcInvoiceId || i.id === calcInvoiceId);
      if (!inv) { addNotification('Facture non trouvée', 'error'); return; }
      const res = await authFetch('/api/commissions/calculate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ affiliateId, invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, customerName: inv.customerName, items: inv.items || [] })
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const data = await res.json();
      const d = await authFetch(`/api/commissions/ledger/${affiliateId}`).then(r => r.json());
      setLedger(d.entries || []); setBalance(d.balance || 0);
      setCalcInvoiceId('');
      setShowCalcForm(false);
      addNotification(data.notification.text, data.notification.type as any);
    } catch (err: any) { addNotification(err.message || 'Erreur', 'error'); }
  };

  if (!affiliate) return <div className="text-center py-12 text-gray-500">Apporteur introuvable</div>;

  const pendingPay = ledger.filter(e => e.credit > 0 && ['pending', 'available', 'to_pay'].includes(e.status)).reduce((a, e) => a + e.credit, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center text-sm font-bold text-white">{affiliate.firstName[0]}{affiliate.lastName[0]}</div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white">{affiliate.firstName} {affiliate.lastName}</h2>
              <StatusBadge status={affiliate.status} labels={AFFILIATE_STATUS_LABELS} />
            </div>
            <p className="text-[10px] text-gray-500 font-mono">{affiliate.code}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {affiliate.status === 'active' && <button onClick={() => handleUpdateStatus('suspended')} className="bg-amber-600/10 text-amber-400 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-amber-500/20">Suspendre</button>}
          {affiliate.status === 'suspended' && <button onClick={() => handleUpdateStatus('active')} className="bg-emerald-600/10 text-emerald-400 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-emerald-500/20">Réactiver</button>}
          {affiliate.status !== 'blocked' && <button onClick={() => handleUpdateStatus('blocked')} className="bg-red-600/10 text-red-400 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-red-500/20">Bloquer</button>}
          <button onClick={() => setShowCalcForm(true)} className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1"><Plus className="w-3 h-3" /> Commission</button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
          <p className="text-[9px] uppercase text-gray-500 font-mono">Solde disponible</p>
          <p className="text-lg font-bold font-mono text-emerald-400 mt-1">{formatted(balance)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
          <p className="text-[9px] uppercase text-gray-500 font-mono">En attente</p>
          <p className="text-lg font-bold font-mono text-amber-400 mt-1">{formatted(pendingPay)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
          <p className="text-[9px] uppercase text-gray-500 font-mono">Total crédité</p>
          <p className="text-lg font-bold font-mono text-white mt-1">{formatted(ledger.filter(e => e.credit > 0).reduce((a, e) => a + e.credit, 0))}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
          <p className="text-[9px] uppercase text-gray-500 font-mono">Total payé</p>
          <p className="text-lg font-bold font-mono text-blue-400 mt-1">{formatted(ledger.filter(e => e.debit > 0).reduce((a, e) => a + e.debit, 0))}</p>
        </div>
      </div>

      {affiliate.phone || affiliate.email || affiliate.company || affiliate.city ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex flex-wrap gap-4 text-[10px] text-gray-400">
          {affiliate.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {affiliate.phone}</span>}
          {affiliate.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {affiliate.email}</span>}
          {affiliate.company && <span className="flex items-center gap-1"><Building className="w-3 h-3" /> {affiliate.company}</span>}
          {affiliate.city && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {affiliate.city}</span>}
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {['all', 'credits', 'debits', 'pending', 'paid'].map(tab => (
            <button key={tab} onClick={() => setActiveLedgerTab(tab)}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition ${activeLedgerTab === tab ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
              {tab === 'all' ? 'Tout' : tab === 'credits' ? 'Crédits' : tab === 'debits' ? 'Débits' : COMMISSION_STATUS_LABELS[tab] || tab}
            </button>
          ))}
        </div>
        <button onClick={() => setShowPayForm(true)} disabled={balance <= 0}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1">
          <CreditCard className="w-3 h-3" /> Payer
        </button>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="max-h-[400px] overflow-y-auto">
          <table className="w-full text-[10px]">
            <thead className="sticky top-0 bg-gray-950">
              <tr className="text-gray-500 uppercase tracking-wider">
                <th className="text-left p-2">Date</th>
                <th className="text-left p-2">Opération</th>
                <th className="text-left p-2">Réf.</th>
                <th className="text-left p-2">Description</th>
                <th className="text-right p-2">Crédit</th>
                <th className="text-right p-2">Débit</th>
                <th className="text-right p-2">Solde</th>
                <th className="text-center p-2">Statut</th>
              </tr>
            </thead>
            <tbody>
              {filteredLedger.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-gray-600">Aucune écriture</td></tr>
              ) : filteredLedger.map((e: CommissionLedgerEntry) => (
                <tr key={e.id} className="border-t border-gray-800/50 hover:bg-gray-950/30">
                  <td className="p-2 font-mono text-gray-400 whitespace-nowrap">{formatDateTime(e.createdAt)}</td>
                  <td className="p-2"><span className="bg-gray-800 text-gray-300 px-1.5 py-0.5 rounded text-[8px] font-mono">{e.type}</span></td>
                  <td className="p-2 font-mono text-gray-500">{e.reference || '-'}</td>
                  <td className="p-2 text-gray-300 max-w-[150px] truncate">{e.description || '-'}</td>
                  <td className="p-2 text-right font-mono text-emerald-400">{e.credit > 0 ? e.credit.toFixed(0) : '-'}</td>
                  <td className="p-2 text-right font-mono text-red-400">{e.debit > 0 ? e.debit.toFixed(0) : '-'}</td>
                  <td className="p-2 text-right font-mono font-bold text-white">{e.balance.toFixed(0)}</td>
                  <td className="p-2 text-center"><StatusBadge status={e.status} labels={COMMISSION_STATUS_LABELS} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {showCalcForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-gray-900 border border-gray-800 rounded-2xl max-w-sm w-full p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2"><Plus className="w-4 h-4 text-blue-400" /> Calculer commission</h3>
                <button onClick={() => setShowCalcForm(false)} className="p-1 hover:bg-gray-800 rounded"><X className="w-4 h-4 text-gray-500" /></button>
              </div>
              <p className="text-xs text-gray-400 mb-3">Saisissez la réf. de la facture pour calculer automatiquement la commission selon les règles configurées.</p>
              <input value={calcInvoiceId} onChange={e => setCalcInvoiceId(e.target.value)} placeholder="N° de facture (ex: FAC-2026-001)" className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white mb-4" />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowCalcForm(false)} className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold px-3 py-1.5 rounded-lg">Annuler</button>
                <button onClick={handleCalculateCommission} className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-1.5 rounded-lg">Calculer</button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showPayForm && (
          <PaymentForm affiliate={affiliate} balance={balance} onDone={() => {
            setShowPayForm(false);
            authFetch(`/api/commissions/ledger/${affiliateId}`).then(r => r.json()).then(d => { setLedger(d.entries || []); setBalance(d.balance || 0); });
          }} onClose={() => setShowPayForm(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function PaymentForm({ affiliate, balance, onDone, onClose }: { affiliate: Affiliate; balance: number; onDone: () => void; onClose: () => void }) {
  const [amount, setAmount] = useState(String(balance));
  const [method, setMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const { addNotification } = useDB();

  const handleSubmit = async () => {
    const val = parseFloat(amount);
    if (!val || val <= 0 || val > balance) { addNotification('Montant invalide', 'error'); return; }
    setLoading(true);
    try {
      const res = await authFetch('/api/commissions/payments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ affiliateId: affiliate.id, amount: val, method, notes, ledgerIds: [] })
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const data = await res.json();
      if (data.notification) addNotification(data.notification.text, data.notification.type as any);
      else addNotification(`Paiement de ${val} GNF effectué`);
      onDone();
    } catch (err: any) { addNotification(err.message || 'Erreur', 'error'); }
    setLoading(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-gray-900 border border-gray-800 rounded-2xl max-w-sm w-full p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><CreditCard className="w-4 h-4 text-emerald-400" /> Paiement commission</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-800 rounded"><X className="w-4 h-4 text-gray-500" /></button>
        </div>
        <p className="text-xs text-gray-400 mb-2">{affiliate.firstName} {affiliate.lastName} — Solde: <span className="font-mono text-emerald-400">{balance.toFixed(0)} GNF</span></p>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-mono text-gray-500 block mb-1">Montant</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} max={balance} className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white font-mono" />
          </div>
          <div>
            <label className="text-[10px] font-mono text-gray-500 block mb-1">Mode de paiement</label>
            <select value={method} onChange={e => setMethod(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white">
              {COMMISSION_PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-mono text-gray-500 block mb-1">Observation</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optionnel" className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose} className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold px-4 py-2 rounded-lg">Annuler</button>
          <button onClick={handleSubmit} disabled={loading} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-lg">
            {loading ? 'Traitement...' : `Payer ${amount} GNF`}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function RulesView() {
  const { db, handleUpdateDb, addNotification } = useDB();
  const { activeTenantId } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'percentage' as string, value: '', minValue: '', maxValue: '', productId: '', category: '', campaign: '', priority: '0' });
  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null);

  const rules = useMemo(() => (db.commissionRules || []).filter((r: CommissionRule) => r.tenantId === activeTenantId), [db.commissionRules, activeTenantId]);
  const products = useMemo(() => db.products.filter((p: any) => p.tenantId === activeTenantId), [db.products, activeTenantId]);

  const handleCreate = async () => {
    if (!form.name || !form.value) { addNotification('Nom et valeur requis', 'error'); return; }
    try {
      const res = await authFetch('/api/commissions/rules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, value: parseFloat(form.value), minValue: form.minValue ? parseFloat(form.minValue) : null, maxValue: form.maxValue ? parseFloat(form.maxValue) : null, priority: parseInt(form.priority) || 0 })
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const rule = await res.json();
      handleUpdateDb({ ...db, commissionRules: [...(db.commissionRules || []), rule] });
      setShowForm(false);
      setForm({ name: '', type: 'percentage', value: '', minValue: '', maxValue: '', productId: '', category: '', campaign: '', priority: '0' });
      addNotification('Règle créée');
    } catch (err: any) { addNotification(err.message || 'Erreur', 'error'); }
  };

  const handleDelete = async (id: string) => {
    setDeleteRuleId(id);
  };

  const handleToggle = async (rule: CommissionRule) => {
    const res = await authFetch(`/api/commissions/rules/${rule.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !rule.active })
    });
    const updated = await res.json();
    handleUpdateDb({ ...db, commissionRules: (db.commissionRules || []).map((r: CommissionRule) => r.id === rule.id ? updated : r) });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-bold text-white">Règles de commission</h2><p className="text-xs text-gray-500">{rules.length} règle(s) configurée(s)</p></div>
        <button onClick={() => setShowForm(true)} className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Nouvelle règle</button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-bold text-white uppercase font-mono">Nouvelle règle</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Nom de la règle *" className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white">
                {Object.entries(COMMISSION_RULE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input type="number" value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))} placeholder="Valeur *" className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white font-mono" />
              {form.type === 'margin' && <><input type="number" value={form.minValue} onChange={e => setForm(p => ({ ...p, minValue: e.target.value }))} placeholder="Marge min." className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" /></>}
              {form.type === 'fixed_product' && (
                <select value={form.productId} onChange={e => setForm(p => ({ ...p, productId: e.target.value }))} className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white">
                  <option value="">Sélectionner un produit</option>
                  {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
              {form.type === 'campaign' && <input value={form.campaign} onChange={e => setForm(p => ({ ...p, campaign: e.target.value }))} placeholder="Nom de la campagne" className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />}
              <input type="number" value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))} placeholder="Priorité (0 = haute)" className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setShowForm(false)} className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold px-3 py-1.5 rounded-lg">Annuler</button>
              <button onClick={handleCreate} className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-1.5 rounded-lg">Créer la règle</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-2">
        {rules.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Settings2 className="w-10 h-10 mx-auto mb-2 text-gray-700" />
            <p className="text-sm">Aucune règle configurée</p>
          </div>
        ) : rules.map((rule: CommissionRule) => (
          <div key={rule.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <button onClick={() => handleToggle(rule)} className={`w-8 h-5 rounded-full transition relative flex-shrink-0 ${rule.active ? 'bg-emerald-600' : 'bg-gray-700'}`}>
                <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-all ${rule.active ? 'left-4' : 'left-0.5'}`} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-xs font-bold text-white">{rule.name}</h4>
                  <span className="bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded text-[8px] font-mono">{COMMISSION_RULE_TYPES[rule.type] || rule.type}</span>
                </div>
                <p className="text-[10px] text-gray-500">Valeur: <span className="font-mono text-white">{rule.value}{rule.type === 'percentage' ? '%' : rule.type === 'margin' ? '%' : ' GNF'}</span>{rule.priority > 0 ? ` | Priorité: ${rule.priority}` : ''}</p>
              </div>
            </div>
            <button onClick={() => handleDelete(rule.id)} className="p-1.5 hover:bg-red-500/10 rounded text-red-400 flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>

      <ConfirmDialog
        isOpen={deleteRuleId !== null}
        title="Supprimer la règle"
        message="Supprimer cette règle de commission ?"
        confirmLabel="Supprimer"
        onConfirm={async () => {
          if (!deleteRuleId) return;
          await authFetch(`/api/commissions/rules/${deleteRuleId}`, { method: 'DELETE' });
          handleUpdateDb({ ...db, commissionRules: (db.commissionRules || []).filter((r: CommissionRule) => r.id !== deleteRuleId) });
          addNotification('Règle supprimée');
          setDeleteRuleId(null);
        }}
        onCancel={() => setDeleteRuleId(null)}
      />
    </div>
  );
}

function PaymentsView() {
  const { db } = useDB();
  const { activeTenantId } = useApp();
  const [payments, setPayments] = useState<CommissionPayment[]>([]);

  useEffect(() => {
    authFetch(`/api/commissions/payments?tenantId=${activeTenantId}`)
      .then(r => r.json()).then(setPayments).catch(() => {});
  }, [activeTenantId]);

  const formatted = useCallback((v: number) => formatCurrency(v, 'GNF'), []);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-white">Paiements des commissions</h2>
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-[10px]">
          <thead className="bg-gray-950 text-gray-500 uppercase tracking-wider">
            <tr>
              <th className="text-left p-3">Réf.</th>
              <th className="text-left p-3">Apporteur</th>
              <th className="text-left p-3">Date</th>
              <th className="text-right p-3">Montant</th>
              <th className="text-left p-3">Mode</th>
              <th className="text-left p-3">Par</th>
              <th className="text-left p-3">Notes</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-600">Aucun paiement</td></tr>
            ) : payments.map(p => (
              <tr key={p.id} className="border-t border-gray-800/50 hover:bg-gray-950/30">
                <td className="p-3 font-mono text-white font-bold">{p.reference}</td>
                <td className="p-3 text-gray-300">{p.affiliateName}</td>
                <td className="p-3 font-mono text-gray-400">{formatDate(p.createdAt)}</td>
                <td className="p-3 text-right font-mono font-bold text-emerald-400">{formatted(p.amount)}</td>
                <td className="p-3"><span className="bg-gray-800 text-gray-300 px-1.5 py-0.5 rounded">{p.method}</span></td>
                <td className="p-3 text-gray-400">{p.userName || '-'}</td>
                <td className="p-3 text-gray-500 max-w-[100px] truncate">{p.notes || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Commissions() {
  const [tab, setTab] = useState<CommissionsTab>('dashboard');
  const [selectedAffiliateId, setSelectedAffiliateId] = useState<string | null>(null);

  const handleNavigate = (t: CommissionsTab, id?: string) => {
    setTab(t);
    if (id) setSelectedAffiliateId(id);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto pb-1">
        {(['dashboard', 'affiliates', 'rules', 'payments'] as CommissionsTab[]).map(t => (
          <button key={t} onClick={() => handleNavigate(t)}
            className={`px-4 py-2 text-xs font-bold rounded-lg whitespace-nowrap transition ${
              tab === t ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-900 text-gray-400 hover:text-white border border-gray-800'
            }`}>
            {t === 'dashboard' ? 'Tableau de bord' : t === 'affiliates' ? 'Apporteurs' : t === 'rules' ? 'Règles' : 'Paiements'}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && <DashboardView onNavigate={handleNavigate} />}
      {tab === 'affiliates' && <AffiliatesList onSelect={(id) => handleNavigate('affiliate-detail', id)} />}
      {tab === 'affiliate-detail' && selectedAffiliateId && <AffiliateDetail affiliateId={selectedAffiliateId} onBack={() => handleNavigate('affiliates')} />}
      {tab === 'rules' && <RulesView />}
      {tab === 'payments' && <PaymentsView />}
    </div>
  );
}
