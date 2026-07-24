import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Truck, Plus, Search, X, ArrowLeft, Check, AlertTriangle, Clock,
  FileText, Printer, Download, Phone, MapPin, User, Building,
  Eye, Edit3, Ban, RefreshCw, Package, ShoppingBag, Calendar,
  ChevronDown, ChevronRight, Filter, MoreHorizontal, UserCheck,
  Car, Map, CheckCircle, XCircle, Send
} from 'lucide-react';
import { useDB, useApp } from '../context';
import { formatCurrency } from '../utils';
import { DELIVERY_ORDER_STATUS_LABELS, DELIVERY_STATUS_LABELS } from '../constants';

type DNStatus = 'draft' | 'validated' | 'in_transit' | 'delivered' | 'cancelled';

const statusColors: Record<string, string> = {
  draft: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  validated: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  in_transit: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  delivered: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  cancelled: 'bg-red-500/10 text-red-400 border-red-500/20',
};

function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('nexastock_token');
  return fetch(url, {
    ...options,
    headers: { ...options.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap font-mono uppercase tracking-wider ${statusColors[status] || 'bg-gray-500/10 text-gray-400'}`}>
      {DELIVERY_ORDER_STATUS_LABELS[status] || status}
    </span>
  );
}

function formatDate(d: string) {
  if (!d) return '-';
  try { return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; }
}

function formatTime(d: string) {
  if (!d) return '';
  try { return new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); } catch { return d; }
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

function DashboardView({ onNavigate }: { onNavigate: (tab: string, id?: string) => void }) {
  const { activeTenantId } = useApp();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    authFetch(`/api/delivery-notes/dashboard?tenantId=${activeTenantId}`)
      .then(async r => {
        if (!r.ok) { const e = await r.json().catch(() => ({ error: r.statusText })); throw new Error(e.error || 'Erreur chargement'); }
        return r.json();
      })
      .then(setData)
      .catch(err => console.error('DeliveryNotes dashboard error:', err));
  }, [activeTenantId]);

  if (!data) return <div className="flex justify-center py-16"><div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" /></div>;

  const s = data.stats;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-lg font-bold text-white">Bons de Livraison</h1><p className="text-xs text-gray-500">Gestion des livraisons et expéditions</p></div>
        <button onClick={() => onNavigate('create')} className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Nouveau BL</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total BL" value={String(s.total)} icon={FileText} color="bg-blue-500" />
        <StatCard label="En préparation" value={String(s.draftCount)} icon={Edit3} color="bg-gray-500" />
        <StatCard label="Validés" value={String(s.validatedCount)} icon={Check} color="bg-blue-500" />
        <StatCard label="En cours" value={String(s.inTransitCount)} icon={Truck} color="bg-amber-500" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Livrés" value={String(s.deliveredCount)} icon={CheckCircle} color="bg-emerald-500" />
        <StatCard label="Annulés" value={String(s.cancelledCount)} icon={XCircle} color="bg-red-500" />
        <StatCard label="Factures part. livrées" value={String(s.partiallyDeliveredInvoices)} icon={Clock} color="bg-violet-500" />
        <StatCard label="Qté restante" value={String(s.remainingQty)} icon={Package} color="bg-amber-500" />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider font-mono mb-3">BL récents</h3>
        {data.recent.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-6">Aucun bon de livraison</p>
        ) : (
          <div className="space-y-1">
            {data.recent.map((dn: any) => (
              <div key={dn.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-950/50 cursor-pointer" onClick={() => onNavigate('detail', dn.id)}>
                <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center"><Truck className="w-4 h-4 text-gray-400" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white truncate">{dn.deliveryNumber}</p>
                  <p className="text-[9px] text-gray-500 truncate">{dn.customerName || dn.invoiceNumber}</p>
                </div>
                <StatusBadge status={dn.status} />
                <span className="text-[10px] font-mono text-gray-500">{formatDate(dn.date)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DeliveryNoteList({ onNavigate }: { onNavigate: (tab: string, id?: string) => void }) {
  const { activeTenantId } = useApp();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetchList = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ tenantId: activeTenantId });
    if (q) params.set('q', q);
    if (statusFilter) params.set('status', statusFilter);
    authFetch(`/api/delivery-notes?${params}`)
      .then(async r => {
        if (!r.ok) { const e = await r.json().catch(() => ({ error: r.statusText })); throw new Error(e.error || 'Erreur chargement'); }
        return r.json();
      })
      .then(d => setRows(d.results || []))
      .catch(err => console.error('DeliveryNotes list error:', err))
      .finally(() => setLoading(false));
  }, [activeTenantId, q, statusFilter]);

  useEffect(() => { fetchList(); }, [fetchList]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-bold text-white">Tous les BL</h2><p className="text-xs text-gray-500">{rows.length} résultat(s)</p></div>
        <button onClick={() => onNavigate('create')} className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Nouveau BL</button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="BL, facture, client, chauffeur..." className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-xs text-white">
          <option value="">Tous les statuts</option>
          <option value="draft">En préparation</option>
          <option value="validated">Validé</option>
          <option value="in_transit">En cours</option>
          <option value="delivered">Livré</option>
          <option value="cancelled">Annulé</option>
        </select>
        <button onClick={fetchList} className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold px-3 py-2 rounded-lg"><RefreshCw className="w-3.5 h-3.5" /></button>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="max-h-[600px] overflow-y-auto">
          <table className="w-full text-[10px]">
            <thead className="sticky top-0 bg-gray-950">
              <tr className="text-gray-500 uppercase tracking-wider">
                <th className="text-left p-2">N° BL</th>
                <th className="text-left p-2">Facture</th>
                <th className="text-left p-2">Client</th>
                <th className="text-left p-2">Chauffeur</th>
                <th className="text-right p-2">Articles</th>
                <th className="text-right p-2">Qté</th>
                <th className="text-left p-2">Statut</th>
                <th className="text-left p-2">Date</th>
                <th className="text-center p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-8 text-gray-600"><div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full mx-auto" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-gray-500">Aucun bon de livraison</td></tr>
              ) : rows.map((dn: any) => (
                <tr key={dn.id} className="border-t border-gray-800/50 hover:bg-gray-950/30 cursor-pointer" onClick={() => onNavigate('detail', dn.id)}>
                  <td className="p-2 font-mono font-bold text-white">{dn.deliveryNumber}</td>
                  <td className="p-2 font-mono text-gray-400">{dn.invoiceNumber || '-'}</td>
                  <td className="p-2 text-gray-300 max-w-[120px] truncate">{dn.customerName || '-'}</td>
                  <td className="p-2 text-gray-400">{dn.driverName || '-'}</td>
                  <td className="p-2 text-right font-mono text-gray-400">{dn.totalItems || 0}</td>
                  <td className="p-2 text-right font-mono text-gray-400">{dn.totalQuantity || 0}</td>
                  <td className="p-2"><StatusBadge status={dn.status} /></td>
                  <td className="p-2 font-mono text-gray-500">{formatDate(dn.date)}</td>
                  <td className="p-2 text-center">
                    <button onClick={(e) => { e.stopPropagation(); onNavigate('detail', dn.id); }} className="p-1 hover:bg-gray-800 rounded text-gray-500 hover:text-white"><Eye className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CreateDeliveryNote({ onBack, onCreated }: { onBack: () => void; onCreated: (id: string) => void }) {
  const { activeTenantId, db } = useApp();
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [invoiceItems, setInvoiceItems] = useState<any[]>([]);
  const [deliveryItems, setDeliveryItems] = useState<Record<string, number>>({});
  const [form, setForm] = useState({ driverName: '', vehicleInfo: '', warehouseOrigin: '', deliveryAddress: '', deliveryPhone: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [invoices, setInvoices] = useState<any[]>([]);

  useEffect(() => {
    authFetch(`/api/invoices?tenantId=${activeTenantId}&status=validated&limit=50`)
      .then(async r => {
        if (!r.ok) { const e = await r.json().catch(() => ({ error: r.statusText })); throw new Error(e.error || 'Erreur chargement'); }
        return r.json();
      })
      .then(d => setInvoices(d.invoices || d.results || []))
      .catch(err => console.error('Invoice search error:', err));
  }, [activeTenantId]);

  const filteredInvoices = useMemo(() => {
    if (!invoiceSearch) return [];
    const q = invoiceSearch.toLowerCase();
    return invoices.filter((inv: any) =>
      inv.invoiceNumber?.toLowerCase().includes(q) || inv.customerName?.toLowerCase().includes(q)
    ).slice(0, 10);
  }, [invoices, invoiceSearch]);

  const selectInvoice = async (inv: any) => {
    setSelectedInvoice(inv);
    setInvoiceSearch(inv.invoiceNumber + ' - ' + inv.customerName);
    try {
      const res = await authFetch(`/api/invoices/${inv.id}?tenantId=${activeTenantId}`);
      const d = await res.json();
      const items = (d.items || []).map((i: any) => {
        const remaining = Math.max(0, i.quantity - (i.qtyDelivered || 0));
        return { ...i, remaining };
      }).filter((i: any) => i.remaining > 0);
      setInvoiceItems(items);
      const init: Record<string, number> = {};
      items.forEach((i: any) => { init[i.id] = i.remaining; });
      setDeliveryItems(init);
    } catch { setInvoiceItems([]); }
  };

  const totalQty = (Object.values(deliveryItems) as number[]).reduce((a, b) => a + (b || 0), 0);

  const handleSave = async () => {
    if (!selectedInvoice || totalQty <= 0) return;
    setSaving(true);
    const items = invoiceItems.map(i => ({ invoiceItemId: i.id, quantity: deliveryItems[i.id] || 0 })).filter(i => i.quantity > 0);
    try {
      const res = await authFetch('/api/delivery-notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: selectedInvoice.id, items, ...form })
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const d = await res.json();
      onCreated(d.id);
    } catch (err: any) { alert(err.message || "Erreur de création"); }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400"><ArrowLeft className="w-5 h-5" /></button>
        <div><h2 className="text-lg font-bold text-white">Nouveau Bon de Livraison</h2><p className="text-xs text-gray-500">Sélectionnez une facture et les quantités à livrer</p></div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
        <div className="relative">
          <label className="text-[10px] font-mono text-gray-500 block mb-1">Rechercher une facture validée</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <input value={invoiceSearch} onChange={e => { setInvoiceSearch(e.target.value); setSelectedInvoice(null); setInvoiceItems([]); }}
              placeholder="N° de facture ou nom client..." className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-9 pr-3 py-2.5 text-xs text-white" />
          </div>
          {!selectedInvoice && filteredInvoices.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-gray-900 border border-gray-700 rounded-xl shadow-xl max-h-48 overflow-y-auto">
              {filteredInvoices.map((inv: any) => (
                <div key={inv.id} className="p-2.5 hover:bg-gray-800 cursor-pointer flex items-center gap-3" onClick={() => selectInvoice(inv)}>
                  <FileText className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white">{inv.invoiceNumber}</p>
                    <p className="text-[10px] text-gray-500">{inv.customerName} - {formatCurrency(inv.total, 'GNF')}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedInvoice && invoiceItems.length === 0 && (
          <p className="text-xs text-amber-400 text-center py-4">Tous les articles de cette facture ont déjà été livrés.</p>
        )}

        {invoiceItems.length > 0 && (
          <div>
            <h3 className="text-xs font-bold text-gray-300 uppercase font-mono mb-2">Articles restant à livrer</h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {invoiceItems.map((item: any) => (
                <div key={item.id} className="bg-gray-950 border border-gray-800 rounded-lg p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white">{item.productName}</p>
                    <p className="text-[9px] text-gray-500 font-mono">
                      Commandé: {item.quantity} | Déjà livré: {item.qtyDelivered || 0} | Reste: <span className="text-amber-400 font-bold">{item.remaining}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500">Livrer:</span>
                    <input type="number" min={0} max={item.remaining} value={deliveryItems[item.id] || 0}
                      onChange={e => setDeliveryItems(p => ({ ...p, [item.id]: Math.min(item.remaining, Math.max(0, Number(e.target.value)) || 0) }))}
                      className="w-20 bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs font-mono text-white text-right" />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 text-right mt-2 font-mono">Total: {totalQty} unité(s)</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-mono text-gray-500 block mb-1">Chauffeur / Livreur</label>
            <input value={form.driverName} onChange={e => setForm(p => ({ ...p, driverName: e.target.value }))} placeholder="Nom du chauffeur" className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
          </div>
          <div>
            <label className="text-[10px] font-mono text-gray-500 block mb-1">Véhicule</label>
            <input value={form.vehicleInfo} onChange={e => setForm(p => ({ ...p, vehicleInfo: e.target.value }))} placeholder="Immatriculation / type" className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
          </div>
          <div>
            <label className="text-[10px] font-mono text-gray-500 block mb-1">Dépôt d'origine</label>
            <input value={form.warehouseOrigin} onChange={e => setForm(p => ({ ...p, warehouseOrigin: e.target.value }))} placeholder="Magasin / dépôt" className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
          </div>
          <div>
            <label className="text-[10px] font-mono text-gray-500 block mb-1">Tél. livraison</label>
            <input value={form.deliveryPhone} onChange={e => setForm(p => ({ ...p, deliveryPhone: e.target.value }))} placeholder="Contact sur place" className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
          </div>
          <div className="col-span-2">
            <label className="text-[10px] font-mono text-gray-500 block mb-1">Adresse de livraison</label>
            <input value={form.deliveryAddress} onChange={e => setForm(p => ({ ...p, deliveryAddress: e.target.value }))} placeholder="Adresse complète" className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
          </div>
          <div className="col-span-2">
            <label className="text-[10px] font-mono text-gray-500 block mb-1">Notes / Instructions</label>
            <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Instructions de livraison" className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onBack} className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold px-4 py-2 rounded-lg">Annuler</button>
          <button onClick={handleSave} disabled={saving || !selectedInvoice || totalQty <= 0}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1">
            {saving ? 'Création...' : <><Plus className="w-3.5 h-3.5" /> Créer le BL</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeliveryNoteDetail({ id, onBack, onUpdated }: { id: string; onBack: () => void; onUpdated?: () => void }) {
  const { db, addNotification } = useDB();
  const { activeTenantId } = useApp();
  const [dn, setDn] = useState<any>(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [items, setItems] = useState<any[]>([]);

  const load = useCallback(() => {
    authFetch(`/api/delivery-notes/${id}?tenantId=${activeTenantId}`)
      .then(async r => {
        if (!r.ok) { const e = await r.json().catch(() => ({ error: r.statusText })); throw new Error(e.error || 'Erreur chargement BL'); }
        return r.json();
      })
      .then(d => { setDn(d); setItems(d.items || []); })
      .catch(err => console.error('DeliveryNote load error:', err));
  }, [id, activeTenantId]);

  useEffect(() => { load(); }, [load]);

  const statusActions = useMemo(() => {
    if (!dn) return [];
    const actions: { label: string; key: string; color: string; icon: any; condition?: boolean }[] = [];
    if (dn.status === 'draft') {
      actions.push({ label: 'Valider', key: 'validate', color: 'bg-blue-600 hover:bg-blue-500', icon: Check });
      actions.push({ label: 'Annuler', key: 'cancel', color: 'bg-red-600/10 text-red-400 border border-red-500/20', icon: Ban });
    }
    if (dn.status === 'validated') {
      actions.push({ label: 'En cours', key: 'in-transit', color: 'bg-amber-600 hover:bg-amber-500', icon: Truck });
      actions.push({ label: 'Livrer', key: 'deliver', color: 'bg-emerald-600 hover:bg-emerald-500', icon: CheckCircle });
      actions.push({ label: 'Annuler', key: 'cancel', color: 'bg-red-600/10 text-red-400 border border-red-500/20', icon: Ban });
    }
    if (dn.status === 'in_transit') {
      actions.push({ label: 'Livrer', key: 'deliver', color: 'bg-emerald-600 hover:bg-emerald-500', icon: CheckCircle });
      actions.push({ label: 'Annuler', key: 'cancel', color: 'bg-red-600/10 text-red-400 border border-red-500/20', icon: Ban });
    }
    return actions;
  }, [dn]);

  const handleAction = async (key: string) => {
    if (!dn) return;
    try {
      let url = `/api/delivery-notes/${id}/${key}`;
      if (key === 'cancel' && dn.status !== 'draft') {
        if (!confirm('Annuler ce BL ? Le stock sera restitué.')) return;
      }
      if (key === 'deliver') {
        url = `/api/delivery-notes/${id}/deliver`;
      }
      const res = await authFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      if (!res.ok) { const e = await res.json().catch(() => ({ error: `HTTP ${res.status}` })); throw new Error(e.error || 'Erreur serveur'); }
      addNotification(`BL ${key === 'cancel' ? 'annulé' : key === 'deliver' ? 'livré' : key === 'in-transit' ? 'en cours' : 'validé'}`);
      load();
      if (onUpdated) onUpdated();
    } catch (err: any) { addNotification(err.message || 'Erreur', 'error'); }
  };

  const handleSaveEdit = async () => {
    try {
      const res = await authFetch(`/api/delivery-notes/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      addNotification('BL modifié');
      setEditMode(false);
      load();
    } catch (err: any) { addNotification(err.message || 'Erreur', 'error'); }
  };

  if (!dn) return <div className="flex justify-center py-16"><div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" /></div>;

  const totalQty = items.reduce((a: number, i: any) => a + i.quantity, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center"><Truck className="w-5 h-5 text-white" /></div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white font-mono">{dn.deliveryNumber}</h2>
              <StatusBadge status={dn.status} />
            </div>
            <p className="text-[10px] text-gray-500">{dn.invoiceNumber ? `Facture ${dn.invoiceNumber} - ${dn.customerName || ''}` : ''}</p>
          </div>
        </div>
        {dn.status === 'draft' && (
          <button onClick={() => { setEditMode(!editMode); setEditForm({ notes: dn.notes, driverName: dn.driverName, vehicleInfo: dn.vehicleInfo, warehouseOrigin: dn.warehouseOrigin, deliveryAddress: dn.deliveryAddress, deliveryPhone: dn.deliveryPhone }); }}
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1"><Edit3 className="w-3.5 h-3.5" /> Modifier</button>
        )}
      </div>

      {statusActions.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {statusActions.map(a => (
            <button key={a.key} onClick={() => handleAction(a.key)}
              className={`${a.color} text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1 transition`}>
              <a.icon className="w-3.5 h-3.5" /> {a.label}
            </button>
          ))}
          <button onClick={() => window.open(`/api/delivery-notes/${id}/print`, '_blank')}
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1"><Printer className="w-3.5 h-3.5" /> Imprimer</button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
          <p className="text-[9px] uppercase text-gray-500 font-mono mb-1">Créé le</p>
          <p className="text-xs font-mono text-white">{formatDate(dn.createdAt)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
          <p className="text-[9px] uppercase text-gray-500 font-mono mb-1">Articles</p>
          <p className="text-xs font-mono text-white">{items.length} produit(s)</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
          <p className="text-[9px] uppercase text-gray-500 font-mono mb-1">Quantité totale</p>
          <p className="text-xs font-mono text-white">{totalQty} unité(s)</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
          <p className="text-[9px] uppercase text-gray-500 font-mono mb-1">Validé le</p>
          <p className="text-xs font-mono text-white">{dn.validatedAt ? formatDate(dn.validatedAt) : '-'}</p>
        </div>
      </div>

      {editMode ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-bold text-white uppercase font-mono">Modifier le BL</h3>
          <div className="grid grid-cols-2 gap-3">
            <input value={editForm.driverName || ''} onChange={e => setEditForm(p => ({ ...p, driverName: e.target.value }))} placeholder="Chauffeur" className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
            <input value={editForm.vehicleInfo || ''} onChange={e => setEditForm(p => ({ ...p, vehicleInfo: e.target.value }))} placeholder="Véhicule" className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
            <input value={editForm.warehouseOrigin || ''} onChange={e => setEditForm(p => ({ ...p, warehouseOrigin: e.target.value }))} placeholder="Dépôt" className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
            <input value={editForm.deliveryPhone || ''} onChange={e => setEditForm(p => ({ ...p, deliveryPhone: e.target.value }))} placeholder="Tél. livraison" className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
            <div className="col-span-2"><input value={editForm.deliveryAddress || ''} onChange={e => setEditForm(p => ({ ...p, deliveryAddress: e.target.value }))} placeholder="Adresse livraison" className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" /></div>
            <div className="col-span-2"><input value={editForm.notes || ''} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notes" className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" /></div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditMode(false)} className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold px-3 py-1.5 rounded-lg">Annuler</button>
            <button onClick={handleSaveEdit} className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-1.5 rounded-lg">Enregistrer</button>
          </div>
        </div>
      ) : (
        <>
          {dn.driverName && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex flex-wrap gap-4 text-[10px] text-gray-400">
              {dn.driverName && <span className="flex items-center gap-1"><User className="w-3 h-3" /> Chauffeur: {dn.driverName}</span>}
              {dn.vehicleInfo && <span className="flex items-center gap-1"><Car className="w-3 h-3" /> {dn.vehicleInfo}</span>}
              {dn.warehouseOrigin && <span className="flex items-center gap-1"><Building className="w-3 h-3" /> Dépôt: {dn.warehouseOrigin}</span>}
              {dn.deliveryAddress && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {dn.deliveryAddress}</span>}
              {dn.deliveryPhone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {dn.deliveryPhone}</span>}
            </div>
          )}
        </>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800"><h3 className="text-xs font-bold text-gray-300 uppercase font-mono">Produits livrés</h3></div>
        <table className="w-full text-[10px]">
          <thead className="bg-gray-950 text-gray-500 uppercase tracking-wider">
            <tr>
              <th className="text-left p-2">Produit</th>
              <th className="text-right p-2">Prix unit.</th>
              <th className="text-right p-2">Quantité</th>
              <th className="text-right p-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any) => (
              <tr key={item.id} className="border-t border-gray-800/50">
                <td className="p-2 text-white font-medium">{item.productName}</td>
                <td className="p-2 text-right font-mono text-gray-400">{Number(item.price || 0).toLocaleString()}</td>
                <td className="p-2 text-right font-mono font-bold text-white">{item.quantity}</td>
                <td className="p-2 text-right font-mono text-emerald-400">{(item.quantity * (item.price || 0)).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dn.audit?.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-xs font-bold text-gray-300 uppercase font-mono mb-3">Historique des actions</h3>
          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {dn.audit.map((a: any) => (
              <div key={a.id} className="flex items-center gap-2 text-[10px] text-gray-400 py-1 border-b border-gray-800/30 last:border-0">
                <span className="font-mono text-gray-500">{formatDate(a.createdAt)}</span>
                <span className="bg-gray-800 px-1.5 py-0.5 rounded text-[8px] font-mono text-gray-300">{a.action}</span>
                <span className="flex-1">{a.description}</span>
                {a.userName && <span className="text-gray-500">par {a.userName}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DeliveryNotes() {
  const [tab, setTab] = useState<string>('dashboard');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleNavigate = (t: string, id?: string) => {
    setTab(t);
    if (id) setSelectedId(id);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto pb-1">
        {(['dashboard', 'list'] as string[]).map(t => (
          <button key={t} onClick={() => handleNavigate(t)}
            className={`px-4 py-2 text-xs font-bold rounded-lg whitespace-nowrap transition ${
              tab === t ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-900 text-gray-400 hover:text-white border border-gray-800'
            }`}>
            {t === 'dashboard' ? 'Tableau de bord' : 'Liste des BL'}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && <DashboardView onNavigate={handleNavigate} />}
      {tab === 'list' && <DeliveryNoteList onNavigate={handleNavigate} />}
      {tab === 'detail' && selectedId && <DeliveryNoteDetail id={selectedId} onBack={() => handleNavigate('list')} onUpdated={() => {}} />}
      {tab === 'create' && <CreateDeliveryNote onBack={() => handleNavigate('list')} onCreated={(id) => handleNavigate('detail', id)} />}
    </div>
  );
}
