export const PERMISSION_MODULES = [
  { key: 'dashboard', label: 'Tableau de bord', icon: 'LayoutDashboard' },
  { key: 'products', label: 'Produits & Stocks', icon: 'Package' },
  { key: 'sales', label: 'Ventes & POS', icon: 'ShoppingBag' },
  { key: 'customers', label: 'Clients', icon: 'Users' },
  { key: 'suppliers', label: 'Fournisseurs', icon: 'Truck' },
  { key: 'expenses', label: 'Dépenses', icon: 'Coins' },
  { key: 'loans', label: 'Prêts', icon: 'ArrowRightLeft' },
  { key: 'invoices', label: 'Facturation', icon: 'FileText' },
  { key: 'commissions', label: 'Commissions', icon: 'Award' },
  { key: 'users', label: 'Utilisateurs', icon: 'Shield' },
  { key: 'settings', label: 'Paramètres', icon: 'Settings' },
  { key: 'warehouses', label: 'Entrepôts', icon: 'Building' },
  { key: 'reports', label: 'Rapports', icon: 'BarChart3' },
  { key: 'ai', label: 'IA', icon: 'Sparkles' },
  { key: 'transfer', label: 'Transferts', icon: 'ArrowUpDown' },
] as const;

export interface PermissionDescriptor {
  key: string;
  label: string;
  description: string;
}

export const PERMISSION_DESCRIPTORS: Record<string, PermissionDescriptor> = {
  'dashboard.view': { key: 'dashboard.view', label: 'Voir', description: 'Accès au tableau de bord' },

  'products.view': { key: 'products.view', label: 'Voir', description: 'Consulter le catalogue' },
  'products.create': { key: 'products.create', label: 'Créer', description: 'Ajouter des produits' },
  'products.edit': { key: 'products.edit', label: 'Modifier', description: 'Éditer les produits' },
  'products.delete': { key: 'products.delete', label: 'Supprimer', description: 'Retirer des produits' },

  'sales.view': { key: 'sales.view', label: 'Voir', description: 'Consulter les ventes' },
  'sales.create': { key: 'sales.create', label: 'Créer (POS)', description: 'Effectuer des ventes' },
  'sales.edit': { key: 'sales.edit', label: 'Modifier', description: 'Éditer les transactions' },
  'sales.delete': { key: 'sales.delete', label: 'Annuler', description: 'Supprimer des ventes' },
  'sales.refund': { key: 'sales.refund', label: 'Rembourser', description: 'Effectuer des retours' },

  'customers.view': { key: 'customers.view', label: 'Voir', description: 'Consulter les clients' },
  'customers.create': { key: 'customers.create', label: 'Créer', description: 'Ajouter des clients' },
  'customers.edit': { key: 'customers.edit', label: 'Modifier', description: 'Éditer les fiches' },
  'customers.delete': { key: 'customers.delete', label: 'Supprimer', description: 'Retirer des clients' },

  'suppliers.view': { key: 'suppliers.view', label: 'Voir', description: 'Consulter les fournisseurs' },
  'suppliers.create': { key: 'suppliers.create', label: 'Créer', description: 'Ajouter des fournisseurs' },
  'suppliers.edit': { key: 'suppliers.edit', label: 'Modifier', description: 'Éditer les fiches' },
  'suppliers.delete': { key: 'suppliers.delete', label: 'Supprimer', description: 'Retirer des fournisseurs' },

  'expenses.view': { key: 'expenses.view', label: 'Voir', description: 'Consulter les dépenses' },
  'expenses.create': { key: 'expenses.create', label: 'Créer', description: 'Enregistrer des sorties' },
  'expenses.edit': { key: 'expenses.edit', label: 'Modifier', description: 'Éditer les écritures' },
  'expenses.delete': { key: 'expenses.delete', label: 'Supprimer', description: 'Annuler des écritures' },

  'loans.view': { key: 'loans.view', label: 'Voir', description: 'Consulter les prêts' },
  'loans.create': { key: 'loans.create', label: 'Créer', description: 'Enregistrer des prêts' },
  'loans.edit': { key: 'loans.edit', label: 'Modifier', description: 'Éditer les dossiers' },
  'loans.delete': { key: 'loans.delete', label: 'Supprimer', description: 'Clôturer des dossiers' },

  'invoices.view': { key: 'invoices.view', label: 'Voir', description: 'Consulter les factures' },
  'invoices.create': { key: 'invoices.create', label: 'Créer', description: 'Émettre des factures' },
  'invoices.edit': { key: 'invoices.edit', label: 'Modifier', description: 'Éditer les documents' },
  'invoices.delete': { key: 'invoices.delete', label: 'Supprimer', description: 'Annuler des documents' },
  'invoices.credit_note': { key: 'invoices.credit_note', label: 'Avoirs', description: 'Notes de crédit' },

  'commissions.view': { key: 'commissions.view', label: 'Voir', description: 'Consulter les commissions' },
  'commissions.manage': { key: 'commissions.manage', label: 'Gérer', description: 'Configurer les commissions' },

  'users.view': { key: 'users.view', label: 'Voir', description: 'Consulter l\'équipe' },
  'users.create': { key: 'users.create', label: 'Créer', description: 'Ajouter des collaborateurs' },
  'users.edit': { key: 'users.edit', label: 'Modifier', description: 'Éditer les profils' },
  'users.delete': { key: 'users.delete', label: 'Supprimer', description: 'Révoquer des accès' },
  'users.permissions': { key: 'users.permissions', label: 'Permissions', description: 'Gérer les droits RBAC' },

  'settings.view': { key: 'settings.view', label: 'Voir', description: 'Accéder aux paramètres' },
  'settings.edit': { key: 'settings.edit', label: 'Modifier', description: 'Configurer la boutique' },

  'warehouses.view': { key: 'warehouses.view', label: 'Voir', description: 'Consulter les entrepôts' },
  'warehouses.create': { key: 'warehouses.create', label: 'Créer', description: 'Ajouter un entrepôt' },
  'warehouses.edit': { key: 'warehouses.edit', label: 'Modifier', description: 'Éditer les entrepôts' },
  'warehouses.delete': { key: 'warehouses.delete', label: 'Supprimer', description: 'Retirer un entrepôt' },

  'reports.view': { key: 'reports.view', label: 'Voir', description: 'Accéder aux rapports' },

  'ai.view': { key: 'ai.view', label: 'Voir', description: 'Accéder au module IA' },
  'ai.use': { key: 'ai.use', label: 'Utiliser', description: 'Exécuter des prédictions IA' },

  'transfer.view': { key: 'transfer.view', label: 'Voir', description: 'Consulter les transferts' },
  'transfer.create': { key: 'transfer.create', label: 'Créer', description: 'Effectuer des transferts' },
};

export function getModulePermissions(moduleKey: string): PermissionDescriptor[] {
  return Object.values(PERMISSION_DESCRIPTORS).filter(p => p.key.startsWith(`${moduleKey}.`));
}

// Actions par ordre d'affichage dans les toggles
export const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete', 'refund', 'credit_note', 'manage', 'use', 'permissions'] as const;
