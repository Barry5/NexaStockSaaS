import { Database } from 'better-sqlite3';
import bcrypt from 'bcrypt';

export function seed(db: Database) {
  const seedPlanModules = () => {
    const planModulesSeed: { planId: string; modules: string[] }[] = [
      { planId: 'plan-free', modules: ['dashboard', 'products', 'sales', 'customers', 'expenses', 'invoices'] },
      { planId: 'plan-standard', modules: ['dashboard', 'products', 'sales', 'customers', 'suppliers', 'expenses', 'invoices', 'warehouses', 'reports', 'users', 'settings', 'loans'] },
      { planId: 'plan-premium', modules: ['dashboard', 'products', 'sales', 'customers', 'suppliers', 'expenses', 'loans', 'invoices', 'commissions', 'users', 'settings', 'warehouses', 'reports', 'ai', 'transfer'] },
    ];

    const existingPlans = db.prepare('SELECT id FROM pricing_plans').all() as { id: string }[];
    const existingPlanIds = new Set(existingPlans.map(p => p.id));
    if (existingPlanIds.size === 0) return;

    const insertPlanModule = db.prepare(`
      INSERT OR IGNORE INTO plan_modules (id, planId, moduleKey, enabled)
      VALUES (?, ?, ?, 1)
    `);

    // Ids DÉTERMINISTES : pm-<planId>-<moduleKey>. Ce seed étant rejoué à
    // chaque démarrage (et après wipe/restauration de backup), l'ancien format
    // pm-<timestamp>-<seq> fabriquait un id différent à chaque lancement ->
    // nouvel UUID côté PG à chaque repousse du worker (pollution plan_modules :
    // 1058 lignes en doublon). L'id stable garantit que l'upsert PG
    // (onConflict: id) met à jour la ligne existante au lieu d'en créer une.
    for (const pm of planModulesSeed) {
      if (!existingPlanIds.has(pm.planId)) continue;
      for (const mk of pm.modules) {
        insertPlanModule.run(`pm-${pm.planId}-${mk}`, pm.planId, mk);
      }
    }

    // Auto-guérison : migre les anciennes lignes pm-<timestamp>-<seq> vers
    // l'id déterministe, en remappant sync_uuid_map pour conserver les UUID
    // PG déjà existants (pas de nouveau UUID -> pas de doublon côté PG).
    const legacyIdRegex = /^pm-\d{13}-\d+$/;
    const allRows = db.prepare('SELECT id, planId, moduleKey FROM plan_modules').all() as { id: string; planId: string; moduleKey: string }[];
    for (const row of allRows) {
      if (!legacyIdRegex.test(row.id)) continue;
      const newId = `pm-${row.planId}-${row.moduleKey}`;
      if (newId === row.id) continue;
      if (db.prepare('SELECT 1 FROM plan_modules WHERE id = ?').get(newId)) continue;
      try {
        db.prepare('UPDATE sync_uuid_map SET sqlite_id = ? WHERE sqlite_id = ?').run(newId, row.id);
      } catch { /* table absente (vieille base) : mapping ignoré */ }
      db.prepare('UPDATE plan_modules SET id = ? WHERE id = ?').run(newId, row.id);
    }

    // Purge des mappings pm-* orphelins (ids de seeds antérieurs sans ligne).
    const orphans = db.prepare("SELECT sqlite_id FROM sync_uuid_map WHERE sqlite_id LIKE 'pm-%'").all() as { sqlite_id: string }[];
    if (orphans.length > 0) {
      const existsStmt = db.prepare('SELECT 1 FROM plan_modules WHERE id = ?');
      const deleteStmt = db.prepare('DELETE FROM sync_uuid_map WHERE sqlite_id = ?');
      for (const o of orphans) {
        if (!existsStmt.get(o.sqlite_id)) deleteStmt.run(o.sqlite_id);
      }
    }
  };

  const superadminExists = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'superadmin'").get() as { count: number };

  if (superadminExists.count > 0) {
    seedPlanModules();
    console.log('Superadmin exists. Skipping seed.');
    return;
  }

  console.log('Seeding system data (production minimal)...');

  const transaction = db.transaction(() => {
    // 1. Global SaaS Settings
    db.prepare(`
      INSERT OR IGNORE INTO global_saas_settings (id, trialDays, gracePeriodDays, revertToPlanOnExpiry, orangeMoneyNumber, orangeMoneyName, mobileMoneyNumber, mobileMoneyName, bankDetails, paymentInstructions, automaticActivation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      1, 14, 5, 'Free',
      '+224 620 00 00 00', 'NexaStock SAS', '+224 660 11 22 33', 'Hassim Barry',
      'RIB: FR76 1234 5678 9012 3456 7890 123\nBanque: Société Générale Paris\nTitulaire: NexaStock SARL',
      'Veuillez effectuer le virement ou versement, puis déclarer la transaction ci-dessous.', 0
    );

    // 2. Pricing Plans
    const plans = [
      { id: 'plan-free', name: 'Free', description: 'Idéal pour tester l\'application.', price: 0, currency: 'EUR', durationDays: 14,
        features: JSON.stringify(["50 produits max", "1 utilisateur"]), limits: JSON.stringify({ maxProducts: 50, maxSales: 100, maxCustomers: 20, maxUsers: 1 }),
        color: 'gray', displayOrder: 1, active: 1 },
      { id: 'plan-standard', name: 'Standard', description: 'Pour les PME établies.', price: 29, currency: 'EUR', durationDays: 30,
        features: JSON.stringify(["Ventes illimitées", "5 utilisateurs"]), limits: JSON.stringify({ maxProducts: 9999, maxSales: 9999, maxCustomers: 9999, maxUsers: 5 }),
        color: 'blue', displayOrder: 2, active: 1 },
      { id: 'plan-premium', name: 'Premium', description: 'Le summum de l\'intelligence.', price: 79, currency: 'EUR', durationDays: 30,
        features: JSON.stringify(["Gemini AI réappro", "99 utilisateurs"]), limits: JSON.stringify({ maxProducts: 99999, maxSales: 99999, maxCustomers: 99999, maxUsers: 99 }),
        color: 'purple', displayOrder: 3, active: 1 },
    ];

    const insertPlan = db.prepare(`INSERT OR IGNORE INTO pricing_plans (id, name, description, price, currency, durationDays, features, limits, color, displayOrder, active) VALUES (@id, @name, @description, @price, @currency, @durationDays, @features, @limits, @color, @displayOrder, @active)`);
    plans.forEach(plan => insertPlan.run(plan));

    // 3. Superadmin user
    const saltRounds = 10;
    const passwordHash = bcrypt.hashSync('Nexa2026!', saltRounds);

    db.prepare(`INSERT OR IGNORE INTO users (id, name, email, role, tenantId, active, avatar, password, firstLoginReset) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'u-1', 'Barry Hassim', 'barry.hassim@gmail.com', 'superadmin', null, 1, null, passwordHash, 0
    );

    console.log('System seeding completed: superadmin, pricing plans, settings.');
  });

  transaction();

  seedPlanModules();
}
