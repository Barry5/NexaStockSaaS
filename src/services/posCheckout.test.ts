import { describe, expect, it } from 'vitest';
import type { Product } from '../types';
import { buildSaleItems, calculateCheckoutTotals, createInstallments } from './posCheckout';

const product: Product = {
  id: 'p1',
  name: 'Produit A',
  sku: 'SKU-1',
  barcode: '123',
  description: 'desc',
  category: 'Cat',
  buyPrice: 100,
  sellPrice: 200,
  quantity: 10,
  alertThreshold: 2,
  tenantId: 'tenant-1',
  createdAt: '2024-01-01',
};

describe('pos checkout business helpers', () => {
  it('calculates totals consistently', () => {
    const totals = calculateCheckoutTotals(
      [{ product, quantity: 2, negotiatedPrice: 180, lineDiscount: 20 }],
      10,
      'percent',
      18,
      5,
      'especes',
      500,
    );

    expect(totals.cartSubtotal).toBe(320);
    expect(totals.subtotalDiscount).toBe(32);
    expect(totals.computedTax).toBe(51.84);
    expect(totals.orderTotal).toBe(344.84);
    expect(totals.changeReturned).toBe(155.16);
  });

  it('builds sale items from the cart', () => {
    const items = buildSaleItems(
      [{ product, quantity: 2, negotiatedPrice: 180, lineDiscount: 20 }],
      false,
      'livre_total',
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      productId: 'p1',
      quantity: 2,
      total: 360,
      qtyDelivered: 2,
      qtyRemaining: 0,
    });
  });

  it('creates installments for credit sales', () => {
    const installments = createInstallments(1000, 2, '2024-01-01');
    expect(installments).toHaveLength(2);
    expect(installments[0].amount).toBe(500);
    expect(installments[1].amount).toBe(500);
  });
});
