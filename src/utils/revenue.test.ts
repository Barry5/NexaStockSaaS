import { describe, it, expect } from 'vitest';
import {
  computeRevenueBreakdown,
  buildDailyRevenueSeries,
  mergeTransactions,
  isRevenueInvoice,
} from './revenue';

const sale = (over: any) => ({
  id: 's1', invoiceNumber: 'POS-1', tenantId: 't1', date: '2026-08-07T10:00:00.000Z',
  subtotal: 100, tax: 18, total: 118, paymentMethod: 'especes', employeeName: 'Ami', items: [], ...over,
});

const invoice = (over: any) => ({
  id: 'i1', invoiceNumber: 'FAC-1', tenantId: 't1', type: 'sale', date: '2026-08-06T10:00:00.000Z',
  status: 'validated', subtotal: 200, tax: 40, total: 240, paymentStatus: 'paid', employeeName: 'B', items: [], ...over,
});

describe('computeRevenueBreakdown', () => {
  it('totalise ventes comptoir + factures validées', () => {
    const r = computeRevenueBreakdown(
      [sale({ total: 118 }), sale({ total: 50 })],
      [invoice({ total: 240 }), invoice({ id: 'draft', status: 'draft', total: 999 })],
    );
    expect(r.posRevenue).toBe(168);
    expect(r.invoiceRevenue).toBe(240);
    expect(r.totalRevenue).toBe(408);
  });

  it('exclut les factures non validées', () => {
    const r = computeRevenueBreakdown([], [invoice({ status: 'cancelled', total: 500 })]);
    expect(r.invoiceRevenue).toBe(0);
    expect(r.invoiceCount).toBe(0);
  });

  it('déduit les avoirs (credit_note)', () => {
    const r = computeRevenueBreakdown([], [invoice({ type: 'credit_note', total: 40 })]);
    expect(r.invoiceRevenue).toBe(-40);
  });
});

describe('isRevenueInvoice', () => {
  it('valide seulement les factures validated de type sale/credit_note', () => {
    expect(isRevenueInvoice({ status: 'validated', type: 'sale' })).toBe(true);
    expect(isRevenueInvoice({ status: 'validated', type: 'credit_note' })).toBe(true);
    expect(isRevenueInvoice({ status: 'draft', type: 'sale' })).toBe(false);
    expect(isRevenueInvoice({ status: 'validated', type: 'purchase' })).toBe(false);
  });
});

describe('buildDailyRevenueSeries', () => {
  const now = new Date('2026-08-07T12:00:00.000Z');

  it('produit 7 jours et ventile comptoir/factures/total', () => {
    const series = buildDailyRevenueSeries(
      [sale({ date: '2026-08-07T09:00:00.000Z', total: 100 })],
      [invoice({ date: '2026-08-07T08:00:00.000Z', total: 250 })],
      7, now,
    );
    expect(series).toHaveLength(7);
    const today = series[series.length - 1];
    expect(today.pos).toBe(100);
    expect(today.invoices).toBe(250);
    expect(today.total).toBe(350);
  });
});

describe('mergeTransactions', () => {
  it('fusionne POS + factures triées par date décroissante avec source', () => {
    const merged = mergeTransactions(
      [sale({ id: 'a', date: '2026-08-05T10:00:00.000Z', total: 10 })],
      [invoice({ id: 'b', date: '2026-08-06T10:00:00.000Z', total: 20 })],
    );
    expect(merged).toHaveLength(2);
    expect(merged[0].reference).toBe('FAC-1');
    expect(merged[0].source).toBe('facture');
    expect(merged[1].source).toBe('pos');
  });
});