import { Database } from 'better-sqlite3';
import bcrypt from 'bcrypt';

export function seed(db: Database) {
  // Check if seeding is already done (by checking if tenants table has records)
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM tenants');
  const countResult = countStmt.get() as { count: number };

  if (countResult.count > 0) {
    console.log('Database already has data. Skipping seed.');
    return;
  }

  console.log('Seeding initial SQLite database...');

  // Wrap all insertions in a transaction
  const transaction = db.transaction(() => {
    // 1. Seed Global SaaS Settings
    db.prepare(`
      INSERT INTO global_saas_settings (id, trialDays, gracePeriodDays, revertToPlanOnExpiry, orangeMoneyNumber, orangeMoneyName, mobileMoneyNumber, mobileMoneyName, bankDetails, paymentInstructions, automaticActivation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      1,
      14,
      5,
      'Free',
      '+224 620 00 00 00',
      'NexaStock SAS',
      '+224 660 11 22 33',
      'Hassim Barry',
      'RIB: FR76 1234 5678 9012 3456 7890 123\nBanque: Société Générale Paris\nTitulaire: NexaStock SARL',
      'Veuillez effectuer le virement ou versement, puis déclarer la transaction ci-dessous.',
      0
    );

    // 2. Seed Pricing Plans
    const plans = [
      {
        id: 'plan-free',
        name: 'Free',
        description: 'Idéal pour tester l\'application.',
        price: 0,
        currency: 'EUR',
        durationDays: 14,
        features: JSON.stringify(["50 produits max", "1 utilisateur"]),
        limits: JSON.stringify({ maxProducts: 50, maxSales: 100, maxCustomers: 20, maxUsers: 1 }),
        color: 'gray',
        displayOrder: 1,
        active: 1
      },
      {
        id: 'plan-standard',
        name: 'Standard',
        description: 'Pour les PME établies.',
        price: 29,
        currency: 'EUR',
        durationDays: 30,
        features: JSON.stringify(["Ventes illimitées", "5 utilisateurs"]),
        limits: JSON.stringify({ maxProducts: 9999, maxSales: 9999, maxCustomers: 9999, maxUsers: 5 }),
        color: 'blue',
        displayOrder: 2,
        active: 1
      },
      {
        id: 'plan-premium',
        name: 'Premium',
        description: 'Le summum de l\'intelligence.',
        price: 79,
        currency: 'EUR',
        durationDays: 30,
        features: JSON.stringify(["Gemini AI réappro", "99 utilisateurs"]),
        limits: JSON.stringify({ maxProducts: 99999, maxSales: 99999, maxCustomers: 99999, maxUsers: 99 }),
        color: 'purple',
        displayOrder: 3,
        active: 1
      }
    ];

    const insertPlan = db.prepare(`
      INSERT INTO pricing_plans (id, name, description, price, currency, durationDays, features, limits, color, displayOrder, active)
      VALUES (@id, @name, @description, @price, @currency, @durationDays, @features, @limits, @color, @displayOrder, @active)
    `);

    plans.forEach(plan => insertPlan.run(plan));

    // 3. Seed Tenants
    const tenants = [
      {
        id: 't-aura-tech',
        name: 'Aura Tech Electronics',
        description: 'Boutique premium d\'électronique et gadgets',
        plan: 'Premium',
        logo: 'https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=80&h=80&fit=crop&q=80',
        address: 'Av. des Champs-Élysées, Paris',
        phone: '+33 1 42 68 53 00',
        currency: 'EUR',
        taxRate: 20.0,
        customCategories: JSON.stringify(['Smartphones', 'Ordinateurs', 'Accessoires', 'Audio']),
        createdAt: new Date('2026-01-10').toISOString(),
        subscriptionPlanId: 'plan-premium',
        subscriptionStatus: 'ACTIVE',
        subscriptionStartDate: new Date('2026-01-10').toISOString(),
        subscriptionEndDate: new Date('2027-01-10').toISOString(),
      },
      {
        id: 't-pharma-saintjean',
        name: 'Pharmacie Saint-Jean',
        description: 'Officine de santé, cosmétiques et soins',
        plan: 'Standard',
        logo: 'https://images.unsplash.com/photo-1586015555751-63bb77f4322a?w=80&h=80&fit=crop&q=80',
        address: 'Rue de la République, Lyon',
        phone: '+33 4 72 10 30 00',
        currency: 'EUR',
        taxRate: 10.0,
        customCategories: JSON.stringify(['Médicaments', 'Cosmétiques', 'Hygiène']),
        createdAt: new Date('2026-02-15').toISOString(),
        subscriptionPlanId: 'plan-standard',
        subscriptionStatus: 'PENDING',
        subscriptionStartDate: new Date('2026-02-15').toISOString(),
        subscriptionEndDate: new Date('2026-08-15').toISOString(),
      },
      {
        id: 't-market-baraka',
        name: 'Supermarché Al-Baraka',
        description: 'Alimentation générale, fruits & légumes',
        plan: 'Free',
        logo: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=80&h=80&fit=crop&q=80',
        address: 'Bd de Belleville, Paris',
        phone: '+33 1 43 55 22 11',
        currency: 'EUR',
        taxRate: 20.0,
        customCategories: JSON.stringify(['Alimentation', 'Fruits & Légumes', 'Boissons']),
        createdAt: new Date('2026-03-01').toISOString(),
        subscriptionPlanId: 'plan-free',
        subscriptionStatus: 'TRIAL',
        subscriptionStartDate: new Date('2026-03-01').toISOString(),
        subscriptionEndDate: new Date('2026-03-15').toISOString(),
      }
    ];

    const insertTenant = db.prepare(`
      INSERT INTO tenants (id, name, description, plan, logo, address, phone, currency, taxRate, customCategories, createdAt, subscriptionPlanId, subscriptionStatus, subscriptionStartDate, subscriptionEndDate)
      VALUES (@id, @name, @description, @plan, @logo, @address, @phone, @currency, @taxRate, @customCategories, @createdAt, @subscriptionPlanId, @subscriptionStatus, @subscriptionStartDate, @subscriptionEndDate)
    `);

    tenants.forEach(tenant => insertTenant.run(tenant));

    // 4. Seed Users (with hashed password)
    const saltRounds = 10;
    const defaultPasswordHash = bcrypt.hashSync('Nexa2026!', saltRounds);

    const users = [
      {
        id: 'u-1',
        name: 'Barry Hassim',
        email: 'barry.hassim@gmail.com',
        role: 'superadmin',
        tenantId: null,
        active: 1,
        avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&h=80&fit=crop&q=80',
        password: defaultPasswordHash,
        firstLoginReset: 0
      },
      {
        id: 'u-2',
        name: 'Sophie Laurent',
        email: 'sophie.l@pharma.com',
        role: 'gerant',
        tenantId: 't-pharma-saintjean',
        active: 1,
        avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&q=80',
        password: defaultPasswordHash,
        firstLoginReset: 0
      },
      {
        id: 'u-3',
        name: 'Amine Diallo',
        email: 'amine@baraka.com',
        role: 'vendeur',
        tenantId: 't-market-baraka',
        active: 1,
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&q=80',
        password: defaultPasswordHash,
        firstLoginReset: 0
      }
    ];

    const insertUser = db.prepare(`
      INSERT INTO users (id, name, email, role, tenantId, active, avatar, password, firstLoginReset)
      VALUES (@id, @email, @email, @role, @tenantId, @active, @avatar, @password, @firstLoginReset)
    `);

    // Wait! Let's correct the columns: id, name, email, role, tenantId, active, avatar, password, firstLoginReset
    const insertUserCorrect = db.prepare(`
      INSERT INTO users (id, name, email, role, tenantId, active, avatar, password, firstLoginReset)
      VALUES (@id, @name, @email, @role, @tenantId, @active, @avatar, @password, @firstLoginReset)
    `);

    users.forEach(usr => insertUserCorrect.run(usr));

    // 5. Seed Products
    const products = [
      {
        id: 'p-1',
        name: 'iPhone 15 Pro Max 256GB',
        sku: 'IP15PM-256',
        barcode: '190199000123',
        description: 'Smartphone Apple Titane naturel',
        category: 'Smartphones',
        buyPrice: 950,
        sellPrice: 1479,
        quantity: 12,
        alertThreshold: 5,
        image: 'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?w=200&h=200&fit=crop&q=80',
        tenantId: 't-aura-tech',
        createdAt: new Date('2026-05-10').toISOString(),
      },
      {
        id: 'p-2',
        name: 'MacBook Air 13" M3 16/512',
        sku: 'MBA-M3-16512',
        barcode: '190199000456',
        description: 'Ordinateur portable ultra-fin Apple',
        category: 'Ordinateurs',
        buyPrice: 1100,
        sellPrice: 1599,
        quantity: 3,
        alertThreshold: 4,
        image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=200&h=200&fit=crop&q=80',
        tenantId: 't-aura-tech',
        createdAt: new Date('2026-05-12').toISOString(),
      },
      {
        id: 'p-3',
        name: 'AirPods Pro Gen 2 USB-C',
        sku: 'APP2-USBC',
        barcode: '190199000789',
        description: 'Écouteurs sans fil à réduction de bruit active',
        category: 'Accessoires',
        buyPrice: 170,
        sellPrice: 279,
        quantity: 25,
        alertThreshold: 8,
        image: 'https://images.unsplash.com/photo-1588449668338-d1516824347d?w=200&h=200&fit=crop&q=80',
        tenantId: 't-aura-tech',
        createdAt: new Date('2026-05-15').toISOString(),
      },
      {
        id: 'p-4',
        name: 'Sony WH-1000XM5',
        sku: 'SONY-XM5-B',
        barcode: '454873613254',
        description: 'Casque circum-aural sans fil à réduction de bruit',
        category: 'Audio',
        buyPrice: 220,
        sellPrice: 349,
        quantity: 1,
        alertThreshold: 3,
        image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=200&h=200&fit=crop&q=80',
        tenantId: 't-aura-tech',
        createdAt: new Date('2026-05-18').toISOString(),
      },
      {
        id: 'p-5',
        name: 'Doliprane 1000mg x8',
        sku: 'DOLI-1000',
        barcode: '340093557999',
        description: 'Antalgique paracétamol pour adultes',
        category: 'Médicaments',
        buyPrice: 0.90,
        sellPrice: 2.10,
        quantity: 150,
        alertThreshold: 30,
        image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=200&h=200&fit=crop&q=80',
        tenantId: 't-pharma-saintjean',
        createdAt: new Date('2026-05-01').toISOString(),
      },
      {
        id: 'p-6',
        name: 'Sérum Hydratant CeraVe 50ml',
        sku: 'CERAVE-HYDR-50',
        barcode: '333787559739',
        description: 'Soin hydratant à base d\'acide hyaluronique',
        category: 'Cosmétiques',
        buyPrice: 8.50,
        sellPrice: 14.90,
        quantity: 8,
        alertThreshold: 15,
        image: 'https://images.unsplash.com/photo-1608248597481-496100c8c836?w=200&h=200&fit=crop&q=80',
        tenantId: 't-pharma-saintjean',
        createdAt: new Date('2026-05-05').toISOString(),
      }
    ];

    const insertProduct = db.prepare(`
      INSERT INTO products (id, name, sku, barcode, description, category, buyPrice, sellPrice, quantity, alertThreshold, image, tenantId, createdAt)
      VALUES (@id, @name, @sku, @barcode, @description, @category, @buyPrice, @sellPrice, @quantity, @alertThreshold, @image, @tenantId, @createdAt)
    `);

    products.forEach(prod => insertProduct.run(prod));

    // 6. Seed Customers
    const customers = [
      {
        id: 'c-1',
        name: 'Jean Dupont',
        email: 'jean.dupont@gmail.com',
        phone: '+33 6 12 34 56 78',
        loyaltyPoints: 120,
        outstandingDebt: 0.0,
        tenantId: 't-aura-tech',
        createdAt: new Date('2026-04-10').toISOString(),
      },
      {
        id: 'c-2',
        name: 'Marie Curie',
        email: 'marie.curie@science.fr',
        phone: '+33 6 87 65 43 21',
        loyaltyPoints: 340,
        outstandingDebt: 450.0,
        tenantId: 't-aura-tech',
        createdAt: new Date('2026-04-12').toISOString(),
      },
      {
        id: 'c-3',
        name: 'Alice Bernard',
        email: 'alice.b@outlook.fr',
        phone: '+33 7 44 55 66 77',
        loyaltyPoints: 45,
        outstandingDebt: 0.0,
        tenantId: 't-pharma-saintjean',
        createdAt: new Date('2026-04-20').toISOString(),
      }
    ];

    const insertCustomer = db.prepare(`
      INSERT INTO customers (id, name, email, phone, loyaltyPoints, outstandingDebt, tenantId, createdAt)
      VALUES (@id, @name, @email, @phone, @loyaltyPoints, @outstandingDebt, @tenantId, @createdAt)
    `);

    customers.forEach(cust => insertCustomer.run(cust));

    // 7. Seed Suppliers
    const suppliers = [
      {
        id: 's-1',
        name: 'TechData Distribution',
        contactName: 'Marc Lefebvre',
        phone: '+33 1 50 20 30 40',
        email: 'orders@techdata.fr',
        tenantId: 't-aura-tech',
        createdAt: new Date('2026-01-15').toISOString(),
      },
      {
        id: 's-2',
        name: 'Alliance Pharma',
        contactName: 'Isabelle Moreau',
        phone: '+33 4 90 80 70 60',
        email: 'contact@alliance-pharma.fr',
        tenantId: 't-pharma-saintjean',
        createdAt: new Date('2026-02-20').toISOString(),
      }
    ];

    const insertSupplier = db.prepare(`
      INSERT INTO suppliers (id, name, contactName, phone, email, tenantId, createdAt)
      VALUES (@id, @name, @contactName, @phone, @email, @tenantId, @createdAt)
    `);

    suppliers.forEach(supp => insertSupplier.run(supp));

    // 8. Seed Expenses
    const expenses = [
      {
        id: 'e-1',
        title: 'Loyer Commercial Juin 2026',
        amount: 1200,
        category: 'Loyer',
        date: '2026-06-01',
        description: 'Loyer mensuel de la boutique principale',
        recipient: 'SCI Champs-Élysées',
        paymentMethod: 'Virement',
        status: 'paye',
        attachment: null,
        tenantId: 't-aura-tech',
      },
      {
        id: 'e-2',
        title: 'Facture Électricité EDF',
        amount: 185.40,
        category: 'Électricité',
        date: '2026-06-15',
        description: 'Consommation mai-juin 2026',
        recipient: 'EDF S.A.',
        paymentMethod: 'Prélèvement',
        status: 'paye',
        attachment: null,
        tenantId: 't-aura-tech',
      },
      {
        id: 'e-3',
        title: 'Matériel PLV Carton',
        amount: 250,
        category: 'Marketing',
        date: '2026-07-02',
        description: 'Affiches publicitaires de rentrée',
        recipient: 'Imprimerie Rapid',
        paymentMethod: 'Carte Bancaire',
        status: 'en_attente',
        attachment: null,
        tenantId: 't-aura-tech',
      }
    ];

    const insertExpense = db.prepare(`
      INSERT INTO expenses (id, title, amount, category, date, description, recipient, paymentMethod, status, attachment, tenantId)
      VALUES (@id, @title, @amount, @category, @date, @description, @recipient, @paymentMethod, @status, @attachment, @tenantId)
    `);

    expenses.forEach(exp => insertExpense.run(exp));

    // 9. Seed Loans & Repayments & Installments
    const loans = [
      {
        id: 'l-1',
        type: 'entrant',
        partnerName: 'Banque Populaire',
        amount: 15000,
        date: '2026-01-15',
        description: 'Prêt bancaire de démarrage à taux 1.5%',
        remainingBalance: 12500,
        status: 'actif',
        tenantId: 't-aura-tech',
        repayments: [
          { id: 'rep-1', amount: 500, date: '2026-02-15', note: 'Mensualité 1' },
          { id: 'rep-2', amount: 500, date: '2026-03-15', note: 'Mensualité 2' },
          { id: 'rep-3', amount: 500, date: '2026-04-15', note: 'Mensualité 3' },
          { id: 'rep-4', amount: 500, date: '2026-05-15', note: 'Mensualité 4' },
          { id: 'rep-5', amount: 500, date: '2026-06-15', note: 'Mensualité 5' },
        ],
        installments: [
          { id: 'inst-1', dueDate: '2026-07-15', amount: 500, status: 'en_attente', note: 'Mensualité 6' },
          { id: 'inst-2', dueDate: '2026-08-15', amount: 500, status: 'en_attente', note: 'Mensualité 7' },
        ]
      },
      {
        id: 'l-2',
        type: 'sortant',
        partnerName: 'Société Partenaire XYZ',
        amount: 4000,
        date: '2026-04-01',
        description: 'Avance de fonds exceptionnelle remboursable sous 6 mois',
        remainingBalance: 2000,
        status: 'actif',
        tenantId: 't-aura-tech',
        repayments: [
          { id: 'rep-6', amount: 1000, date: '2026-05-01', note: 'Remboursement partiel' },
          { id: 'rep-7', amount: 1000, date: '2026-06-01', note: 'Remboursement partiel' },
        ],
        installments: []
      }
    ];

    const insertLoan = db.prepare(`
      INSERT INTO loans (id, type, partnerName, amount, date, description, remainingBalance, status, tenantId)
      VALUES (@id, @type, @partnerName, @amount, @date, @description, @remainingBalance, @status, @tenantId)
    `);

    const insertRepayment = db.prepare(`
      INSERT INTO repayments (id, loanId, amount, date, note)
      VALUES (@id, @loanId, @amount, @date, @note)
    `);

    const insertInstallment = db.prepare(`
      INSERT INTO loan_installments (id, loanId, dueDate, amount, status, paidDate, note)
      VALUES (@id, @loanId, @dueDate, @amount, @status, @paidDate, @note)
    `);

    loans.forEach(loan => {
      insertLoan.run({
        id: loan.id,
        type: loan.type,
        partnerName: loan.partnerName,
        amount: loan.amount,
        date: loan.date,
        description: loan.description,
        remainingBalance: loan.remainingBalance,
        status: loan.status,
        tenantId: loan.tenantId
      });

      loan.repayments.forEach(rep => {
        insertRepayment.run({
          id: rep.id,
          loanId: loan.id,
          amount: rep.amount,
          date: rep.date,
          note: rep.note
        });
      });

      loan.installments.forEach((inst: any) => {
        insertInstallment.run({
          id: inst.id,
          loanId: loan.id,
          dueDate: inst.dueDate,
          amount: inst.amount,
          status: inst.status,
          paidDate: inst.paidDate || null,
          note: inst.note || null
        });
      });
    });

    // 10. Seed Sales & Sale Items
    const sales = [
      {
        id: 'sa-1',
        invoiceNumber: 'FAC-2026-001',
        date: '2026-07-10T14:30:00.000Z',
        subtotal: 2037,
        tax: 407.40,
        taxRate: 20,
        discount: 50,
        total: 1987,
        paymentMethod: 'carte',
        customerId: 'c-1',
        customerName: 'Jean Dupont',
        tenantId: 't-aura-tech',
        employeeId: 'u-1',
        employeeName: 'Barry Hassim',
        items: [
          { productId: 'p-1', productName: 'iPhone 15 Pro Max 256GB', quantity: 1, price: 1479, total: 1479 },
          { productId: 'p-3', productName: 'AirPods Pro Gen 2 USB-C', quantity: 2, price: 279, total: 558 }
        ]
      },
      {
        id: 'sa-2',
        invoiceNumber: 'FAC-2026-002',
        date: '2026-07-12T11:15:00.000Z',
        subtotal: 349,
        tax: 69.80,
        taxRate: 20,
        discount: 0,
        total: 349,
        paymentMethod: 'especes',
        customerId: 'c-2',
        customerName: 'Marie Curie',
        tenantId: 't-aura-tech',
        employeeId: 'u-1',
        employeeName: 'Barry Hassim',
        items: [
          { productId: 'p-4', productName: 'Sony WH-1000XM5', quantity: 1, price: 349, total: 349 }
        ]
      },
      {
        id: 'sa-3',
        invoiceNumber: 'FAC-2026-003',
        date: '2026-07-13T16:00:00.000Z',
        subtotal: 279,
        tax: 55.80,
        taxRate: 20,
        discount: 0,
        total: 279,
        paymentMethod: 'credit',
        customerId: 'c-2',
        customerName: 'Marie Curie',
        tenantId: 't-aura-tech',
        employeeId: 'u-1',
        employeeName: 'Barry Hassim',
        items: [
          { productId: 'p-3', productName: 'AirPods Pro Gen 2 USB-C', quantity: 1, price: 279, total: 279 }
        ]
      },
      {
        id: 'sa-4',
        invoiceNumber: 'FAC-2026-004',
        date: '2026-07-13T10:30:00.000Z',
        subtotal: 25.40,
        tax: 2.54,
        taxRate: 10,
        discount: 1.40,
        total: 24.00,
        paymentMethod: 'mobile_money',
        customerId: 'c-3',
        customerName: 'Alice Bernard',
        tenantId: 't-pharma-saintjean',
        employeeId: 'u-2',
        employeeName: 'Sophie Laurent',
        items: [
          { productId: 'p-5', productName: 'Doliprane 1000mg x8', quantity: 5, price: 2.10, total: 10.50 },
          { productId: 'p-6', productName: 'Sérum Hydratant CeraVe 50ml', quantity: 1, price: 14.90, total: 14.90 }
        ]
      }
    ];

    const insertSale = db.prepare(`
      INSERT INTO sales (id, invoiceNumber, date, subtotal, tax, taxRate, discount, total, paymentMethod, customerId, customerName, tenantId, employeeId, employeeName)
      VALUES (@id, @invoiceNumber, @date, @subtotal, @tax, @taxRate, @discount, @total, @paymentMethod, @customerId, @customerName, @tenantId, @employeeId, @employeeName)
    `);

    const insertSaleItem = db.prepare(`
      INSERT INTO sale_items (id, saleId, productId, productName, quantity, price, total)
      VALUES (@id, @saleId, @productId, @productName, @quantity, @price, @total)
    `);

    sales.forEach(sale => {
      insertSale.run({
        id: sale.id,
        invoiceNumber: sale.invoiceNumber,
        date: sale.date,
        subtotal: sale.subtotal,
        tax: sale.tax,
        taxRate: sale.taxRate,
        discount: sale.discount,
        total: sale.total,
        paymentMethod: sale.paymentMethod,
        customerId: sale.customerId,
        customerName: sale.customerName,
        tenantId: sale.tenantId,
        employeeId: sale.employeeId,
        employeeName: sale.employeeName
      });

      sale.items.forEach((item, idx) => {
        insertSaleItem.run({
          id: `${sale.id}-item-${idx}`,
          saleId: sale.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          price: item.price,
          total: item.total
        });
      });
    });

    // 11. Seed Subscription Payments (om123 Orange money pending)
    db.prepare(`
      INSERT INTO subscription_payments (id, tenantId, tenantName, planId, planName, amount, currency, paymentMethod, reference, transactionNumber, date, comment, receiptImage, status, adminComment, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'pm-1784107727966',
      't-pharma-saintjean',
      'Pharmacie Saint-Jean',
      'plan-standard',
      'Standard',
      29.0,
      'EUR',
      'Orange Money',
      'om123',
      '+224 620 00 00 00',
      '2026-07-15',
      'Déclaration de paiement hors plateforme de 29 EUR (Orange Money). Dossier en attente de validation. Ref: om123',
      'https://images.unsplash.com/photo-1554415707-6e8cfc93fe23?w=300&fit=crop&q=80',
      'PENDING',
      null,
      '2026-07-15T09:28:47.966Z',
      '2026-07-15T09:28:47.966Z'
    );

    console.log('Seeding completed successfully!');
  });

  transaction();
}
