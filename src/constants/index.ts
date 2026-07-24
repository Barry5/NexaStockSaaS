import type { TabType, UserRole } from '../types';
import type { LucideIcon } from 'lucide-react';

export const LOCAL_CACHE_KEY = 'nexastock_local_cache';
export const AUTH_TOKEN_KEY = 'nexastock_token';

export const LOADING_STEPS = [
  "Extraction de la situation des stocks en temps réel...",
  "Analyse des fréquences et de la vélocité des ventes récentes...",
  "Modélisation prédictive des points de rupture imminents...",
  "Calcul des coûts d'approvisionnement optimaux...",
  "Génération du rapport stratégique par Gemini 3.5..."
];

export const CHART_COLORS = ['#2563EB', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899'];

export const EXPENSE_CATEGORIES = [
  'Loyer', 'Électricité', 'Salaires', 'Achat Stock', 'Marketing', 'Fournitures', 'Impôts'
];

export const PAYMENT_METHODS = [
  'Virement', 'Carte Bancaire', 'Espèces', 'Chèque'
];

export const LOAN_TYPES = [
  { value: 'entrant', label: 'Emprunt contracté (Nous devons)' },
  { value: 'sortant', label: 'Fonds prêtés (On nous doit)' }
] as const;

export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Actif',
  TRIAL: 'Essai',
  PENDING: 'En attente',
  EXPIRED: 'Expiré',
  SUSPENDED: 'Suspendu',
  CANCELED: 'Annulé',
  BLOCKED: 'Bloqué',
  RENEWAL_PENDING: 'Renouvellement'
};

export const DEFAULT_PRICING_PLANS = [
  { id: 'plan-free', name: 'Free', description: 'Idéal pour tester l\'application.', price: 0, currency: 'EUR', durationDays: 14, features: ["50 produits max", "1 utilisateur"], limits: { maxProducts: 50, maxSales: 100, maxCustomers: 20, maxUsers: 1 }, color: 'gray', displayOrder: 1, active: true },
  { id: 'plan-standard', name: 'Standard', description: 'Pour les PME établies.', price: 29, currency: 'EUR', durationDays: 30, features: ["Ventes illimitées", "5 utilisateurs"], limits: { maxProducts: 9999, maxSales: 9999, maxCustomers: 9999, maxUsers: 5 }, color: 'blue', displayOrder: 2, active: true },
  { id: 'plan-premium', name: 'Premium', description: 'Le summum de l\'intelligence.', price: 79, currency: 'EUR', durationDays: 30, features: ["Gemini AI réappro", "99 utilisateurs"], limits: { maxProducts: 99999, maxSales: 99999, maxCustomers: 99999, maxUsers: 99 }, color: 'purple', displayOrder: 3, active: true }
];

export const DEFAULT_SAAS_SETTINGS = {
  trialDays: 14,
  gracePeriodDays: 5,
  revertToPlanOnExpiry: 'Free' as const,
  orangeMoneyNumber: '+224 620 00 00 00',
  orangeMoneyName: 'NexaStock SAS',
  mobileMoneyNumber: '+224 660 11 22 33',
  mobileMoneyName: 'Hassim Barry',
  bankDetails: 'RIB: FR76 1234 5678 9012 3456 7890 123\nBanque: Société Générale Paris\nTitulaire: NexaStock SARL',
  paymentInstructions: 'Veuillez effectuer le virement ou versement, puis déclarer la transaction ci-dessous.',
  automaticActivation: false
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  validated: 'Validée',
  cancelled: 'Annulée',
  archived: 'Archivée'
};

export const DELIVERY_STATUS_LABELS: Record<string, string> = {
  not_delivered: 'Non livrée',
  partially_delivered: 'Partiellement livrée',
  fully_delivered: 'Livrée totalement',
  cancelled: 'Annulée'
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: 'Non payé',
  partially_paid: 'Partiellement payé',
  paid: 'Payé',
  overdue: 'En retard',
  cancelled: 'Annulé'
};

export const DELIVERY_ORDER_STATUS_LABELS: Record<string, string> = {
  draft: 'En préparation',
  validated: 'Validé',
  in_transit: 'En cours de livraison',
  delivered: 'Livré',
  cancelled: 'Annulé'
};

export const PAYMENT_METHODS_LABELS: Record<string, string> = {
  cash: 'Espèces',
  card: 'Carte bancaire',
  mobile_money: 'Mobile Money',
  bank_transfer: 'Virement bancaire',
  check: 'Chèque'
};

export const INVOICE_TYPE_LABELS: Record<string, string> = {
  sale: 'Facture de vente',
  purchase: "Facture d'achat",
  credit_note: 'Avoir',
  debit_note: 'Note de débit'
};

export const AFFILIATE_STATUS_LABELS: Record<string, string> = {
  active: 'Actif',
  suspended: 'Suspendu',
  blocked: 'Bloqué'
};

export const COMMISSION_RULE_TYPES: Record<string, string> = {
  fixed_product: 'Fixe par produit',
  fixed_category: 'Fixe par catégorie',
  percentage: 'Pourcentage',
  margin: 'Selon la marge',
  per_affiliate: 'Par apporteur',
  per_client: 'Par client',
  per_quantity: 'Par quantité vendue',
  per_revenue: 'Par chiffre d\'affaires',
  campaign: 'Campagne promotionnelle'
};

export const COMMISSION_STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  available: 'Disponible',
  to_pay: 'À payer',
  partially_paid: 'Partiellement payée',
  paid: 'Payée',
  suspended: 'Suspendue',
  blocked: 'Bloquée',
  cancelled: 'Annulée',
  recalculated: 'Recalculée'
};

export const LEDGER_TYPE_LABELS: Record<string, string> = {
  commission: 'Commission',
  bonus: 'Bonus',
  bonus_exceptional: 'Prime exceptionnelle',
  adjustment_positive: 'Ajustement positif',
  payment: 'Paiement',
  correction: 'Correction',
  cancellation: 'Annulation',
  return: 'Retour marchandise',
  regularization: 'Régularisation'
};

export const COMMISSION_PAYMENT_METHODS = [
  { value: 'cash', label: 'Espèces' },
  { value: 'orange_money', label: 'Orange Money' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'wave', label: 'Wave' },
  { value: 'bank_transfer', label: 'Virement bancaire' },
  { value: 'check', label: 'Chèque' },
  { value: 'card', label: 'Carte bancaire' }
];

export const ROLE_SPECS: Record<string, { label: string; desc: string }> = {
  owner: {
    label: 'Owner / Propriétaire',
    desc: 'Accès complet absolu : configuration, abonnements, POS, inventaire, finances, et gestion complète des utilisateurs.',
  },
  admin: {
    label: 'Admin / Administrateur',
    desc: 'Accès total à la boutique : gestion de stock, facturation, POS, comptabilité, et gestion des rôles de l\'équipe.',
  },
  gerant: {
    label: 'Gérant de Boutique',
    desc: 'Accès opérationnel complet : point de vente (POS), gestion des produits et stocks, et rapports de base.',
  },
  vendeur: {
    label: 'Vendeur de Caisse',
    desc: 'Limité au point de vente (POS) : encaissement des paniers, gestion des clients simples.',
  },
  comptable: {
    label: 'Comptable',
    desc: 'Dédié aux finances : gestion du registre des dépenses, prêts, bilans. Accès en lecture seule au catalogue.',
  },
  stock_manager: {
    label: 'Gestionnaire de Stock',
    desc: 'Dédié à la logistique : gestion des produits, transferts d\'entrepôts, alertes de rupture, réapprovisionnement intelligent.',
  },
  lecture_seule: {
    label: 'Lecture Seule / Auditeur',
    desc: 'Accès en visualisation pure sur l\'ensemble de l\'activité.',
  }
};
