import { computeGlobalStatus } from '../components/pos/posUtils';

export interface SaleDisplayState {
  invoiceStatus: string;
  paymentStatus: string;
  deliveryStatus: string;
  creditStatus: string;
  globalStatus: string;
}

export function filterSalesHistory(sales: any[], historySearch: string, historyFilterStatus: string) {
  const normalizedSearch = historySearch.toLowerCase().trim();
  return sales.filter(sale => {
    const matchText = !normalizedSearch || [sale.invoiceNumber, sale.customerName || '']
      .some(value => value.toLowerCase().includes(normalizedSearch));
    const statusValue = sale.status || 'Payée';
    const matchStatus = historyFilterStatus === 'Tous' || statusValue === historyFilterStatus;
    return matchText && matchStatus;
  });
}

export function getSaleDisplayState(sale: any): SaleDisplayState {
  const statusValue = sale.status || 'Payée';
  const invoiceStatus = sale.invoiceStatus || (statusValue === 'Brouillon' ? 'Brouillon' : 'Validée');
  const paymentStatus = sale.paymentStatus || (sale.isReturned ? 'Remboursé' : (statusValue === 'Payée' ? 'Payé' : (statusValue === 'Partiellement payée' ? 'Partiellement payé' : 'Non payé')));
  const deliveryStatus = sale.deliveryStatus || ((sale as any).deliveryStatus === 'non_livré' ? 'Non livrée' : 'Livrée');
  const creditStatus = sale.creditStatus || (sale.paymentMethod === 'credit' ? (((sale as any).creditPaidAmount || 0) >= sale.total ? 'Crédit soldé' : 'Crédit actif') : 'Pas de crédit');
  const globalStatus = computeGlobalStatus({
    ...sale,
    invoiceStatus,
    paymentStatus,
    deliveryStatus,
    creditStatus,
  });

  return {
    invoiceStatus,
    paymentStatus,
    deliveryStatus,
    creditStatus,
    globalStatus,
  };
}
