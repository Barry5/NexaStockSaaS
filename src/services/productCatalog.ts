import type { Product } from '../types';

export type ProductStockState = 'out' | 'low' | 'ok';

export function filterProducts(products: Product[], searchTerm: string, selectedCategory: string, filterAlerts: boolean) {
  const normalizedSearch = searchTerm.toLowerCase().trim();
  return products.filter(product => {
    const matchesSearch = !normalizedSearch || [product.name, product.sku, product.barcode]
      .some(value => value.toLowerCase().includes(normalizedSearch));
    const matchesCategory = selectedCategory === 'Tous' || product.category === selectedCategory;
    const matchesAlerts = !filterAlerts || product.quantity <= product.alertThreshold;
    return matchesSearch && matchesCategory && matchesAlerts;
  });
}

export function getProductStockState(product: Product): ProductStockState {
  if (product.quantity === 0) return 'out';
  if (product.quantity <= product.alertThreshold) return 'low';
  return 'ok';
}

export function formatCurrency(value: number, currency: string) {
  const normalizedCurrency = currency.toUpperCase().trim();
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: normalizedCurrency,
    }).format(value);
  } catch {
    return `${value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  }
}
