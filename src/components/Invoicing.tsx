import { useState, useMemo, memo, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileText, Plus, Search, Filter, X, Check, AlertTriangle, Clock,
  Truck, DollarSign, ArrowLeft, Download, Share2, Printer,
  Eye, RefreshCw, Package, User, Building, Calendar,
  ChevronDown, ChevronRight, Percent, Circle, Trash2,
  FileSpreadsheet, Send, CreditCard, Ban, Undo2, BarChart3,
  ShoppingBag, Users, TrendingUp, TrendingDown, MoreHorizontal,
  Edit3, Copy, Archive, ArrowUpDown, CheckCircle
} from 'lucide-react';
import { useDB, useApp } from '../context';
import { formatCurrency } from '../utils';
import {
  INVOICE_STATUS_LABELS, DELIVERY_STATUS_LABELS, PAYMENT_STATUS_LABELS,
  DELIVERY_ORDER_STATUS_LABELS, CHART_COLORS
} from '../constants';
import type {
  Invoice, InvoiceItem, DeliveryOrder, DeliveryOrderItem,
  Payment, ReturnRecord, InvoiceAuditLog
} from '../types';

type InvoicingTab = 'list' | 'create' | 'detail';

const COLORS = CHART_COLORS;

function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('nexastock_token');
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  validated: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  cancelled: 'bg-red-500/10 text-red-400 border-red-500/20',
  archived: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  not_delivered: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  partially_delivered: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  fully_delivered: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  unpaid: 'bg-red-500/10 text-red-400 border-red-500/20',
  partially_paid: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  paid: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  overdue: 'bg-rose-600/10 text-rose-400 border-rose-600/20',
};

function formatDate(d: string) {
  if (!d) return '-';
  try { return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return d; }
}

function ProgressBar({ value, color = 'bg-emerald-500', size = 'h-1.5' }: { value: number; color?: string; size?: string }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className={`w-full ${size} bg-gray-800 rounded-full overflow-hidden`}>
      <div className={`${size} ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function StatusBadge({ status, labels }: { status: string; labels: Record<string, string> }) {
  const color = statusColors[status] || 'bg-gray-500/10 text-gray-400';
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${color} whitespace-nowrap font-mono uppercase tracking-wider`}>
      {labels[status] || status}
    </span>
  );
}

const InvoiceCard = memo(function InvoiceCard({ invoice, onSelect, formatted }: {
  invoice: Invoice; onSelect: (id: string) => void; formatted: (v: number) => string
}) {
  const delPct = invoice.items?.length
    ? Math.round((invoice.items.reduce((a, i) => a + i.qtyDelivered, 0) / invoice.items.reduce((a, i) => a + i.quantity, 0)) * 100)
    : 0;
  const payPct = invoice.total > 0 ? Math.round((invoice.paidAmount / invoice.total) * 100) : 0;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      onClick={() => onSelect(invoice.id)}
      className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition cursor-pointer group">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-white font-mono">{invoice.invoiceNumber}</h3>
            <StatusBadge status={invoice.status} labels={INVOICE_STATUS_LABELS} />
          </div>
          {invoice.customerName && (
            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
              <User className="w-3 h-3" /> {invoice.customerName}
            </p>
          )}
          <p className="text-[10px] text-gray-500 mt-0.5 font-mono">{formatDate(invoice.date)}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-bold font-mono text-white">{formatted(invoice.total)}</p>
          <p className="text-[10px] text-gray-500">Payé: <span className="text-emerald-400 font-mono">{formatted(invoice.paidAmount)}</span></p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 bg-gray-950/50 rounded-lg p-3 border border-gray-800/50">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] uppercase tracking-wider text-gray-500 font-mono flex items-center gap-1">
              <Truck className="w-3 h-3" /> Livraison
            </span>
            <span className="text-[10px] font-mono font-bold text-white">{delPct}%</span>
          </div>
          <ProgressBar value={delPct} color={delPct >= 100 ? 'bg-emerald-500' : delPct > 0 ? 'bg-blue-500' : 'bg-amber-500'} />
          <p className="text-[9px] text-gray-600 mt-1 font-mono">{DELIVERY_STATUS_LABELS[invoice.deliveryStatus] || invoice.deliveryStatus}</p>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] uppercase tracking-wider text-gray-500 font-mono flex items-center gap-1">
              <DollarSign className="w-3 h-3" /> Paiement
            </span>
            <span className="text-[10px] font-mono font-bold text-white">{payPct}%</span>
          </div>
          <ProgressBar value={payPct} color={payPct >= 100 ? 'bg-emerald-500' : payPct > 0 ? 'bg-violet-500' : 'bg-red-500'} />
          <p className="text-[9px] text-gray-600 mt-1 font-mono">{PAYMENT_STATUS_LABELS[invoice.paymentStatus] || invoice.paymentStatus}</p>
        </div>
      </div>

      {invoice.deliveryOrders && invoice.deliveryOrders.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5">
          <span className="text-[9px] text-gray-600 font-mono">BL:</span>
          {invoice.deliveryOrders.map(do_ => (
            <span key={do_.id} className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${do_.status === 'validated' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-gray-800 text-gray-500'}`}>
              {do_.deliveryNumber}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
});

function InvoiceDetail({ invoiceId, onBack }: { invoiceId: string; onBack: () => void }) {
  const { db, handleUpdateDb, addNotification, activeUserId, activeUser } = useDB ? useDB() : { db: null as any, handleUpdateDb: () => {}, addNotification: () => {}, activeUserId: '', activeUser: null };
  const { activeTenantId } = useApp();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDOPanel, setShowDOPanel] = useState(false);
  const [showPaymentPanel, setShowPaymentPanel] = useState(false);
  const [showReturnPanel, setShowReturnPanel] = useState(false);
  const [activeTab, setActiveTab] = useState<'items' | 'delivery' | 'payments' | 'returns' | 'audit'>('items');

  useEffect(() => {
    if (!invoiceId) return;
    setLoading(true);
    authFetch(`/api/invoices/${invoiceId}`)
      .then(r => r.json())
      .then(data => { setInvoice(data); setLoading(false); })
      .catch(() => {
        const inv = db?.invoices?.find((i: Invoice) => i.id === invoiceId);
        setInvoice(inv || null);
        setLoading(false);
      });
  }, [invoiceId, db]);

  const formatted = useCallback((v: number) => {
    const t = db?.tenants?.find((t: any) => t.id === activeTenantId);
    return formatCurrency(v, t?.currency);
  }, [db, activeTenantId]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" /></div>;
  if (!invoice) return <div className="text-center py-12 text-gray-500">Facture introuvable</div>;

  const delPct = invoice.items?.length
    ? Math.round((invoice.items.reduce((a: any, i: any) => a + (i.qtyDelivered || 0), 0) / invoice.items.reduce((a: any, i: any) => a + i.quantity, 0)) * 100)
    : 0;
  const payPct = invoice.total > 0 ? Math.round(((invoice.paidAmount || 0) / invoice.total) * 100) : 0;
  const remaining = invoice.total - (invoice.paidAmount || 0);

  const handleValidate = async () => {
    try {
      const res = await authFetch(`/api/invoices/${invoice.id}/validate`, { method: 'POST' });
      const updated = await res.json();
      setInvoice((prev: any) => ({ ...prev, ...updated }));
      addNotification(`Facture ${invoice.invoiceNumber} validée`);
    } catch { addNotification('Erreur validation', 'error'); }
  };

  const handleCancel = async () => {
    const reason = prompt('Motif d\'annulation (optionnel):');
    try {
      const res = await authFetch(`/api/invoices/${invoice.id}/cancel`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      const updated = await res.json();
      setInvoice((prev: any) => ({ ...prev, ...updated }));
      addNotification(`Facture ${invoice.invoiceNumber} annulée`);
    } catch { addNotification('Erreur annulation', 'error'); }
  };

  const handlePrint = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const itemsHtml = (invoice.items || []).map((i: any) =>
      `<tr><td style="padding:6px 8px;border-bottom:1px solid #333">${i.productName}</td><td style="padding:6px 8px;border-bottom:1px solid #333;text-align:center">${i.quantity}</td><td style="padding:6px 8px;border-bottom:1px solid #333;text-align:right">${formatted(i.price)}</td><td style="padding:6px 8px;border-bottom:1px solid #333;text-align:right">${formatted(i.total)}</td><td style="padding:6px 8px;border-bottom:1px solid #333;text-align:center">${i.qtyDelivered||0}/${i.quantity}</td></tr>`
    ).join('');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${invoice.invoiceNumber}</title><style>body{font-family:'Inter',sans-serif;background:#0a0a0f;color:#fff;padding:40px;max-width:800px;margin:auto}table{width:100%;border-collapse:collapse}th{background:#1a1a2e;padding:8px;font-size:11px;text-transform:uppercase;color:#888}.totals{text-align:right;margin-top:20px}h1{font-size:24px;margin:0}h2{color:#888;font-size:14px;font-weight:400}.status{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:bold;text-transform:uppercase}.badge{padding:2px 8px;border-radius:12px;font-size:10px}.header{display:flex;justify-content:space-between;align-items:start;margin-bottom:30px;padding-bottom:20px;border-bottom:1px solid #222}.footer{margin-top:40px;padding-top:20px;border-top:1px solid #222;font-size:11px;color:#666;text-align:center}</style></head><body>
      <div class="header"><div><h1>${invoice.invoiceNumber}</h1><h2>${formatDate(invoice.date)}</h2></div><div style="text-align:right"><div style="font-size:28px;font-weight:bold">${formatted(invoice.total)}</div></div></div>
      ${invoice.customerName ? `<div style="margin-bottom:20px;padding:12px;background:#111;border-radius:8px"><strong style="color:#888;font-size:10px;text-transform:uppercase">Client</strong><p style="margin:4px 0">${invoice.customerName}</p>${invoice.customerEmail ? `<p style="margin:2px 0;color:#666;font-size:12px">${invoice.customerEmail}</p>` : ''}${invoice.customerPhone ? `<p style="margin:2px 0;color:#666;font-size:12px">${invoice.customerPhone}</p>` : ''}</div>` : ''}
      <table><thead><tr><th style="text-align:left">Article</th><th>Qté</th><th style="text-align:right">P.U.</th><th style="text-align:right">Total</th><th>Livré</th></tr></thead><tbody>${itemsHtml}</tbody></table>
      <div class="totals"><p>Sous-total: ${formatted(invoice.subtotal)}</p>${invoice.tax > 0 ? `<p>TVA (${invoice.taxRate}%): ${formatted(invoice.tax)}</p>` : ''}${invoice.discount > 0 ? `<p>Remise: -${formatted(invoice.discount)}</p>` : ''}${invoice.shipping > 0 ? `<p>Frais de port: ${formatted(invoice.shipping)}</p>` : ''}<p style="font-size:18px;font-weight:bold">Total: ${formatted(invoice.total)}</p></div>
      ${invoice.notes ? `<div style="margin-top:20px;padding:12px;background:#111;border-radius:8px;font-size:12px;color:#888"><strong>Notes:</strong><p>${invoice.notes}</p></div>` : ''}
      <div class="footer"><p>NexaStock ERP - Document généré le ${new Date().toLocaleString('fr-FR')}</p></div></body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); }, 500);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: `Facture ${invoice.invoiceNumber}`, text: `Facture ${invoice.invoiceNumber} - ${formatted(invoice.total)}`, url: window.location.href });
    } else {
      navigator.clipboard.writeText(`Facture ${invoice.invoiceNumber}: ${formatted(invoice.total)}`).then(() => addNotification('Lien copié')).catch(() => {});
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold font-mono text-white">{invoice.invoiceNumber}</h2>
              <StatusBadge status={invoice.status} labels={INVOICE_STATUS_LABELS} />
            </div>
            <p className="text-xs text-gray-500">{formatDate(invoice.date)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {invoice.status === 'draft' && (
            <button onClick={handleValidate} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> Valider
            </button>
          )}
          {(invoice.status === 'validated' || invoice.status === 'draft') && (
            <button onClick={handleCancel} className="bg-red-600/10 hover:bg-red-600/20 text-red-400 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 border border-red-500/20">
              <Ban className="w-3.5 h-3.5" /> Annuler
            </button>
          )}
          {invoice.status === 'validated' && invoice.deliveryStatus !== 'fully_delivered' && (
            <button onClick={() => setShowDOPanel(true)} className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1">
              <Truck className="w-3.5 h-3.5" /> Créer un BL
            </button>
          )}
          {invoice.status !== 'cancelled' && remaining > 0 && (
            <button onClick={() => setShowPaymentPanel(true)} className="bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1">
              <CreditCard className="w-3.5 h-3.5" /> Encaisser
            </button>
          )}
          {invoice.status === 'validated' && (
            <button onClick={() => setShowReturnPanel(true)} className="bg-amber-600/10 hover:bg-amber-600/20 text-amber-400 text-xs font-bold px-3 py-1.5 rounded-lg border border-amber-500/20 flex items-center gap-1">
              <Undo2 className="w-3.5 h-3.5" /> Retour
            </button>
          )}
          <button onClick={handlePrint} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400" title="Imprimer">
            <Printer className="w-4 h-4" />
          </button>
          <button onClick={handleShare} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400" title="Partager">
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">Livraison</span>
            <StatusBadge status={invoice.deliveryStatus} labels={DELIVERY_STATUS_LABELS} />
          </div>
          <ProgressBar value={delPct} color={delPct >= 100 ? 'bg-emerald-500' : delPct > 0 ? 'bg-blue-500' : 'bg-amber-500'} size="h-2.5" />
          <p className="text-xs text-gray-400 mt-2">{delPct}% livré</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">Paiement</span>
            <StatusBadge status={invoice.paymentStatus} labels={PAYMENT_STATUS_LABELS} />
          </div>
          <ProgressBar value={payPct} color={payPct >= 100 ? 'bg-emerald-500' : payPct > 0 ? 'bg-violet-500' : 'bg-red-500'} size="h-2.5" />
          <p className="text-xs text-gray-400 mt-2">{payPct}% payé</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono mb-1">Total TTC</p>
          <p className="text-xl font-bold font-mono text-white">{formatted(invoice.total)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-mono mb-1">Reliquat à payer</p>
          <p className="text-xl font-bold font-mono text-amber-400">{formatted(remaining)}</p>
        </div>
      </div>

      {invoice.customerName && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-400"><User className="w-4 h-4" /></div>
          <div>
            <p className="text-xs font-bold text-white">{invoice.customerName}</p>
            <div className="flex gap-2 text-[10px] text-gray-500">
              {invoice.customerEmail && <span>{invoice.customerEmail}</span>}
              {invoice.customerPhone && <span>{invoice.customerPhone}</span>}
            </div>
          </div>
        </div>
      )}

      {invoice.invoiceAffiliate && (
        <div className="bg-gray-900 border border-emerald-500/20 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[10px] font-bold text-gray-300 uppercase tracking-wider font-mono">Apporteur d'affaires & commission</h3>
            <StatusBadge status={invoice.invoiceAffiliate.status} labels={({ pending: 'À payer', partially_paid: 'Partiellement payé', paid: 'Payée' } as any)} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <p className="text-[9px] font-mono text-gray-500">Apporteur</p>
              <p className="text-xs font-bold text-white mt-0.5">{invoice.invoiceAffiliate.affiliateName}</p>
            </div>
            <div>
              <p className="text-[9px] font-mono text-gray-500">Commission</p>
              <p className="text-xs font-bold font-mono text-emerald-400 mt-0.5">{formatted(invoice.invoiceAffiliate.totalCommission)}</p>
            </div>
            <div>
              <p className="text-[9px] font-mono text-gray-500">Reçu / Restant</p>
              <p className="text-xs font-mono text-emerald-400 mt-0.5">{formatted(invoice.invoiceAffiliate.amountPaid || 0)} <span className="text-gray-600">/</span> <span className="text-amber-400">{formatted(invoice.invoiceAffiliate.balanceDue || 0)}</span></p>
            </div>
            <div>
              <p className="text-[9px] font-mono text-gray-500">Échéance</p>
              <p className="text-xs font-mono text-white mt-0.5">{invoice.invoiceAffiliate.paymentSchedule === 'immediate' ? 'Immédiate' : (invoice.invoiceAffiliate.paymentDueDate || '—')}</p>
            </div>
          </div>
          {invoice.commissionItems && invoice.commissionItems.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-800">
              {(invoice.commissionItems as any[]).map((c: any) => (
                <div key={c.id} className="flex items-center justify-between text-[11px] py-0.5">
                  <span className="text-gray-400">{c.productName} <span className="text-gray-600">x{c.quantity}</span></span>
                  <span className="font-mono text-emerald-400">{formatted(c.totalCommission)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-1 border-b border-gray-800 overflow-x-auto">
        {['items', 'delivery', 'payments', 'returns', 'audit'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab as any)}
            className={`px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition ${
              activeTab === tab ? 'text-blue-400 border-blue-500' : 'text-gray-500 border-transparent hover:text-gray-300'
            }`}>
            {tab === 'items' && 'Articles'}
            {tab === 'delivery' && 'Bons de livraison'}
            {tab === 'payments' && 'Paiements'}
            {tab === 'returns' && 'Retours'}
            {tab === 'audit' && 'Traçabilité'}
          </button>
        ))}
      </div>

      {activeTab === 'items' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="bg-gray-950 text-gray-500 text-[10px] uppercase tracking-wider">
              <th className="text-left p-3">Article</th>
              <th className="text-center p-3">Qté cmd</th>
              <th className="text-right p-3">Prix unitaire</th>
              <th className="text-right p-3">Total</th>
              <th className="text-center p-3">Livré</th>
              <th className="text-center p-3">Retourné</th>
              <th className="text-center p-3">Reliquat</th>
              <th className="text-center p-3">Progression</th>
            </tr></thead>
            <tbody>
              {(invoice.items || []).map((item: any) => {
                const remaining = item.quantity - (item.qtyDelivered || 0) - (item.qtyReturned || 0);
                const pct = item.quantity > 0 ? Math.round(((item.qtyDelivered || 0) / item.quantity) * 100) : 0;
                return (
                  <tr key={item.id} className="border-t border-gray-800/50 hover:bg-gray-950/30">
                    <td className="p-3 font-medium text-white">{item.productName}</td>
                    <td className="p-3 text-center font-mono">{item.quantity}</td>
                    <td className="p-3 text-right font-mono">{formatted(item.price)}</td>
                    <td className="p-3 text-right font-mono">{formatted(item.total)}</td>
                    <td className="p-3 text-center font-mono text-emerald-400">{item.qtyDelivered || 0}</td>
                    <td className="p-3 text-center font-mono text-amber-400">{item.qtyReturned || 0}</td>
                    <td className={`p-3 text-center font-mono ${remaining > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{Math.max(0, remaining)}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <ProgressBar value={pct} color={pct >= 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-blue-500' : 'bg-amber-500'} />
                        <span className="text-[10px] font-mono text-gray-500 w-8 text-right">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'delivery' && <DeliveryTab invoice={invoice} onUpdate={(d: any) => { authFetch(`/api/invoices/${invoice.id}`).then(r => r.json()).then(setInvoice); }} formatted={formatted} />}
      {activeTab === 'payments' && <PaymentsTab invoice={invoice} formatted={formatted} />}
      {activeTab === 'returns' && <ReturnsTab invoice={invoice} formatted={formatted} />}
      {activeTab === 'audit' && <AuditTab invoice={invoice} />}

      {showDOPanel && <CreateDeliveryOrderPanel invoice={invoice} onClose={() => setShowDOPanel(false)} onCreated={() => { setShowDOPanel(false); authFetch(`/api/invoices/${invoice.id}`).then(r => r.json()).then(setInvoice); }} />}
      {showPaymentPanel && <PaymentPanel invoice={invoice} onClose={() => setShowPaymentPanel(false)} onDone={() => { setShowPaymentPanel(false); authFetch(`/api/invoices/${invoice.id}`).then(r => r.json()).then(setInvoice); }} />}
      {showReturnPanel && <ReturnPanel invoice={invoice} onClose={() => setShowReturnPanel(false)} onDone={() => { setShowReturnPanel(false); authFetch(`/api/invoices/${invoice.id}`).then(r => r.json()).then(setInvoice); }} />}
    </div>
  );
}

function DeliveryTab({ invoice, onUpdate, formatted }: { invoice: Invoice; onUpdate: (d: any) => void; formatted: (v: number) => string }) {
  const { addNotification } = useDB();
  const dos = invoice.deliveryOrders || [];

  const handleAction = async (id: string, action: string) => {
    try {
      const res = await authFetch(`/api/delivery-notes/${id}/${action}`, { method: 'POST' });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      addNotification(action === 'cancel' ? 'BL annulé - stock restitué' : action === 'validate' ? 'BL validé - stock déduit' : `BL ${action === 'deliver' ? 'livré' : 'en cours'}`);
      onUpdate(id);
    } catch (err: any) { addNotification(err.message || 'Erreur', 'error'); }
  };

  if (dos.length === 0) return <div className="text-center py-12 text-gray-500">Aucun bon de livraison</div>;

  return (
    <div className="space-y-3">
      {dos.map(do_ => (
        <div key={do_.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold font-mono text-white">{do_.deliveryNumber}</h4>
              <StatusBadge status={do_.status} labels={DELIVERY_ORDER_STATUS_LABELS} />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {do_.status === 'draft' && (
                <>
                  <button onClick={() => handleAction(do_.id, 'validate')} className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1">
                    <Check className="w-3 h-3" /> Valider
                  </button>
                  <button onClick={() => handleAction(do_.id, 'cancel')} className="bg-red-600/10 hover:bg-red-600/20 text-red-400 text-[10px] font-bold px-2.5 py-1 rounded-lg border border-red-500/20">
                    Annuler
                  </button>
                </>
              )}
              {do_.status === 'validated' && (
                <>
                  <button onClick={() => handleAction(do_.id, 'in-transit')} className="bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1">
                    <Truck className="w-3 h-3" /> En cours
                  </button>
                  <button onClick={() => handleAction(do_.id, 'deliver')} className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Livrer
                  </button>
                  <button onClick={() => handleAction(do_.id, 'cancel')} className="bg-amber-600/10 hover:bg-amber-600/20 text-amber-400 text-[10px] font-bold px-2.5 py-1 rounded-lg border border-amber-500/20">
                    Annuler (restituer stock)
                  </button>
                </>
              )}
              {do_.status === 'in_transit' && (
                <>
                  <button onClick={() => handleAction(do_.id, 'deliver')} className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Livrer
                  </button>
                  <button onClick={() => handleAction(do_.id, 'cancel')} className="bg-amber-600/10 hover:bg-amber-600/20 text-amber-400 text-[10px] font-bold px-2.5 py-1 rounded-lg border border-amber-500/20">
                    Annuler
                  </button>
                </>
              )}
              {(do_.driverName || do_.vehicleInfo) && (
                <span className="text-[9px] text-gray-500 font-mono">| {do_.driverName}{do_.vehicleInfo ? ` (${do_.vehicleInfo})` : ''}</span>
              )}
            </div>
          </div>
          <p className="text-[10px] text-gray-500 mb-2 font-mono">Créé le {formatDate(do_.createdAt)}{do_.validatedAt ? ` | Validé le ${formatDate(do_.validatedAt)}` : ''}{do_.cancelledAt ? ` | Annulé le ${formatDate(do_.cancelledAt)}` : ''}{do_.deliveryDate ? ` | Livré le ${formatDate(do_.deliveryDate)}` : ''}</p>
          {do_.notes && <p className="text-[10px] text-gray-400 mb-2 italic">{do_.notes}</p>}
          <div className="overflow-x-auto"><table className="w-full text-xs">
            <thead><tr className="text-gray-500 text-[10px] uppercase tracking-wider">
              <th className="text-left py-1">Article</th>
              <th className="text-center py-1">Qté</th>
              <th className="text-right py-1">P.U.</th>
              <th className="text-right py-1">Total</th>
            </tr></thead>
            <tbody>
              {(do_.items || []).map((item: any) => (
                <tr key={item.id} className="border-t border-gray-800/50">
                  <td className="py-2 font-medium text-white">{item.productName}</td>
                  <td className="py-2 text-center font-mono">{item.quantity}</td>
                  <td className="py-2 text-right font-mono">{formatted(item.price)}</td>
                  <td className="py-2 text-right font-mono">{formatted(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      ))}
    </div>
  );
}

function PaymentsTab({ invoice, formatted }: { invoice: Invoice; formatted: (v: number) => string }) {
  const payments = invoice.payments || [];
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      {payments.length === 0 ? (
        <div className="text-center py-8 text-gray-500">Aucun paiement enregistré</div>
      ) : (
        <div className="overflow-x-auto"><table className="w-full text-xs">
          <thead><tr className="text-gray-500 text-[10px] uppercase tracking-wider">
            <th className="text-left p-2">Date</th>
            <th className="text-left p-2">Méthode</th>
            <th className="text-right p-2">Montant</th>
            <th className="text-left p-2">Référence</th>
            <th className="text-left p-2">Par</th>
          </tr></thead>
          <tbody>
            {payments.map((p: any) => (
              <tr key={p.id} className="border-t border-gray-800/50">
                <td className="p-2 font-mono text-gray-300">{formatDate(p.date)}</td>
                <td className="p-2">
                  <span className="bg-gray-800 text-gray-300 px-2 py-0.5 rounded text-[9px] font-mono">{p.method}</span>
                </td>
                <td className="p-2 text-right font-mono font-bold text-emerald-400">{formatted(p.amount)}</td>
                <td className="p-2 text-gray-400 font-mono">{p.reference || '-'}</td>
                <td className="p-2 text-gray-400">{p.createdByName || '-'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-700">
              <td colSpan={2} className="p-2 text-right font-bold text-white">Total payé</td>
              <td className="p-2 text-right font-bold font-mono text-emerald-400">{formatted(payments.reduce((a: number, p: any) => a + p.amount, 0))}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table></div>
      )}
    </div>
  );
}

function ReturnsTab({ invoice, formatted }: { invoice: Invoice; formatted: (v: number) => string }) {
  const returns = invoice.returns || [];
  return (
    <div className="space-y-3">
      {returns.length === 0 ? (
        <div className="text-center py-8 text-gray-500">Aucun retour</div>
      ) : returns.map((ret: any) => (
        <div key={ret.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="text-xs font-bold font-mono text-white">{ret.returnNumber}</h4>
            <StatusBadge status={ret.status} labels={{ draft: 'Brouillon', validated: 'Validé', cancelled: 'Annulé' }} />
          </div>
          <p className="text-[10px] text-gray-500 font-mono">{formatDate(ret.date)}{ret.reason ? ` | Motif: ${ret.reason}` : ''}</p>
          <div className="overflow-x-auto"><table className="w-full text-xs mt-2">
            <thead><tr className="text-gray-500 text-[10px] uppercase tracking-wider">
              <th className="text-left py-1">Article</th>
              <th className="text-center py-1">Qté</th>
              <th className="text-right py-1">Remboursement</th>
            </tr></thead>
            <tbody>
              {(ret.items || []).map((item: any) => (
                <tr key={item.id} className="border-t border-gray-800/50">
                  <td className="py-2 text-white">{item.productName}</td>
                  <td className="py-2 text-center font-mono">{item.quantity}</td>
                  <td className="py-2 text-right font-mono">{formatted(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      ))}
    </div>
  );
}

function AuditTab({ invoice }: { invoice: Invoice }) {
  const { db } = useDB();
  const logs = db?.invoiceAuditLogs?.filter((l: InvoiceAuditLog) => l.invoiceId === invoice.id) || [];
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      {logs.length === 0 ? (
        <div className="text-center py-8 text-gray-500">Aucun événement de traçabilité</div>
      ) : (
        <div className="space-y-1">
          {logs.map((log: any) => (
            <div key={log.id} className="flex items-start gap-3 py-2 border-b border-gray-800/50 last:border-0">
              <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white">{log.action}</p>
                {log.details && <p className="text-[10px] text-gray-500">{log.details}</p>}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[9px] font-mono text-gray-600">{formatDate(log.timestamp)}</p>
                {log.userName && <p className="text-[9px] text-gray-600">{log.userName}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateDeliveryOrderPanel({ invoice, onClose, onCreated }: { invoice: Invoice; onClose: () => void; onCreated: () => void }) {
  const [items, setItems] = useState<{ invoiceItemId: string; quantity: number }[]>(
    (invoice.items || [])
      .filter((i: any) => (i.quantity - (i.qtyDelivered || 0) - (i.qtyReturned || 0)) > 0)
      .map((i: any) => ({ invoiceItemId: i.id, quantity: i.quantity - (i.qtyDelivered || 0) - (i.qtyReturned || 0) }))
  );
  const [notes, setNotes] = useState('');
  const [driverName, setDriverName] = useState('');
  const [vehicleInfo, setVehicleInfo] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const { db, addNotification } = useDB();
  const { activeTenantId } = useApp();
  const activeTenant = useMemo(() => db.tenants.find((t: any) => t.id === activeTenantId), [db.tenants, activeTenantId]);

  const handleSubmit = async () => {
    const validItems = items.filter(i => i.quantity > 0);
    if (validItems.length === 0) { addNotification('Sélectionnez au moins un article', 'error'); return; }
    setLoading(true);
    try {
      const res = await authFetch(`/api/delivery-notes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: invoice.id, items: validItems, notes, driverName, vehicleInfo, deliveryAddress })
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      addNotification('Bon de livraison créé');
      onCreated();
    } catch (err: any) { addNotification(err.message || 'Erreur', 'error'); }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-gray-900 border border-gray-800 rounded-2xl max-w-lg w-full p-5 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><Truck className="w-4 h-4 text-blue-400" /> Nouveau BL</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-800 rounded"><X className="w-4 h-4 text-gray-500" /></button>
        </div>
        <p className="text-xs text-gray-400 mb-4">Facture: <span className="font-mono text-white">{invoice.invoiceNumber}</span></p>

        <div className="space-y-2 mb-4">
          {(invoice.items || []).map((item: any) => {
            const remaining = item.quantity - (item.qtyDelivered || 0) - (item.qtyReturned || 0);
            if (remaining <= 0) return null;
            const itemState = items.find(i => i.invoiceItemId === item.id);
            return (
              <div key={item.id} className="flex items-center gap-3 bg-gray-950 rounded-lg p-3 border border-gray-800">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">{item.productName}</p>
                  <p className="text-[9px] text-gray-500 font-mono">Reliquat: {remaining} | Prix: {formatCurrency(item.price, activeTenant?.currency)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setItems(prev => prev.map(i => i.invoiceItemId === item.id ? { ...i, quantity: Math.max(0, i.quantity - 1) } : i))} className="w-7 h-7 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs font-bold">-</button>
                  <span className="w-10 text-center text-xs font-mono font-bold text-white">{itemState?.quantity || 0}</span>
                  <button onClick={() => setItems(prev => prev.map(i => i.invoiceItemId === item.id ? { ...i, quantity: Math.min(remaining, i.quantity + 1) } : i))} className="w-7 h-7 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs font-bold">+</button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <input value={driverName} onChange={e => setDriverName(e.target.value)} placeholder="Chauffeur / Livreur" className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
          <input value={vehicleInfo} onChange={e => setVehicleInfo(e.target.value)} placeholder="Véhicule (immatriculation)" className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
          <div className="col-span-2"><input value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} placeholder="Adresse de livraison" className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" /></div>
        </div>
        <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optionnel)" className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white mb-4" />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold px-4 py-2 rounded-lg">Annuler</button>
          <button onClick={handleSubmit} disabled={loading} className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1">
            {loading ? 'Création...' : <><Truck className="w-3.5 h-3.5" /> Créer le BL</>}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function PaymentPanel({ invoice, onClose, onDone }: { invoice: Invoice; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(String(invoice.total - (invoice.paidAmount || 0)));
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(false);
  const { db, addNotification } = useDB();
  const { activeTenantId } = useApp();
  const activeTenant = useMemo(() => db.tenants.find((t: any) => t.id === activeTenantId), [db.tenants, activeTenantId]);

  const handleSubmit = async () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) { addNotification('Montant invalide', 'error'); return; }
    setLoading(true);
    try {
      const res = await authFetch(`/api/invoices/${invoice.id}/payments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: val, method, reference: reference || null })
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      addNotification(`Paiement de ${formatCurrency(val, activeTenant?.currency)} enregistré`);
      onDone();
    } catch (err: any) { addNotification(err.message || 'Erreur', 'error'); }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-gray-900 border border-gray-800 rounded-2xl max-w-sm w-full p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><CreditCard className="w-4 h-4 text-violet-400" /> Encaissement</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-800 rounded"><X className="w-4 h-4 text-gray-500" /></button>
        </div>
        <p className="text-xs text-gray-400 mb-4">Facture: <span className="font-mono text-white">{invoice.invoiceNumber}</span> | Restant dû: <span className="font-mono text-amber-400">{formatCurrency(invoice.total - (invoice.paidAmount || 0), activeTenant?.currency)}</span></p>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-mono text-gray-500 block mb-1">Montant</label>
            <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-sm font-mono text-white" />
          </div>
          <div>
            <label className="text-[10px] font-mono text-gray-500 block mb-1">Méthode</label>
            <select value={method} onChange={e => setMethod(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white">
              <option value="cash">Espèces</option>
              <option value="card">Carte bancaire</option>
              <option value="mobile_money">Mobile Money</option>
              <option value="bank_transfer">Virement bancaire</option>
              <option value="check">Chèque</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-mono text-gray-500 block mb-1">Référence (optionnel)</label>
            <input value={reference} onChange={e => setReference(e.target.value)} placeholder="N° de transaction" className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose} className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold px-4 py-2 rounded-lg">Annuler</button>
          <button onClick={handleSubmit} disabled={loading} className="bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold px-4 py-2 rounded-lg">
            {loading ? 'Enregistrement...' : 'Enregistrer le paiement'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function ReturnPanel({ invoice, onClose, onDone }: { invoice: Invoice; onClose: () => void; onDone: () => void }) {
  const [items, setItems] = useState<{ invoiceItemId: string; quantity: number; reason: string }[]>(
    (invoice.items || [])
      .filter((i: any) => (i.qtyDelivered || 0) - (i.qtyReturned || 0) > 0)
      .map((i: any) => ({ invoiceItemId: i.id, quantity: 0, reason: '' }))
  );
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const { addNotification } = useDB();

  const handleSubmit = async () => {
    const validItems = items.filter(i => i.quantity > 0);
    if (validItems.length === 0) { addNotification('Sélectionnez au moins un article', 'error'); return; }
    setLoading(true);
    try {
      const res = await authFetch(`/api/invoices/${invoice.id}/returns`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: validItems.map(i => ({ invoiceItemId: i.invoiceItemId, quantity: i.quantity, reason: i.reason })), reason })
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      addNotification('Retour créé');
      onDone();
    } catch (err: any) { addNotification(err.message || 'Erreur', 'error'); }
    setLoading(false);
  };

  const updateQty = (idx: number, qty: number) => {
    setItems(prev => prev.map((i, index) => index === idx ? { ...i, quantity: qty } : i));
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-gray-900 border border-gray-800 rounded-2xl max-w-lg w-full p-5 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><Undo2 className="w-4 h-4 text-amber-400" /> Nouveau retour</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-800 rounded"><X className="w-4 h-4 text-gray-500" /></button>
        </div>
        <p className="text-xs text-gray-400 mb-4">Facture: <span className="font-mono text-white">{invoice.invoiceNumber}</span></p>
        <div className="space-y-2 mb-4">
          {(invoice.items || []).map((item: any, idx: number) => {
            const deliverable = (item.qtyDelivered || 0) - (item.qtyReturned || 0);
            if (deliverable <= 0) return null;
            return (
              <div key={item.id} className="bg-gray-950 rounded-lg p-3 border border-gray-800">
                <p className="text-xs font-medium text-white mb-2">{item.productName}</p>
                <p className="text-[9px] text-gray-500 mb-2 font-mono">Retournable: {deliverable}</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => updateQty(idx, Math.max(0, (items[idx]?.quantity || 0) - 1))} className="w-7 h-7 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs font-bold">-</button>
                  <span className="w-10 text-center text-xs font-mono font-bold text-white">{items[idx]?.quantity || 0}</span>
                  <button onClick={() => updateQty(idx, Math.min(deliverable, (items[idx]?.quantity || 0) + 1))} className="w-7 h-7 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs font-bold">+</button>
                  <input value={items[idx]?.reason || ''} onChange={e => setItems(prev => prev.map((i, index) => index === idx ? { ...i, reason: e.target.value } : i))} placeholder="Motif" className="flex-1 bg-gray-900 border border-gray-800 rounded-lg p-1.5 text-[10px] text-white" />
                </div>
              </div>
            );
          })}
        </div>
        <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Motif général du retour (optionnel)" className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white mb-4" />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold px-4 py-2 rounded-lg">Annuler</button>
          <button onClick={handleSubmit} disabled={loading} className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold px-4 py-2 rounded-lg">
            {loading ? 'Création...' : 'Créer le retour'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function CreateInvoice({ onCreated }: { onCreated: () => void }) {
  const { db, addNotification } = useDB();
  const { activeTenantId, activeUser } = useApp();
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [items, setItems] = useState<{ productId: string; productName: string; quantity: number; price: number }[]>([]);
  const [taxRate, setTaxRate] = useState(20);
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [shipping, setShipping] = useState(0);
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [commissionAffiliateId, setCommissionAffiliateId] = useState('');
  const [commissionRate, setCommissionRate] = useState(0);
  const [commissionSchedule, setCommissionSchedule] = useState('immediate');
  const [commissionImmediate, setCommissionImmediate] = useState(0);
  const [loading, setLoading] = useState(false);

  const activeTenant = useMemo(() => db.tenants.find((t: any) => t.id === activeTenantId), [db.tenants, activeTenantId]);
  const tenantProducts = useMemo(() => db.products.filter((p: any) => p.tenantId === activeTenantId), [db.products, activeTenantId]);
  const customers = useMemo(() => db.customers.filter((c: any) => c.tenantId === activeTenantId), [db.customers, activeTenantId]);
  const affiliates = useMemo(() => (db.affiliates || []).filter((a: any) => a.tenantId === activeTenantId && (a.status !== 'inactive')), [db.affiliates, activeTenantId]);

  const handleAddItem = () => {
    setItems(prev => [...prev, { productId: '', productName: '', quantity: 1, price: 0 }]);
  };

  const handleRemoveItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleItemChange = (idx: number, field: string, value: any) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: value };
      if (field === 'productId') {
        const prod = tenantProducts.find((p: any) => p.id === value);
        if (prod) { updated.productName = prod.name; updated.price = prod.sellPrice; }
      }
      return updated;
    }));
  };

  const handleCustomerSelect = (id: string) => {
    setCustomerId(id);
    const c = customers.find((c: any) => c.id === id);
    if (c) { setCustomerName(c.name); setCustomerPhone(c.phone || ''); setCustomerEmail(c.email || ''); }
  };

  const subtotal = items.reduce((a, i) => a + (i.price * i.quantity), 0);
  const discAmount = discountType === 'percentage' ? subtotal * (discount / 100) : discount;
  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax - discAmount + shipping;
  const commissionEstimate = commissionAffiliateId && commissionRate > 0 ? (subtotal * commissionRate / 100) : 0;

  const handleSubmit = async () => {
    if (items.length === 0) { addNotification('Ajoutez au moins un article', 'error'); return; }
    setLoading(true);
    try {
      const res = await authFetch('/api/invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customerId || null, customerName: customerName || null, customerPhone: customerPhone || null,
          customerEmail: customerEmail || null, items: items.map(i => ({ ...i, productSku: tenantProducts.find((p: any) => p.id === i.productId)?.sku || '' })),
          taxRate, discount, discountType, shipping, notes, dueDate: dueDate || null,
          ...(commissionAffiliateId && commissionRate > 0 ? {
            commission: {
              affiliateId: commissionAffiliateId,
              rate: commissionRate,
              paymentSchedule: commissionSchedule,
              immediatePayment: commissionSchedule === 'immediate' ? commissionEstimate : commissionImmediate || 0,
            }
          } : {})
        })
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      addNotification('Facture créée');
      onCreated();
    } catch (err: any) { addNotification(err.message || 'Erreur', 'error'); }
    setLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <h2 className="text-lg font-bold text-white">Nouvelle facture</h2>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider font-mono">Client</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-mono text-gray-500 block mb-1">Client existant</label>
            <select value={customerId} onChange={e => handleCustomerSelect(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white">
              <option value="">Nouveau client</option>
              {customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-mono text-gray-500 block mb-1">Nom du client</label>
            <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Nom" className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
          </div>
          <div>
            <label className="text-[10px] font-mono text-gray-500 block mb-1">Téléphone</label>
            <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="+33 6 00 00 00 00" className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
          </div>
          <div>
            <label className="text-[10px] font-mono text-gray-500 block mb-1">Email</label>
            <input value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="email@exemple.com" className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
          </div>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider font-mono">Articles</h3>
          <button onClick={handleAddItem} className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1">
            <Plus className="w-3 h-3" /> Ajouter
          </button>
        </div>
        {items.map((item, idx) => (
          <div className="overflow-x-auto"><div key={idx} className="grid grid-cols-12 gap-2 items-center bg-gray-950 rounded-lg p-3 border border-gray-800">
            <div className="col-span-4">
              <select value={item.productId} onChange={e => handleItemChange(idx, 'productId', e.target.value)} className="w-full bg-gray-900 border border-gray-800 rounded-lg p-2 text-xs text-white">
                <option value="">Sélectionner</option>
                {tenantProducts.map((p: any) => <option key={p.id} value={p.id}>{p.name} ({formatCurrency(p.sellPrice, activeTenant?.currency)})</option>)}
              </select>
            </div>
            <div className="col-span-1">
              <input value={item.productName} onChange={e => handleItemChange(idx, 'productName', e.target.value)} placeholder="Nom" className="w-full bg-gray-900 border border-gray-800 rounded-lg p-2 text-xs text-white" />
            </div>
            <div className="col-span-1">
              <input type="number" min="1" value={item.quantity} onChange={e => handleItemChange(idx, 'quantity', parseInt(e.target.value) || 1)} className="w-full bg-gray-900 border border-gray-800 rounded-lg p-2 text-xs text-white font-mono text-center" />
            </div>
            <div className="col-span-2">
              <input type="number" step="0.01" value={item.price} onChange={e => handleItemChange(idx, 'price', parseFloat(e.target.value) || 0)} className="w-full bg-gray-900 border border-gray-800 rounded-lg p-2 text-xs text-white font-mono" />
            </div>
            <div className="col-span-3 text-right font-mono text-sm font-bold text-white">
              {formatCurrency(item.price * item.quantity, activeTenant?.currency)}
            </div>
            <div className="col-span-1">
              <button onClick={() => handleRemoveItem(idx)} className="p-1.5 hover:bg-red-500/10 rounded text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div></div>
        ))}
        {items.length === 0 && (
          <div className="text-center py-8 text-gray-500 text-xs">Cliquez sur "Ajouter" pour ajouter des articles</div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <label className="text-[10px] font-mono text-gray-500 block mb-1">TVA (%)</label>
          <input type="number" value={taxRate} onChange={e => setTaxRate(parseFloat(e.target.value) || 0)} className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white font-mono" />
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <label className="text-[10px] font-mono text-gray-500 block mb-1">Remise</label>
          <div className="flex gap-2">
            <input type="number" value={discount} onChange={e => setDiscount(parseFloat(e.target.value) || 0)} className="flex-1 bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white font-mono" />
            <select value={discountType} onChange={e => setDiscountType(e.target.value as any)} className="bg-gray-950 border border-gray-800 rounded-lg p-2 text-xs text-white">
              <option value="percentage">%</option>
              <option value="fixed">Montant</option>
            </select>
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <label className="text-[10px] font-mono text-gray-500 block mb-1">Frais de port</label>
          <input type="number" value={shipping} onChange={e => setShipping(parseFloat(e.target.value) || 0)} className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white font-mono" />
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex justify-between text-xs text-gray-400 py-1"><span>Sous-total</span><span className="font-mono text-white">{formatCurrency(subtotal, activeTenant?.currency)}</span></div>
        <div className="flex justify-between text-xs text-gray-400 py-1"><span>TVA ({taxRate}%)</span><span className="font-mono text-white">{formatCurrency(tax, activeTenant?.currency)}</span></div>
        {discount > 0 && <div className="flex justify-between text-xs text-gray-400 py-1"><span>Remise</span><span className="font-mono text-red-400">-{formatCurrency(discAmount, activeTenant?.currency)}</span></div>}
        {shipping > 0 && <div className="flex justify-between text-xs text-gray-400 py-1"><span>Frais de port</span><span className="font-mono text-white">{formatCurrency(shipping, activeTenant?.currency)}</span></div>}
        <div className="flex justify-between text-sm font-bold text-white pt-2 border-t border-gray-800 mt-2"><span>Total TTC</span><span className="font-mono">{formatCurrency(total, activeTenant?.currency)}</span></div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
        <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optionnel)" className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
        <div>
          <label className="text-[10px] font-mono text-gray-500 block mb-1">Date d'échéance (optionnelle)</label>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white" />
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider font-mono">Apporteur d'affaires (commission)</h3>
          {commissionAffiliateId && (
            <button onClick={() => { setCommissionAffiliateId(''); setCommissionRate(0); setCommissionImmediate(0); }} className="text-[10px] font-mono text-red-400 hover:text-red-300 flex items-center gap-1">
              <X className="w-3 h-3" /> Retirer
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-mono text-gray-500 block mb-1">Apporteur</label>
            <select value={commissionAffiliateId} onChange={e => setCommissionAffiliateId(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white">
              <option value="">Aucun</option>
              {affiliates.map((a: any) => <option key={a.id} value={a.id}>{a.firstName} {a.lastName}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-mono text-gray-500 block mb-1">Taux de commission (%)</label>
            <input type="number" min="0" step="0.1" value={commissionRate} onChange={e => setCommissionRate(parseFloat(e.target.value) || 0)} disabled={!commissionAffiliateId} className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white font-mono disabled:opacity-50" placeholder="0" />
          </div>
          <div>
            <label className="text-[10px] font-mono text-gray-500 block mb-1">Échéance de paiement</label>
            <select value={commissionSchedule} onChange={e => setCommissionSchedule(e.target.value)} disabled={!commissionAffiliateId} className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white disabled:opacity-50">
              <option value="immediate">Immédiate</option>
              <option value="later">30 jours</option>
              <option value="weekly">Hebdomadaire (7j)</option>
              <option value="bi_weekly">Bi-hebdomadaire (15j)</option>
              <option value="end_of_month">Fin de mois</option>
            </select>
          </div>
          {commissionSchedule !== 'immediate' && (
            <div>
              <label className="text-[10px] font-mono text-gray-500 block mb-1">Acompte immédiat (optionnel)</label>
              <input type="number" min="0" value={commissionImmediate} onChange={e => setCommissionImmediate(parseFloat(e.target.value) || 0)} disabled={!commissionAffiliateId} className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2.5 text-xs text-white font-mono disabled:opacity-50" placeholder="0" />
            </div>
          )}
        </div>
        {commissionAffiliateId && commissionRate > 0 && (
          <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-gray-800">
            <span>Commission estimée ({commissionRate}% du sous-total)</span>
            <span className="font-mono font-bold text-emerald-400">{formatCurrency(commissionEstimate, activeTenant?.currency)}</span>
          </div>
        )}
      </div>

      <div className="flex gap-3 justify-end">
        <button onClick={onCreated} className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold px-5 py-2.5 rounded-lg">Annuler</button>
        <button onClick={handleSubmit} disabled={loading} className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-5 py-2.5 rounded-lg flex items-center gap-1.5">
          {loading ? 'Création...' : <><FileText className="w-4 h-4" /> Créer la facture</>}
        </button>
      </div>
    </div>
  );
}

export default function Invoicing() {
  const { db } = useDB();
  const { activeTenantId } = useApp();
  const [tab, setTab] = useState<InvoicingTab>('list');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  const invoices = useMemo(() => {
    let list = (db.invoices || []).filter((i: Invoice) => i.tenantId === activeTenantId);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((i: Invoice) =>
        i.invoiceNumber.toLowerCase().includes(q) ||
        (i.customerName || '').toLowerCase().includes(q)
      );
    }
    if (statusFilter) list = list.filter((i: Invoice) => i.status === statusFilter);
    return list.sort((a: Invoice, b: Invoice) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [db.invoices, activeTenantId, search, statusFilter]);

  const stats = useMemo(() => {
    const totalInvoices = invoices.length;
    const totalAmount = invoices.reduce((a: number, i: Invoice) => a + i.total, 0);
    const totalPaid = invoices.reduce((a: number, i: Invoice) => a + (i.paidAmount || 0), 0);
    const draftCount = invoices.filter((i: Invoice) => i.status === 'draft').length;
    const validatedCount = invoices.filter((i: Invoice) => i.status === 'validated').length;
    const overdueCount = invoices.filter((i: Invoice) => i.paymentStatus === 'overdue' || (i.status === 'validated' && i.paidAmount < i.total && i.dueDate && new Date(i.dueDate) < new Date())).length;
    const unpaidCount = invoices.filter((i: Invoice) => i.paymentStatus === 'unpaid' || i.paymentStatus === 'partially_paid').length;
    return { totalInvoices, totalAmount, totalPaid, draftCount, validatedCount, overdueCount, unpaidCount };
  }, [invoices]);

  const formatted = useCallback((v: number) => {
    const t = db.tenants.find((t: any) => t.id === activeTenantId);
    return formatCurrency(v, t?.currency);
  }, [db.tenants, activeTenantId]);

  const handleSelectInvoice = (id: string) => {
    setSelectedInvoiceId(id);
    setTab('detail');
  };

  const handleBack = () => {
    setTab('list');
    setSelectedInvoiceId(null);
  };

  if (tab === 'create') return <CreateInvoice onCreated={() => setTab('list')} />;
  if (tab === 'detail' && selectedInvoiceId) return <InvoiceDetail invoiceId={selectedInvoiceId} onBack={handleBack} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-white font-display">Facturation ERP</h1>
          <p className="text-xs text-gray-500">Gestion des factures, bons de livraison, paiements et retours</p>
        </div>
        <button onClick={() => setTab('create')} className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-lg shadow-blue-500/15">
          <Plus className="w-4 h-4" /> Nouvelle facture
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
          <p className="text-[9px] uppercase tracking-wider text-gray-500 font-mono">Total factures</p>
          <p className="text-xl font-bold font-mono text-white mt-1">{stats.totalInvoices}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
          <p className="text-[9px] uppercase tracking-wider text-gray-500 font-mono">Montant total</p>
          <p className="text-lg font-bold font-mono text-white mt-1">{formatted(stats.totalAmount)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
          <p className="text-[9px] uppercase tracking-wider text-gray-500 font-mono">Encaissé</p>
          <p className="text-lg font-bold font-mono text-emerald-400 mt-1">{formatted(stats.totalPaid)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
          <p className="text-[9px] uppercase tracking-wider text-gray-500 font-mono">Brouillons</p>
          <p className="text-lg font-bold font-mono text-amber-400 mt-1">{stats.draftCount}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
          <p className="text-[9px] uppercase tracking-wider text-gray-500 font-mono">Non payées</p>
          <p className="text-lg font-bold font-mono text-red-400 mt-1">{stats.unpaidCount}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
          <p className="text-[9px] uppercase tracking-wider text-gray-500 font-mono">En retard</p>
          <p className="text-lg font-bold font-mono text-rose-400 mt-1">{stats.overdueCount}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher facture, client..." className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-xs text-white">
          <option value="">Tous les statuts</option>
          <option value="draft">Brouillon</option>
          <option value="validated">Validée</option>
          <option value="cancelled">Annulée</option>
          <option value="archived">Archivée</option>
        </select>
      </div>

      {invoices.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 text-gray-700 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Aucune facture trouvée</p>
          <button onClick={() => setTab('create')} className="mt-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2 rounded-lg inline-flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Créer une facture
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {invoices.map((inv: Invoice) => (
            <InvoiceCard key={inv.id} invoice={inv} onSelect={handleSelectInvoice} formatted={formatted} />
          ))}
        </div>
      )}
    </div>
  );
}
