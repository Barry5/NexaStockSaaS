import { useMemo, useState, memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingBag, Package, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Plus, Users, Briefcase, FileText, Printer, Calendar
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar, Cell } from 'recharts';
import { useDB, useApp } from '../context';
import { formatCurrency } from '../utils';
import { CHART_COLORS } from '../constants';

const COLORS = CHART_COLORS;

function useDashboardData() {
  const { db } = useDB();
  const { activeTenantId, setCurrentTab } = useApp();

  const activeTenant = useMemo(() => db.tenants.find(t => t.id === activeTenantId), [db.tenants, activeTenantId]);
  const tenantProducts = useMemo(() => db.products.filter(p => p.tenantId === activeTenantId), [db.products, activeTenantId]);
  const tenantSales = useMemo(() => db.sales.filter(s => s.tenantId === activeTenantId), [db.sales, activeTenantId]);
  const tenantExpenses = useMemo(() => db.expenses.filter(e => e.tenantId === activeTenantId), [db.expenses, activeTenantId]);
  const tenantLoans = useMemo(() => db.loans.filter(l => l.tenantId === activeTenantId), [db.loans, activeTenantId]);

  const totalRevenue = useMemo(() => tenantSales.reduce((acc, s) => acc + s.total, 0), [tenantSales]);

  const totalCostOfGoodsSold = useMemo(() =>
    tenantSales.reduce((acc, s) => {
      const saleCOGS = s.items.reduce((itemAcc, item) => {
        const prod = db.products.find(p => p.id === item.productId);
        const buyPrice = prod ? prod.buyPrice : item.price * 0.6;
        return itemAcc + (buyPrice * item.quantity);
      }, 0);
      return acc + saleCOGS;
    }, 0), [tenantSales, db.products]);

  const totalExpenses = useMemo(() =>
    tenantExpenses.filter(e => e.status === 'paye').reduce((acc, e) => acc + e.amount, 0), [tenantExpenses]);

  const totalProfit = useMemo(() => totalRevenue - totalCostOfGoodsSold, [totalRevenue, totalCostOfGoodsSold]);

  const totalStockValue = useMemo(() => tenantProducts.reduce((acc, p) => acc + (p.quantity * p.buyPrice), 0), [tenantProducts]);
  const totalStockPotentialValue = useMemo(() => tenantProducts.reduce((acc, p) => acc + (p.quantity * p.sellPrice), 0), [tenantProducts]);
  const lowStockItems = useMemo(() => tenantProducts.filter(p => p.quantity <= p.alertThreshold), [tenantProducts]);

  const debtStats = useMemo(() => {
    let weOwe = 0;
    let othersOweUs = 0;
    tenantLoans.forEach(l => {
      if (l.status === 'actif') {
        if (l.type === 'entrant') weOwe += l.remainingBalance;
        if (l.type === 'sortant') othersOweUs += l.remainingBalance;
      }
    });
    const clientOutstanding = db.customers.filter(c => c.tenantId === activeTenantId).reduce((acc, c) => acc + (c.outstandingDebt || 0), 0);
    return { weOwe, othersOweUs: othersOweUs + clientOutstanding };
  }, [tenantLoans, db.customers, activeTenantId]);

  const financialTrendData = useMemo(() => {
    const dates: Record<string, { date: string; revenue: number; expenses: number; profit: number }> = {};
    const baseDate = new Date('2026-07-14');
    for (let i = 6; i >= 0; i--) {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      dates[dateStr] = { date: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }), revenue: 0, expenses: 0, profit: 0 };
    }
    tenantSales.forEach(s => { const ds = s.date.split('T')[0]; if (dates[ds]) dates[ds].revenue += s.total; });
    tenantExpenses.forEach(e => { if (e.status === 'paye' && dates[e.date]) dates[e.date].expenses += e.amount; });
    Object.keys(dates).forEach(key => { dates[key].profit = dates[key].revenue - dates[key].expenses; });
    return Object.values(dates);
  }, [tenantSales, tenantExpenses]);

  const stockByCategoryData = useMemo(() => {
    const cats: Record<string, { name: string; value: number }> = {};
    tenantProducts.forEach(p => {
      if (!cats[p.category]) cats[p.category] = { name: p.category, value: 0 };
      cats[p.category].value += p.quantity;
    });
    return Object.values(cats);
  }, [tenantProducts]);

  const formatted = (val: number) => formatCurrency(val, activeTenant?.currency);

  return { activeTenant, tenantProducts, tenantSales, totalRevenue, totalCostOfGoodsSold, totalExpenses, totalProfit, totalStockValue, totalStockPotentialValue, lowStockItems, debtStats, financialTrendData, stockByCategoryData, formatted, onNavigate: setCurrentTab };
}

function DashboardInner() {
  const {
    activeTenant, tenantProducts, tenantSales, totalRevenue, totalProfit, totalExpenses, totalStockValue,
    totalStockPotentialValue, lowStockItems, debtStats, financialTrendData,
    stockByCategoryData, formatted, onNavigate
  } = useDashboardData();

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [pdfStartDate, setPdfStartDate] = useState('');
  const [pdfEndDate, setPdfEndDate] = useState('');
  const [pdfPaymentMethod, setPdfPaymentMethod] = useState<'Tous' | string>('Tous');

  const filteredSalesForReport = useMemo(() =>
    tenantSales.filter(sale => {
      if (pdfStartDate) { const sd = new Date(sale.date).toISOString().split('T')[0]; if (sd < pdfStartDate) return false; }
      if (pdfEndDate) { const sd = new Date(sale.date).toISOString().split('T')[0]; if (sd > pdfEndDate) return false; }
      if (pdfPaymentMethod !== 'Tous' && sale.paymentMethod !== pdfPaymentMethod) return false;
      return true;
    }), [tenantSales, pdfStartDate, pdfEndDate, pdfPaymentMethod]);

  const reportTotalRevenue = useMemo(() => filteredSalesForReport.reduce((acc, s) => acc + s.total, 0), [filteredSalesForReport]);

  const handlePrintSalesReportPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) { alert("La fenêtre d'impression a été bloquée."); return; }
    const tableRows = filteredSalesForReport.map(sale => {
      const dateStr = new Date(sale.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const itemsList = sale.items.map(it => `${it.productName} (x${it.quantity})`).join(', ');
      return `<tr style="border-bottom:1px solid #edf2f7;font-size:11px;">
        <td style="padding:10px;font-weight:bold;font-family:monospace;color:#ef4444;">${sale.invoiceNumber}</td>
        <td style="padding:10px;">${dateStr}</td>
        <td style="padding:10px;font-weight:500;">${sale.customerName || 'Passager'}</td>
        <td style="padding:10px;font-size:10px;color:#4a5568;max-width:280px;">${itemsList}</td>
        <td style="padding:10px;text-transform:uppercase;font-weight:600;font-family:monospace;font-size:10px;">${sale.paymentMethod}</td>
        <td style="padding:10px;text-align:right;font-weight:bold;font-family:monospace;color:#1a202c;">${sale.total.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} ${activeTenant?.currency || 'EUR'}</td>
      </tr>`;
    }).join('');
    const logoHtml = activeTenant?.logo
      ? `<img src="${activeTenant.logo}" alt="Logo" style="height:50px;object-fit:contain;margin-bottom:10px;border-radius:6px;" />`
      : `<div style="font-size:20px;font-weight:bold;color:#ef4444;border:2px solid #ef4444;padding:4px 10px;display:inline-block;border-radius:4px;font-family:sans-serif;">${activeTenant?.name?.[0] || 'N'}</div>`;
    const currentDateStr = new Date().toLocaleString('fr-FR');
    const periodStr = pdfStartDate || pdfEndDate ? `Période du ${pdfStartDate || 'début'} au ${pdfEndDate || 'fin'}` : 'Toutes les ventes enregistrées';
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Rapport de Ventes - ${activeTenant?.name || 'Organisation'}</title><style>
      body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#2d3748;margin:0;padding:40px;line-height:1.4;}
      .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #edf2f7;padding-bottom:20px;margin-bottom:25px;}
      .company-info h1{margin:0;font-size:18px;font-weight:800;color:#1a202c;}
      .company-info p{margin:3px 0 0;font-size:10px;color:#718096;}
      .report-title h2{margin:0;font-size:20px;font-weight:900;color:#ef4444;text-transform:uppercase;letter-spacing:1px;}
      .stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:25px;}
      .stat-card{background:#f7fafc;border:1px solid #edf2f7;border-radius:6px;padding:10px 12px;}
      .stat-card .label{font-size:8px;text-transform:uppercase;color:#718096;font-weight:bold;letter-spacing:.5px;}
      .stat-card .val{font-size:14px;font-weight:bold;color:#1a202c;margin-top:4px;font-family:monospace;}
      .sales-table{width:100%;border-collapse:collapse;margin-top:15px;}
      .sales-table th{background:#f7fafc;color:#4a5568;font-size:8px;font-weight:bold;text-transform:uppercase;padding:8px 10px;text-align:left;border-bottom:2px solid #edf2f7;}
      .footer{margin-top:50px;border-top:1px solid #edf2f7;padding-top:12px;text-align:center;font-size:9px;color:#a0aec0;}
      @media print{body{padding:0}}
    </style></head><body>
      <div class="header"><div class="company-info">${logoHtml}<h1>${activeTenant?.name || 'Organisation'}</h1><p>${activeTenant?.address || 'Adresse de la boutique'}</p><p>Tél : ${activeTenant?.phone || 'Non renseigné'}</p></div>
      <div class="report-title"><h2>Rapport de Ventes</h2><p>${periodStr}</p><p style="margin-top:6px;">Généré le : ${currentDateStr}</p></div></div>
      <div class="stats-grid"><div class="stat-card"><div class="label">Chiffre d'Affaires</div><div class="val" style="color:#10b981;">${reportTotalRevenue.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} ${activeTenant?.currency || 'EUR'}</div></div>
      <div class="stat-card"><div class="label">Nombre de Ventes</div><div class="val">${filteredSalesForReport.length}</div></div>
      <div class="stat-card"><div class="label">Panier Moyen</div><div class="val">${filteredSalesForReport.length > 0 ? (reportTotalRevenue / filteredSalesForReport.length).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) : '0,00'} ${activeTenant?.currency || 'EUR'}</div></div>
      <div class="stat-card"><div class="label">Filtre Paiement</div><div class="val" style="text-transform:uppercase;">${pdfPaymentMethod}</div></div></div>
      <h3 style="font-size:12px;font-weight:bold;border-bottom:1px solid #edf2f7;padding-bottom:4px;color:#4a5568;">Détail des transactions</h3>
      <table class="sales-table"><thead><tr><th>Référence</th><th>Date</th><th>Client</th><th>Articles</th><th>Méthode</th><th style="text-align:right;">Montant</th></tr></thead><tbody>${tableRows || '<tr><td colspan="6" style="text-align:center;padding:25px;color:#a0aec0;">Aucune transaction.</td></tr>'}</tbody></table>
      <div style="margin-top:25px;text-align:right;"><p style="font-size:11px;color:#718096;margin:0;">Total net :</p><p style="font-size:18px;font-weight:bold;color:#1a202c;margin:4px 0 0;font-family:monospace;">${reportTotalRevenue.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} ${activeTenant?.currency || 'EUR'}</p></div>
      <div class="footer"><p>Document comptable généré par NexaStock SaaS Central.</p></div>
      <script>window.onload=function(){window.print();};<\/script></body></html>`);
    printWindow.document.close();
  };

  const handlePrintSingleSalePDF = (sale: any) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) { alert("La fenêtre a été bloquée."); return; }
    const itemsRows = sale.items.map((it: any) =>
      `<tr style="border-bottom:1px dashed #e2e8f0;font-size:11px;"><td style="padding:6px 0;">${it.productName}</td><td style="padding:6px 0;text-align:center;">${it.quantity}</td><td style="padding:6px 0;text-align:right;">${it.price.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</td><td style="padding:6px 0;text-align:right;font-weight:bold;">${it.total.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}</td></tr>`
    ).join('');
    const logoHtml = activeTenant?.logo
      ? `<img src="${activeTenant.logo}" alt="Logo" style="height:45px;object-fit:contain;margin-bottom:8px;" />`
      : `<div style="font-size:18px;font-weight:bold;color:#ef4444;border:2px solid #ef4444;padding:2px 8px;display:inline-block;margin-bottom:5px;">${activeTenant?.name?.[0] || 'N'}</div>`;
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Facture ${sale.invoiceNumber}</title><style>
      body{font-family:monospace;color:#000;padding:20px;max-width:380px;margin:0 auto;font-size:11px;line-height:1.3;}
      .text-center{text-align:center;} .bold{font-weight:bold;} .divider{border-top:1px dashed #000;margin:10px 0;}
      table{width:100%;border-collapse:collapse;}
    </style></head><body>
      <div class="text-center">${logoHtml}<h2 style="margin:3px 0;font-size:14px;">${activeTenant?.name || 'Boutique'}</h2><p style="margin:2px 0;">${activeTenant?.address || ''}</p><p style="margin:2px 0;">Tél : ${activeTenant?.phone || ''}</p></div>
      <div class="divider"></div>
      <p class="bold" style="text-align:center;font-size:12px;margin:5px 0;">TICKET DE CAISSE / FACTURE</p>
      <p>N° Facture : <span class="bold">${sale.invoiceNumber}</span></p><p>Date : ${new Date(sale.date).toLocaleString('fr-FR')}</p><p>Vendeur : ${sale.employeeName || 'Caisse'}</p><p>Client : ${sale.customerName || 'Passager'}</p>
      <div class="divider"></div>
      <table><thead><tr style="border-bottom:1px dashed #000;"><th style="text-align:left;">Désignation</th><th style="text-align:center;">Qté</th><th style="text-align:right;">P.U.</th><th style="text-align:right;">Total</th></tr></thead><tbody>${itemsRows}</tbody></table>
      <div class="divider"></div>
      <table style="font-weight:bold;"><tr><td>SOUS-TOTAL</td><td style="text-align:right;">${sale.subtotal.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} ${activeTenant?.currency || 'EUR'}</td></tr>
      <tr><td>REMISE</td><td style="text-align:right;">-${sale.discount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} ${activeTenant?.currency || 'EUR'}</td></tr>
      <tr><td>TVA (${sale.taxRate || 20}%)</td><td style="text-align:right;">${sale.tax.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} ${activeTenant?.currency || 'EUR'}</td></tr>
      <tr style="font-size:12px;border-top:1px dashed #000;"><td style="padding-top:6px;">NET A PAYER (${sale.paymentMethod.toUpperCase()})</td><td style="padding-top:6px;text-align:right;">${sale.total.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} ${activeTenant?.currency || 'EUR'}</td></tr></table>
      <div class="divider"></div>
      <div class="text-center"><p>Merci pour votre confiance !</p><p style="font-size:8px;margin-top:8px;">${sale.invoiceNumber}</p></div>
      <script>window.onload=function(){window.print();};<\/script></body></html>`);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between justify-start gap-4 bg-gradient-to-r from-gray-900 via-slate-900 to-blue-950/20 border border-gray-800 p-6 rounded-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 right-1/4 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none"></div>
        <div>
          <h1 className="text-2xl font-bold font-display text-white tracking-tight flex items-center gap-2">
            Tableau de bord <span className="text-brand-blue font-sans font-normal text-sm bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">{activeTenant?.plan} SaaS</span>
          </h1>
          <p className="text-sm text-gray-400 mt-1">Analyse financière et état général des stocks pour <strong className="text-gray-200">{activeTenant?.name}</strong>.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => onNavigate('pos')} className="flex items-center gap-1.5 bg-brand-blue hover:bg-blue-600 transition text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-lg shadow-blue-500/15">
            <Plus className="w-4 h-4" /> Vente POS
          </button>
          <button onClick={() => onNavigate('expenses')} className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 transition text-gray-100 border border-gray-700 px-4 py-2.5 rounded-xl text-xs font-semibold">
            <DollarSign className="w-4 h-4" /> Saisir Dépense
          </button>
          <button onClick={() => onNavigate('ai')} className="flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:opacity-90 transition text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-lg shadow-purple-500/20">
            <Briefcase className="w-4 h-4" /> Réappro. IA
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
          className="bg-gray-900 border border-gray-800 p-5 rounded-2xl flex flex-col justify-between glow-blue relative group hover:border-gray-700 transition">
          <div className="flex justify-between items-start">
            <div className="bg-blue-500/10 p-2.5 rounded-xl border border-blue-500/10"><DollarSign className="w-5 h-5 text-brand-blue" /></div>
            <span className="text-[10px] uppercase tracking-wider text-gray-500 font-mono flex items-center gap-0.5 text-emerald-400 bg-emerald-500/5 px-2 py-0.5 rounded-full border border-emerald-500/10"><ArrowUpRight className="w-3 h-3 inline" /> +12.5%</span>
          </div>
          <div className="mt-4">
            <p className="text-xs font-medium text-gray-400">Chiffre d'Affaires (Revenus)</p>
            <h3 className="text-2xl font-bold font-mono text-white mt-1">{formatted(totalRevenue)}</h3>
            <p className="text-[10px] text-gray-500 mt-1">Cumulé sur les ventes du point de vente</p>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}
          className="bg-gray-900 border border-gray-800 p-5 rounded-2xl flex flex-col justify-between glow-green relative group hover:border-gray-700 transition">
          <div className="flex justify-between items-start">
            <div className="bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/10"><TrendingUp className="w-5 h-5 text-brand-green" /></div>
            <span className="text-[10px] uppercase tracking-wider text-gray-500 font-mono flex items-center gap-0.5 text-brand-green bg-emerald-500/5 px-2 py-0.5 rounded-full border border-emerald-500/10">Marge Saine</span>
          </div>
          <div className="mt-4">
            <p className="text-xs font-medium text-gray-400">Bénéfice Net Estimé</p>
            <h3 className="text-2xl font-bold font-mono text-white mt-1">{formatted(totalProfit)}</h3>
            <p className="text-[10px] text-gray-500 mt-1">Revenu moins coûts d'achat (les dépenses sont comptabilisées ci-dessous)</p>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}
          className="bg-gray-900 border border-gray-800 p-5 rounded-2xl flex flex-col justify-between relative group hover:border-gray-700 transition">
          <div className="flex justify-between items-start">
            <div className="bg-violet-500/10 p-2.5 rounded-xl border border-violet-500/10"><Package className="w-5 h-5 text-violet-400" /></div>
            <span className="text-[10px] uppercase tracking-wider text-gray-400 font-mono bg-gray-800 px-2 py-0.5 rounded-full">{tenantProducts.length} Réf.</span>
          </div>
          <div className="mt-4">
            <p className="text-xs font-medium text-gray-400">Valeur Globale du Stock (Achat)</p>
            <h3 className="text-2xl font-bold font-mono text-white mt-1">{formatted(totalStockValue)}</h3>
            <p className="text-[10px] text-gray-500 mt-1">Prix vente potentiel : <span className="text-violet-400">{formatted(totalStockPotentialValue)}</span></p>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}
          className="bg-gray-900 border border-gray-800 p-5 rounded-2xl flex flex-col justify-between relative group hover:border-gray-700 transition">
          <div className="flex justify-between items-start">
            <div className="bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/10"><AlertTriangle className="w-5 h-5 text-amber-500" /></div>
            {lowStockItems.length > 0 ? (
              <span className="text-[10px] font-semibold text-white bg-red-600 px-2 py-0.5 rounded-full animate-pulse">CRITIQUE</span>
            ) : (
              <span className="text-[10px] text-emerald-400 bg-emerald-500/5 px-2 py-0.5 rounded-full border border-emerald-500/10">OK</span>
            )}
          </div>
          <div className="mt-4">
            <p className="text-xs font-medium text-gray-400">Alertes Rupture Stock</p>
            <h3 className="text-2xl font-bold font-mono text-white mt-1">{lowStockItems.length} {lowStockItems.length > 1 ? 'articles' : 'article'}</h3>
            <p className="text-[10px] text-gray-500 mt-1">Articles en dessous du seuil critique</p>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-900/60 border border-gray-800/80 p-4 rounded-xl flex items-center justify-between">
          <div><p className="text-xs text-gray-400">Dettes de l'entreprise (Ce que nous devons)</p><h4 className="text-lg font-bold font-mono text-red-400 mt-0.5">{formatted(debtStats.weOwe)}</h4></div>
          <div className="bg-red-500/5 text-red-400 p-2 rounded-lg border border-red-500/10"><TrendingDown className="w-4 h-4" /></div>
        </div>
        <div className="bg-gray-900/60 border border-gray-800/80 p-4 rounded-xl flex items-center justify-between">
          <div><p className="text-xs text-gray-400">Créances clients & prêts (Dû par des tiers)</p><h4 className="text-lg font-bold font-mono text-emerald-400 mt-0.5">{formatted(debtStats.othersOweUs)}</h4></div>
          <div className="bg-emerald-500/5 text-emerald-400 p-2 rounded-lg border border-emerald-500/10"><TrendingUp className="w-4 h-4" /></div>
        </div>
        <div className="bg-gray-900/60 border border-gray-800/80 p-4 rounded-xl flex items-center justify-between">
          <div><p className="text-xs text-gray-400">Dépenses Exploitation (Payées)</p><h4 className="text-lg font-bold font-mono text-gray-200 mt-0.5">{formatted(totalExpenses)}</h4></div>
          <div className="bg-gray-800 text-gray-400 p-2 rounded-lg border border-gray-700"><DollarSign className="w-4 h-4" /></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-gray-900 border border-gray-800 p-5 rounded-2xl lg:col-span-2 flex flex-col justify-between">
          <div className="flex justify-between items-center mb-6">
            <div><h3 className="text-sm font-semibold font-display text-white">Analyse Financière (Derniers 7 Jours)</h3><p className="text-xs text-gray-500">Tendances quotidiennes du chiffre d'affaires et bénéfices</p></div>
            <div className="flex gap-4 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-brand-blue"><span className="w-2.5 h-2.5 rounded-full bg-brand-blue inline-block"></span> Ventes</span>
              <span className="flex items-center gap-1.5 text-brand-green"><span className="w-2.5 h-2.5 rounded-full bg-brand-green inline-block"></span> Bénéfice</span>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={financialTrendData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563EB" stopOpacity={0.2}/><stop offset="95%" stopColor="#2563EB" stopOpacity={0}/></linearGradient>
                  <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10B981" stopOpacity={0.2}/><stop offset="95%" stopColor="#10B981" stopOpacity={0}/></linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="#4B5563" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#4B5563" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#111827', borderColor: '#1F2937', color: '#fff', borderRadius: '12px' }} labelStyle={{ fontWeight: 'bold', fontSize: '11px', color: '#9CA3AF' }} />
                <Area type="monotone" dataKey="revenue" stroke="#2563EB" strokeWidth={2} fillOpacity={1} fill="url(#colorRevenue)" />
                <Area type="monotone" dataKey="profit" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorProfit)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 p-5 rounded-2xl flex flex-col justify-between">
          <div><h3 className="text-sm font-semibold font-display text-white">Répartition du Stock</h3><p className="text-xs text-gray-500">Quantités cumulées par catégorie de produit</p></div>
          <div className="h-48 w-full my-4">
            {stockByCategoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stockByCategoryData}>
                  <XAxis dataKey="name" stroke="#4B5563" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#4B5563" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#111827', borderColor: '#1F2937', color: '#fff', borderRadius: '12px' }} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                  <Bar dataKey="value" name="Unités" radius={[4, 4, 0, 0]}>
                    {stockByCategoryData.map((_, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-gray-500">Aucune catégorie enregistrée.</div>
            )}
          </div>
          <div className="space-y-1.5 overflow-y-auto max-h-32 pr-1">
            {stockByCategoryData.slice(0, 4).map((item, index) => (
              <div key={item.name} className="flex justify-between items-center text-xs">
                <span className="flex items-center gap-1.5 text-gray-400"><span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>{item.name}</span>
                <span className="font-mono text-gray-200 font-semibold">{item.value} unités</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 p-5 rounded-2xl">
          <div className="flex justify-between items-center mb-4">
            <div><h3 className="text-sm font-semibold font-display text-white">Alertes Approvisionnement</h3><p className="text-xs text-gray-500">Produits sous le seuil d'alerte critique</p></div>
            {lowStockItems.length > 0 && (
              <button onClick={() => onNavigate('ai')} className="text-xs font-semibold text-brand-blue hover:underline bg-blue-500/5 hover:bg-blue-500/10 px-2.5 py-1 rounded-lg border border-blue-500/10 transition">Générer un ordre IA</button>
            )}
          </div>
          <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
            {lowStockItems.length > 0 ? lowStockItems.map(item => (
              <div key={item.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-950/80 border border-gray-800 hover:border-amber-500/20 transition">
                <div className="flex items-center gap-3">
                  {item.image ? <img src={item.image} alt={item.name} className="w-9 h-9 rounded-lg object-cover" /> : <div className="w-9 h-9 bg-gray-800 rounded-lg flex items-center justify-center font-bold text-gray-500">{item.name[0]}</div>}
                  <div><h4 className="text-xs font-semibold text-gray-200">{item.name}</h4><p className="text-[10px] text-gray-500 font-mono mt-0.5">SKU: {item.sku} | Cat: {item.category}</p></div>
                </div>
                <div className="text-right"><span className="text-xs font-mono font-semibold text-amber-500 block">{item.quantity} restants</span><span className="text-[10px] text-gray-500 font-mono">Seuil: {item.alertThreshold}</span></div>
              </div>
            )) : (
              <div className="flex flex-col items-center justify-center py-10 text-center text-gray-500">
                <Package className="w-8 h-8 text-emerald-500 mb-2 opacity-40" /><p className="text-xs font-semibold text-gray-400">Tous les stocks sont au vert !</p><p className="text-[10px] text-gray-500 mt-0.5">Aucune rupture de stock signalée.</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 p-5 rounded-2xl">
          <div className="flex justify-between items-center mb-4">
            <div><h3 className="text-sm font-semibold font-display text-white">Ventes Récentes</h3><p className="text-xs text-gray-500">Derniers reçus générés par le terminal POS</p></div>
            <div className="flex items-center gap-2">
              <button onClick={() => setIsExportModalOpen(true)} className="text-xs font-semibold text-brand-green bg-emerald-500/5 hover:bg-emerald-500/10 px-2.5 py-1.5 border border-emerald-500/10 rounded-xl flex items-center gap-1.5 transition"><Printer className="w-3.5 h-3.5" /> Exporter Rapport PDF</button>
              <button onClick={() => onNavigate('pos')} className="text-xs font-semibold text-brand-blue hover:underline bg-blue-500/5 hover:bg-blue-500/10 px-2.5 py-1.5 border border-blue-500/10 rounded-xl transition">Nouveau reçu</button>
            </div>
          </div>
          <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
            {tenantSales.length > 0 ? tenantSales.slice().reverse().map(sale => (
              <div key={sale.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-950/80 border border-gray-800 hover:border-gray-700 transition">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold font-mono text-brand-blue">{sale.invoiceNumber}</span>
                    <span className={`text-[9px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded ${sale.paymentMethod === 'credit' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-emerald-500/10 text-brand-green border border-emerald-500/20'}`}>{sale.paymentMethod}</span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">{sale.items.length} article{sale.items.length > 1 ? 's' : ''} • Client : <strong className="text-gray-300">{sale.customerName || 'Passager'}</strong></p>
                  <p className="text-[9px] text-gray-500 font-mono">{new Date(sale.date).toLocaleString('fr-FR')}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right"><span className="text-xs font-mono font-bold text-white block">{formatted(sale.total)}</span><span className="text-[9px] text-gray-500 block">Vendu par {sale.employeeName}</span></div>
                  <button onClick={() => handlePrintSingleSalePDF(sale)} title="Imprimer / Facture PDF" className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition border border-gray-700"><FileText className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            )) : (
              <div className="flex flex-col items-center justify-center py-10 text-center text-gray-500">
                <ShoppingBag className="w-8 h-8 text-gray-700 mb-2" /><p className="text-xs font-semibold text-gray-400">Aucune vente enregistrée.</p><p className="text-[10px] text-gray-500 mt-0.5">Utilisez le point de vente pour initier une transaction.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isExportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/85 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-gray-900 border border-gray-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="p-5 border-b border-gray-800 bg-gray-950/40 flex justify-between items-center">
                <div className="flex items-center gap-2.5">
                  <div className="bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/15"><Printer className="w-5 h-5 text-brand-green" /></div>
                  <div><h3 className="text-sm font-bold text-white font-display">Export Rapport Comptable PDF</h3><p className="text-xs text-gray-500">Filtrez et générez un rapport comptable complet des ventes de votre organisation</p></div>
                </div>
                <button onClick={() => setIsExportModalOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-850 text-gray-400 hover:text-white transition">✕</button>
              </div>
              <div className="p-5 overflow-y-auto space-y-4 flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div><label className="block text-[10px] font-mono font-bold text-gray-500 uppercase mb-1">Date de début</label><input type="date" value={pdfStartDate} onChange={(e) => setPdfStartDate(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white focus:border-brand-blue outline-none transition" /></div>
                  <div><label className="block text-[10px] font-mono font-bold text-gray-500 uppercase mb-1">Date de fin</label><input type="date" value={pdfEndDate} onChange={(e) => setPdfEndDate(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white focus:border-brand-blue outline-none transition" /></div>
                  <div><label className="block text-[10px] font-mono font-bold text-gray-500 uppercase mb-1">Mode de Paiement</label><select value={pdfPaymentMethod} onChange={(e) => setPdfPaymentMethod(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white focus:border-brand-blue outline-none transition"><option value="Tous">Tous les modes</option><option value="especes">Espèces</option><option value="carte">Carte Bancaire</option><option value="mobile_money">Mobile Money</option><option value="credit">Vente à Crédit</option></select></div>
                </div>
                <div className="bg-gray-950 p-4 rounded-xl border border-gray-800 grid grid-cols-3 gap-4 text-center">
                  <div><p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider font-mono">CA Sélectionné</p><p className="text-base font-black font-mono text-brand-green mt-1">{formatted(reportTotalRevenue)}</p></div>
                  <div><p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider font-mono">Ventes</p><p className="text-base font-black font-mono text-white mt-1">{filteredSalesForReport.length}</p></div>
                  <div><p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider font-mono">Panier Moyen</p><p className="text-base font-black font-mono text-blue-400 mt-1">{formatted(filteredSalesForReport.length > 0 ? (reportTotalRevenue / filteredSalesForReport.length) : 0)}</p></div>
                </div>
                <div><p className="text-[10px] font-mono font-bold text-gray-500 uppercase mb-2">Aperçu ({filteredSalesForReport.length} ventes)</p>
                  <div className="border border-gray-800 rounded-xl overflow-hidden max-h-48 overflow-y-auto overflow-x-auto bg-gray-950/40">
                    <table className="w-full text-left border-collapse"><thead className="bg-gray-950 text-[9px] font-bold text-gray-500 border-b border-gray-800 uppercase tracking-wider"><tr><th className="p-2 pl-3">Facture</th><th className="p-2">Date</th><th className="p-2">Client</th><th className="p-2">Méthode</th><th className="p-2 pr-3 text-right">Montant</th></tr></thead>
                      <tbody className="divide-y divide-gray-800 text-xs">{filteredSalesForReport.length > 0 ? filteredSalesForReport.map(sale => (
                        <tr key={sale.id} className="hover:bg-gray-850/30 text-gray-300"><td className="p-2 pl-3 font-bold font-mono text-brand-blue">{sale.invoiceNumber}</td><td className="p-2 text-gray-500">{new Date(sale.date).toLocaleDateString('fr-FR')}</td><td className="p-2 font-medium">{sale.customerName || 'Passager'}</td><td className="p-2 uppercase font-mono text-[10px] text-gray-400">{sale.paymentMethod}</td><td className="p-2 pr-3 text-right font-bold font-mono text-white">{formatted(sale.total)}</td></tr>
                      )) : <tr><td colSpan={5} className="p-6 text-center text-gray-500 text-xs">Aucune vente trouvée.</td></tr>}</tbody></table>
                  </div>
                </div>
              </div>
              <div className="p-4 border-t border-gray-800 bg-gray-950/40 flex justify-between items-center">
                <button onClick={() => { setPdfStartDate(''); setPdfEndDate(''); setPdfPaymentMethod('Tous'); }} className="text-xs text-gray-500 hover:text-white transition underline">Réinitialiser les filtres</button>
                <div className="flex gap-2">
                  <button onClick={() => setIsExportModalOpen(false)} className="px-4 py-2 bg-gray-800 hover:bg-gray-750 transition text-gray-200 text-xs font-semibold rounded-xl border border-gray-750">Fermer</button>
                  <button disabled={filteredSalesForReport.length === 0} onClick={handlePrintSalesReportPDF} className="px-4 py-2 bg-brand-green hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition text-gray-950 text-xs font-black rounded-xl flex items-center gap-1.5"><Printer className="w-4 h-4" /> Générer & Imprimer PDF</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default memo(DashboardInner);
