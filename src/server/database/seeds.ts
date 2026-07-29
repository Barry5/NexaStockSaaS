import { Database } from 'better-sqlite3';
import bcrypt from 'bcrypt';

export function seed(db: Database) {
  const superadminExists = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'superadmin'").get() as { count: number };

  if (superadminExists.count > 0) {
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
}
