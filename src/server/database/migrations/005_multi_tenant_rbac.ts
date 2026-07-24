import { Database } from 'better-sqlite3';

export function up(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS module_definitions (
      key TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      description TEXT,
      icon TEXT NOT NULL DEFAULT 'Package',
      is_core INTEGER NOT NULL DEFAULT 0,
      display_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS plan_modules (
      id TEXT PRIMARY KEY,
      planId TEXT NOT NULL,
      moduleKey TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (planId) REFERENCES pricing_plans(id) ON DELETE CASCADE,
      UNIQUE(planId, moduleKey)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS tenant_modules (
      id TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL,
      moduleKey TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
      UNIQUE(tenantId, moduleKey)
    )
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_plan_modules_plan ON plan_modules(planId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_plan_modules_module ON plan_modules(moduleKey)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tenant_modules_tenant ON tenant_modules(tenantId)`);

  // Seed module definitions
  const moduleDefs = [
    { key: 'dashboard', label: 'Tableau de bord', description: 'Vue d\'ensemble et indicateurs clés', icon: 'LayoutDashboard', is_core: 1, display_order: 1 },
    { key: 'products', label: 'Produits & Stocks', description: 'Gestion du catalogue et des inventaires', icon: 'Package', is_core: 0, display_order: 2 },
    { key: 'sales', label: 'Ventes & POS', description: 'Point de vente et encaissements', icon: 'ShoppingBag', is_core: 1, display_order: 3 },
    { key: 'customers', label: 'Clients & Grossistes', description: 'Carnet d\'adresses et relation client', icon: 'Users', is_core: 0, display_order: 4 },
    { key: 'suppliers', label: 'Fournisseurs', description: 'Gestion des fournisseurs et approvisionnements', icon: 'Truck', is_core: 0, display_order: 5 },
    { key: 'expenses', label: 'Dépenses & Prêts', description: 'Comptabilité et financements', icon: 'Coins', is_core: 0, display_order: 6 },
    { key: 'loans', label: 'Prêts', description: 'Gestion des emprunts et prêts', icon: 'ArrowRightLeft', is_core: 0, display_order: 7 },
    { key: 'invoices', label: 'Facturation ERP', description: 'Facturation et documents comptables', icon: 'FileText', is_core: 0, display_order: 8 },
    { key: 'commissions', label: 'Commissions', description: 'Commissions des affiliés', icon: 'Award', is_core: 0, display_order: 9 },
    { key: 'users', label: 'Gestion d\'Équipe', description: 'Utilisateurs et permissions', icon: 'Shield', is_core: 0, display_order: 10 },
    { key: 'settings', label: 'Paramètres', description: 'Configuration de la boutique', icon: 'Settings', is_core: 0, display_order: 11 },
    { key: 'warehouses', label: 'Entrepôts', description: 'Gestion des dépôts et stockages', icon: 'Building', is_core: 0, display_order: 12 },
    { key: 'reports', label: 'Rapports', description: 'Analyses et états financiers', icon: 'BarChart3', is_core: 0, display_order: 13 },
    { key: 'ai', label: 'Réapprovisionnement IA', description: 'Prédictions et suggestions intelligentes', icon: 'Sparkles', is_core: 0, display_order: 14 },
    { key: 'transfer', label: 'Transferts', description: 'Mouvements de stock entre entrepôts', icon: 'ArrowUpDown', is_core: 0, display_order: 15 },
  ];

  const insertModuleDef = db.prepare(`
    INSERT OR IGNORE INTO module_definitions (key, label, description, icon, is_core, display_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const m of moduleDefs) {
    insertModuleDef.run(m.key, m.label, m.description, m.icon, m.is_core, m.display_order);
  }

  // Seed plan-module associations
  const planModulesSeed: { planId: string; modules: string[] }[] = [
    {
      planId: 'plan-free',
      modules: ['dashboard', 'products', 'sales', 'customers', 'expenses', 'invoices'],
    },
    {
      planId: 'plan-standard',
      modules: ['dashboard', 'products', 'sales', 'customers', 'suppliers', 'expenses', 'invoices', 'warehouses', 'reports', 'users', 'settings', 'loans'],
    },
    {
      planId: 'plan-premium',
      modules: ['dashboard', 'products', 'sales', 'customers', 'suppliers', 'expenses', 'loans', 'invoices', 'commissions', 'users', 'settings', 'warehouses', 'reports', 'ai', 'transfer'],
    },
  ];

  const existingPlans = db.prepare('SELECT id FROM pricing_plans').all() as any[];
  const existingPlanIds = new Set(existingPlans.map(p => p.id));

  const insertPlanModule = db.prepare(`
    INSERT OR IGNORE INTO plan_modules (id, planId, moduleKey, enabled)
    VALUES (?, ?, ?, 1)
  `);

  const now = Date.now();
  let seq = 0;
  for (const pm of planModulesSeed) {
    if (!existingPlanIds.has(pm.planId)) continue;
    for (const mk of pm.modules) {
      insertPlanModule.run(`pm-${now}-${seq}`, pm.planId, mk);
      seq++;
    }
  }
}

export function down(db: Database) {
  db.exec(`DROP TABLE IF EXISTS tenant_modules`);
  db.exec(`DROP TABLE IF EXISTS plan_modules`);
  db.exec(`DROP TABLE IF EXISTS module_definitions`);
}
