import { Database } from 'better-sqlite3';

export function up(db: Database) {
  // 1. Roles table
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      label TEXT NOT NULL,
      description TEXT,
      is_system INTEGER NOT NULL DEFAULT 0,
      tenantId TEXT,
      createdAt TEXT NOT NULL,
      UNIQUE(name, tenantId)
    )
  `);

  // 2. Permissions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS permissions (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      module TEXT NOT NULL,
      label TEXT NOT NULL,
      description TEXT,
      createdAt TEXT NOT NULL
    )
  `);

  // 3. Role-Permissions junction
  db.exec(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      id TEXT PRIMARY KEY,
      roleId TEXT NOT NULL,
      permissionId TEXT NOT NULL,
      allowed INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE CASCADE,
      FOREIGN KEY (permissionId) REFERENCES permissions(id) ON DELETE CASCADE,
      UNIQUE(roleId, permissionId)
    )
  `);

  // 4. User-Roles junction (supports multiple roles per user)
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_roles (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      roleId TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE CASCADE,
      UNIQUE(userId, roleId)
    )
  `);

  // Indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(roleId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_role_permissions_permission ON role_permissions(permissionId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(userId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(roleId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_permissions_module ON permissions(module)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_roles_tenant ON roles(tenantId)`);

  // Seed: Permissions
  const permissionSeeds = [
    { id: 'perm-dashboard-view', key: 'dashboard.view', module: 'dashboard', label: 'Voir le tableau de bord', description: 'Accès à la page d\'accueil et aux indicateurs clés' },

    { id: 'perm-products-view', key: 'products.view', module: 'products', label: 'Voir les produits', description: 'Consulter le catalogue et les stocks' },
    { id: 'perm-products-create', key: 'products.create', module: 'products', label: 'Créer des produits', description: 'Ajouter de nouveaux articles au catalogue' },
    { id: 'perm-products-edit', key: 'products.edit', module: 'products', label: 'Modifier des produits', description: 'Éditer les fiches produits existantes' },
    { id: 'perm-products-delete', key: 'products.delete', module: 'products', label: 'Supprimer des produits', description: 'Retirer des articles du catalogue' },

    { id: 'perm-sales-view', key: 'sales.view', module: 'sales', label: 'Voir les ventes', description: 'Consulter l\'historique des ventes' },
    { id: 'perm-sales-create', key: 'sales.create', module: 'sales', label: 'Créer des ventes (POS)', description: 'Effectuer des encaissements au point de vente' },
    { id: 'perm-sales-edit', key: 'sales.edit', module: 'sales', label: 'Modifier des ventes', description: 'Éditer les transactions existantes' },
    { id: 'perm-sales-delete', key: 'sales.delete', module: 'sales', label: 'Annuler des ventes', description: 'Supprimer ou annuler des transactions' },
    { id: 'perm-sales-refund', key: 'sales.refund', module: 'sales', label: 'Rembourser des ventes', description: 'Effectuer des remboursements et retours' },

    { id: 'perm-customers-view', key: 'customers.view', module: 'customers', label: 'Voir les clients', description: 'Consulter le carnet d\'adresses clients' },
    { id: 'perm-customers-create', key: 'customers.create', module: 'customers', label: 'Créer des clients', description: 'Ajouter de nouveaux contacts' },
    { id: 'perm-customers-edit', key: 'customers.edit', module: 'customers', label: 'Modifier des clients', description: 'Éditer les fiches clients' },
    { id: 'perm-customers-delete', key: 'customers.delete', module: 'customers', label: 'Supprimer des clients', description: 'Retirer des fiches clients' },

    { id: 'perm-suppliers-view', key: 'suppliers.view', module: 'suppliers', label: 'Voir les fournisseurs', description: 'Consulter la liste des fournisseurs' },
    { id: 'perm-suppliers-create', key: 'suppliers.create', module: 'suppliers', label: 'Créer des fournisseurs', description: 'Ajouter de nouveaux fournisseurs' },
    { id: 'perm-suppliers-edit', key: 'suppliers.edit', module: 'suppliers', label: 'Modifier des fournisseurs', description: 'Éditer les fiches fournisseurs' },
    { id: 'perm-suppliers-delete', key: 'suppliers.delete', module: 'suppliers', label: 'Supprimer des fournisseurs', description: 'Retirer des fournisseurs' },

    { id: 'perm-expenses-view', key: 'expenses.view', module: 'expenses', label: 'Voir les dépenses', description: 'Consulter le registre des dépenses' },
    { id: 'perm-expenses-create', key: 'expenses.create', module: 'expenses', label: 'Créer des dépenses', description: 'Enregistrer des sorties d\'argent' },
    { id: 'perm-expenses-edit', key: 'expenses.edit', module: 'expenses', label: 'Modifier des dépenses', description: 'Éditer des écritures comptables' },
    { id: 'perm-expenses-delete', key: 'expenses.delete', module: 'expenses', label: 'Supprimer des dépenses', description: 'Annuler des écritures de dépenses' },

    { id: 'perm-loans-view', key: 'loans.view', module: 'loans', label: 'Voir les prêts', description: 'Consulter les dossiers de financement' },
    { id: 'perm-loans-create', key: 'loans.create', module: 'loans', label: 'Créer des prêts', description: 'Enregistrer des emprunts ou prêts' },
    { id: 'perm-loans-edit', key: 'loans.edit', module: 'loans', label: 'Modifier des prêts', description: 'Éditer les dossiers de prêt' },
    { id: 'perm-loans-delete', key: 'loans.delete', module: 'loans', label: 'Supprimer des prêts', description: 'Clôturer des dossiers de financement' },

    { id: 'perm-invoices-view', key: 'invoices.view', module: 'invoices', label: 'Voir les factures', description: 'Consulter les documents comptables' },
    { id: 'perm-invoices-create', key: 'invoices.create', module: 'invoices', label: 'Créer des factures', description: 'Émettre des factures et devis' },
    { id: 'perm-invoices-edit', key: 'invoices.edit', module: 'invoices', label: 'Modifier des factures', description: 'Éditer les documents existants' },
    { id: 'perm-invoices-delete', key: 'invoices.delete', module: 'invoices', label: 'Supprimer des factures', description: 'Annuler des documents' },
    { id: 'perm-invoices-credit-note', key: 'invoices.credit_note', module: 'invoices', label: 'Avoirs et notes de crédit', description: 'Émettre des avoirs et rectificatifs' },

    { id: 'perm-commissions-view', key: 'commissions.view', module: 'commissions', label: 'Voir les commissions', description: 'Consulter les rapports de commissions' },
    { id: 'perm-commissions-manage', key: 'commissions.manage', module: 'commissions', label: 'Gérer les commissions', description: 'Configurer et valider les commissions' },

    { id: 'perm-users-view', key: 'users.view', module: 'users', label: 'Voir les utilisateurs', description: 'Consulter la liste de l\'équipe' },
    { id: 'perm-users-create', key: 'users.create', module: 'users', label: 'Créer des utilisateurs', description: 'Ajouter des collaborateurs' },
    { id: 'perm-users-edit', key: 'users.edit', module: 'users', label: 'Modifier des utilisateurs', description: 'Éditer les profils et rôles' },
    { id: 'perm-users-delete', key: 'users.delete', module: 'users', label: 'Supprimer des utilisateurs', description: 'Révoquer des accès' },
    { id: 'perm-users-permissions', key: 'users.permissions', module: 'users', label: 'Gérer les permissions', description: 'Configurer les droits d\'accès par rôle' },

    { id: 'perm-settings-view', key: 'settings.view', module: 'settings', label: 'Voir les paramètres', description: 'Accéder à la page de configuration' },
    { id: 'perm-settings-edit', key: 'settings.edit', module: 'settings', label: 'Modifier les paramètres', description: 'Changer la configuration de la boutique' },

    { id: 'perm-warehouses-view', key: 'warehouses.view', module: 'warehouses', label: 'Voir les entrepôts', description: 'Consulter la liste des dépôts' },
    { id: 'perm-warehouses-create', key: 'warehouses.create', module: 'warehouses', label: 'Créer des entrepôts', description: 'Ajouter des lieux de stockage' },
    { id: 'perm-warehouses-edit', key: 'warehouses.edit', module: 'warehouses', label: 'Modifier des entrepôts', description: 'Éditer les fiches d\'entrepôt' },
    { id: 'perm-warehouses-delete', key: 'warehouses.delete', module: 'warehouses', label: 'Supprimer des entrepôts', description: 'Retirer des lieux de stockage' },

    { id: 'perm-reports-view', key: 'reports.view', module: 'reports', label: 'Voir les rapports', description: 'Accéder aux analyses et états financiers' },

    { id: 'perm-ai-view', key: 'ai.view', module: 'ai', label: 'Voir l\'IA', description: 'Accéder au module de réapprovisionnement IA' },
    { id: 'perm-ai-use', key: 'ai.use', module: 'ai', label: 'Utiliser l\'IA', description: 'Exécuter des prédictions et suggestions IA' },

    { id: 'perm-transfer-view', key: 'transfer.view', module: 'transfer', label: 'Voir les transferts', description: 'Consulter les mouvements de stock' },
    { id: 'perm-transfer-create', key: 'transfer.create', module: 'transfer', label: 'Créer des transferts', description: 'Déclencher des transferts entre entrepôts' },
  ];

  const now = new Date().toISOString();
  const insertPerm = db.prepare(`
    INSERT OR IGNORE INTO permissions (id, key, module, label, description, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const p of permissionSeeds) {
    insertPerm.run(p.id, p.key, p.module, p.label, p.description, now);
  }

  // Seed: System Roles and their default permissions
  const roleConfigs: Array<{ id: string; name: string; label: string; description: string; permissions: string[] }> = [
    {
      id: 'role-owner', name: 'owner', label: 'Owner / Propriétaire',
      description: 'Accès complet absolu : configuration, abonnements, POS, inventaire, finances, et gestion complète des utilisateurs.',
      permissions: permissionSeeds.map(p => p.key),
    },
    {
      id: 'role-admin', name: 'admin', label: 'Admin / Administrateur',
      description: 'Accès total à la boutique : gestion de stock, facturation, POS, comptabilité, et gestion des rôles.',
      permissions: permissionSeeds.map(p => p.key).filter(k =>
        !k.startsWith('settings.') &&
        !k.startsWith('users.delete') &&
        !k.startsWith('users.permissions')
      ),
    },
    {
      id: 'role-gerant', name: 'gerant', label: 'Gérant de Boutique',
      description: 'Accès opérationnel complet : point de vente, produits, stocks, et rapports de base.',
      permissions: [
        'dashboard.view',
        'products.view', 'products.create', 'products.edit',
        'sales.view', 'sales.create', 'sales.edit',
        'customers.view', 'customers.create', 'customers.edit',
        'expenses.view', 'expenses.create',
        'invoices.view', 'invoices.create',
        'reports.view',
      ],
    },
    {
      id: 'role-vendeur', name: 'vendeur', label: 'Vendeur de Caisse',
      description: 'Limité au point de vente (POS) : encaissement des paniers, gestion des clients simples.',
      permissions: [
        'dashboard.view',
        'sales.view', 'sales.create',
        'customers.view', 'customers.create',
      ],
    },
    {
      id: 'role-comptable', name: 'comptable', label: 'Comptable',
      description: 'Dédié aux finances : dépenses, prêts, bilans. Accès en lecture seule au catalogue.',
      permissions: [
        'dashboard.view',
        'products.view',
        'expenses.view', 'expenses.create', 'expenses.edit', 'expenses.delete',
        'loans.view', 'loans.create', 'loans.edit', 'loans.delete',
        'invoices.view',
        'reports.view',
      ],
    },
    {
      id: 'role-stock-manager', name: 'stock_manager', label: 'Gestionnaire de Stock',
      description: 'Dédié à la logistique : produits, transferts, alertes, réapprovisionnement IA.',
      permissions: [
        'dashboard.view',
        'products.view', 'products.create', 'products.edit', 'products.delete',
        'warehouses.view', 'warehouses.create', 'warehouses.edit',
        'transfer.view', 'transfer.create',
        'ai.view', 'ai.use',
      ],
    },
    {
      id: 'role-lecture-seule', name: 'lecture_seule', label: 'Lecture Seule / Auditeur',
      description: 'Accès en visualisation pure sur l\'ensemble de l\'activité.',
      permissions: permissionSeeds.filter(p =>
        p.key.endsWith('.view') || p.key === 'dashboard.view' || p.key === 'reports.view'
      ).map(p => p.key),
    },
  ];

  const insertRole = db.prepare(`
    INSERT OR IGNORE INTO roles (id, name, label, description, is_system, tenantId, createdAt)
    VALUES (?, ?, ?, ?, 1, NULL, ?)
  `);

  const insertRolePerm = db.prepare(`
    INSERT OR IGNORE INTO role_permissions (id, roleId, permissionId, allowed)
    VALUES (?, ?, ?, 1)
  `);

  const getAllPermKeys = db.prepare('SELECT id, key FROM permissions').all() as any[];
  const permKeyToId: Record<string, string> = {};
  for (const p of getAllPermKeys) {
    permKeyToId[p.key] = p.id;
  }

  for (const rc of roleConfigs) {
    insertRole.run(rc.id, rc.name, rc.label, rc.description, now);
    for (const pk of rc.permissions) {
      const permId = permKeyToId[pk];
      if (permId) {
        insertRolePerm.run(`rp-${rc.id}-${permId}`, rc.id, permId);
      }
    }
  }

  // Assign default role to existing users who have a role column set
  const existingUsers = db.prepare('SELECT id, role FROM users').all() as any[];
  const roleNameToId: Record<string, string> = {};
  for (const r of roleConfigs) {
    roleNameToId[r.name] = r.id;
  }
  roleNameToId['superadmin'] = 'role-owner';

  const assignUserRole = db.prepare(`
    INSERT OR IGNORE INTO user_roles (id, userId, roleId)
    VALUES (?, ?, ?)
  `);

  for (const u of existingUsers) {
    const roleId = roleNameToId[u.role] || 'role-vendeur';
    assignUserRole.run(`ur-${u.id}-${roleId}`, u.id, roleId);
  }
}

export function down(db: Database) {
  db.exec(`DROP TABLE IF EXISTS user_roles`);
  db.exec(`DROP TABLE IF EXISTS role_permissions`);
  db.exec(`DROP TABLE IF EXISTS permissions`);
  db.exec(`DROP TABLE IF EXISTS roles`);
}
