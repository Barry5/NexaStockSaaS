import type { Invoice, Sale } from '../types';

/**
 * Chiffre d'affaires : règles de reconnaissance (accrual).
 *
 * Une vente comptoir (table `sales`) est toujours du revenu.
 * Une facture ERP (table `invoices`) ne devient du CA que si elle est
 * `validated`. Les brouillons, factures annulées ou archivées sont exclus.
 * Les factures de type `sale` ajoutent ; les `credit_note` déduisent
 * (réductions/avoir) ; les `purchase`/`debit_note` sont hors CA.
 */

export type RevenueSource = 'pos' | 'facture';

export interface RevenueBreakdown {
  posRevenue: number;
  invoiceRevenue: number;
  totalRevenue: number;
  posCount: number;
  invoiceCount: number;
}

export interface DailyRevenuePoint {
  date: string;
  label: string;
  pos: number;
  invoices: number;
  total: number;
}

export interface MergedTransaction {
  id: string;
  reference: string;
  date: string;
  total: number;
  source: RevenueSource;
  method: string;
  customerName?: string;
  employeeName?: string;
  itemCount: number;
  raw: any;
}

export function isRevenueInvoice(inv: Partial<Invoice>): boolean {
  const status = inv.status || 'draft';
  const type = inv.type || 'sale';
  if (status !== 'validated') return false;
  return type === 'sale' || type === 'credit_note';
}

export function invoiceRevenueSign(inv: Partial<Invoice>): number {
  return (inv.type || 'sale') === 'credit_note' ? -1 : 1;
}

export function dateKey(d: string): string {
  return String(d || '').slice(0, 10);
}

export function toISOKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Agrège les ventes (comptoir) et les factures validées en un seul CA. */
export function computeRevenueBreakdown(sales: Sale[], invoices: Invoice[] = []): RevenueBreakdown {
  const posList = sales || [];
  const invoiceList = (invoices || []).filter(isRevenueInvoice);

  const posRevenue = posList.reduce((acc, s) => acc + (s.total || 0), 0);
  const invoiceRevenue = invoiceList.reduce(
    (acc, i) => acc + (i.total || 0) * invoiceRevenueSign(i),
    0
  );

  return {
    posRevenue,
    invoiceRevenue,
    totalRevenue: posRevenue + invoiceRevenue,
    posCount: posList.length,
    invoiceCount: invoiceList.length,
  };
}

/** Série quotidienne sur les N derniers jours (borne = aujourd'hui réel). */
export function buildDailyRevenueSeries(
  sales: Sale[],
  invoices: Invoice[] = [],
  days: number = 7,
  now: Date = new Date()
): DailyRevenuePoint[] {
  const series: DailyRevenuePoint[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = toISOKey(d);
    series.push({
      date: key,
      label: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
      pos: 0,
      invoices: 0,
      total: 0,
    });
  }

  const byDate = new Map(series.map(p => [p.date, p]));

  for (const s of sales) {
    const entry = byDate.get(dateKey(s.date));
    if (entry) entry.pos += s.total || 0;
  }

  for (const inv of (invoices || []).filter(isRevenueInvoice)) {
    const entry = byDate.get(dateKey(inv.date));
    if (entry) entry.invoices += (inv.total || 0) * invoiceRevenueSign(inv);
  }

  for (const entry of series) {
    entry.total = entry.pos + entry.invoices;
  }

  return series;
}

/** Fusionne ventes comptoir + factures (validées) pour une liste chronologique unifiée. */
export function mergeTransactions(sales: Sale[], invoices: Invoice[] = []): MergedTransaction[] {
  const posTx: MergedTransaction[] = sales.map(s => ({
    id: `${s.id || s.invoiceNumber}-pos`,
    reference: s.invoiceNumber,
    date: s.date,
    total: s.total || 0,
    source: 'pos',
    method: s.paymentMethod || 'especes',
    customerName: s.customerName || 'Passager',
    employeeName: s.employeeName,
    itemCount: Array.isArray(s.items) ? s.items.length : 0,
    raw: s,
  }));

  const invoiceTx: MergedTransaction[] = (invoices || [])
    .filter(isRevenueInvoice)
    .map(inv => ({
      id: `${inv.id || inv.invoiceNumber}-facture`,
      reference: inv.invoiceNumber,
      date: inv.date,
      total: (inv.total || 0) * invoiceRevenueSign(inv),
      source: 'facture' as const,
      method: (inv.type || 'sale') === 'credit_note' ? 'avoir' : (inv.paymentStatus || inv.status || 'validé'),
      customerName: inv.customerName || 'Client',
      employeeName: inv.employeeName,
      itemCount: Array.isArray(inv.items) ? inv.items.length : 0,
      raw: inv,
    }));

  return [...posTx, ...invoiceTx].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}