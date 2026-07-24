import { describe, expect, it } from 'vitest';
import type { Product } from '../types';
import { filterProducts, getProductStockState } from './productCatalog';

const sampleProducts: Product[] = [
  {
    id: '1',
    name: 'Produit Alpha',
    sku: 'SKU-1',
    barcode: '123456',
    description: 'Alpha',
    category: 'Électronique',
    buyPrice: 100,
    sellPrice: 150,
    quantity: 0,
    alertThreshold: 5,
    tenantId: 'tenant-1',
    createdAt: '2024-01-01',
  },
  {
    id: '2',
    name: 'Produit Beta',
    sku: 'SKU-2',
    barcode: '654321',
    description: 'Beta',
    category: 'Mobilier',
    buyPrice: 80,
    sellPrice: 120,
    quantity: 3,
    alertThreshold: 5,
    tenantId: 'tenant-1',
    createdAt: '2024-01-01',
  },
];

describe('product catalog business helpers', () => {
  it('filters products by search term, category and alert mode', () => {
    expect(filterProducts(sampleProducts, 'alpha', 'Tous', false)).toHaveLength(1);
    expect(filterProducts(sampleProducts, '', 'Électronique', false)).toHaveLength(1);
    expect(filterProducts(sampleProducts, '', 'Tous', true)).toHaveLength(2);
  });

  it('detects stock states correctly', () => {
    expect(getProductStockState(sampleProducts[0])).toBe('out');
    expect(getProductStockState(sampleProducts[1])).toBe('low');
  });
});
