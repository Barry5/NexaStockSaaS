import { describe, expect, it } from 'vitest';
import { filterSalesHistory, getSaleDisplayState } from './posHistory';

describe('pos history business helpers', () => {
  const sales = [
    {
      id: '1',
      invoiceNumber: 'FAC-001',
      customerName: 'Alice',
      status: 'Payée',
      paymentMethod: 'especes',
      total: 1000,
      paymentStatus: 'Payé',
      invoiceStatus: 'Validée',
      deliveryStatus: 'Livrée',
      creditStatus: 'Pas de crédit',
    },
    {
      id: '2',
      invoiceNumber: 'FAC-002',
      customerName: 'Bob',
      status: 'Partiellement payée',
      paymentMethod: 'credit',
      total: 2000,
      creditPaidAmount: 1000,
      paymentStatus: 'Partiellement payé',
      invoiceStatus: 'Validée',
      deliveryStatus: 'Non livrée',
      creditStatus: 'Crédit actif',
    },
  ];

  it('filters history by search text and status', () => {
    expect(filterSalesHistory(sales, 'alice', 'Tous')).toHaveLength(1);
    expect(filterSalesHistory(sales, '', 'Payée')).toHaveLength(1);
    expect(filterSalesHistory(sales, '', 'Tous')).toHaveLength(2);
  });

  it('computes display state for sales consistently', () => {
    const state = getSaleDisplayState(sales[1]);
    expect(state.paymentStatus).toBe('Partiellement payé');
    expect(state.creditStatus).toBe('Crédit actif');
    expect(state.globalStatus).toBe('Crédit en cours');
  });
});
