export type POSTab = 'vente' | 'historique' | 'rapports' | 'parametrage';

export function formatPDFNum(num: number): string {
  if (typeof num !== 'number') return '0';
  return num.toLocaleString()
    .replace(/\u202F/g, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/\s/g, ' ');
}

export function computeGlobalStatus(sale: any): string {
  const invStat = sale.invoiceStatus || 'Validée';
  if (invStat === 'Annulée') {
    return 'Facture annulée';
  }
  if (invStat === 'Brouillon') {
    return 'Brouillon';
  }
  if (invStat === 'Archivée') {
    return 'Facture archivée';
  }
  
  const credStat = sale.creditStatus || 'Pas de crédit';
  if (credStat !== 'Pas de crédit') {
    if (credStat === 'Crédit soldé') {
      return 'Vente terminée';
    }
    if (sale.creditDueDate) {
      const isOverdue = new Date(sale.creditDueDate) < new Date() && sale.paymentStatus !== 'Payé';
      if (isOverdue) return 'Crédit en retard';
    }
    return 'Crédit en cours';
  }

  const payStat = sale.paymentStatus || 'Payé';
  const delivStat = sale.deliveryStatus || 'Livrée';

  if (payStat === 'Payé' && delivStat === 'Livrée') {
    return 'Vente terminée';
  }
  if (payStat === 'Non payé' && delivStat === 'Non livrée') {
    return 'En attente de paiement';
  }
  if (payStat === 'Non payé' || payStat === 'Partiellement payé') {
    if (payStat === 'Partiellement payé') {
      return 'Paiement partiel';
    }
    return 'En attente de paiement';
  }
  if (delivStat === 'Non livrée' || delivStat === 'Partiellement livrée') {
    if (delivStat === 'Partiellement livrée') {
      return 'Livraison partielle';
    }
    return 'En attente de livraison';
  }
  
  if (payStat === 'Remboursé') {
    return 'Remboursée';
  }
  
  return 'Vente terminée';
}
