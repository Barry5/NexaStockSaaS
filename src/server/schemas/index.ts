import { z } from 'zod';

// AUTH SCHEMAS
export const loginSchema = z.object({
  email: z.string().email('Adresse email invalide.'),
  password: z.string().min(4, 'Le mot de passe doit contenir au moins 4 caractères.')
});

export const registerSchema = z.object({
  companyName: z.string().min(2, 'Le nom de l\'entreprise doit contenir au moins 2 caractères.'),
  email: z.string().email('Adresse email invalide.'),
  password: z.string().min(4, 'Le mot de passe doit contenir au moins 4 caractères.').optional(),
  role: z.string().optional()
});

export const profileUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  avatar: z.string().url().optional(),
  password: z.string().min(4).optional()
});

// PRODUCT SCHEMA
export const productSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, 'Le nom du produit est requis.'),
  sku: z.string().min(1, 'L\'UGS (SKU) est requis.'),
  barcode: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  category: z.string().min(1, 'La catégorie est requise.'),
  buyPrice: z.number().nonnegative(),
  sellPrice: z.number().nonnegative(),
  quantity: z.number().int().nonnegative(),
  alertThreshold: z.number().int().nonnegative().default(5),
  image: z.string().optional().nullable()
});

// CUSTOMER SCHEMA
export const customerSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, 'Le nom du client est requis.'),
  email: z.string().email().optional().nullable().or(z.literal('')),
  phone: z.string().optional().nullable(),
  loyaltyPoints: z.number().int().nonnegative().default(0),
  outstandingDebt: z.number().nonnegative().default(0)
});

// SUPPLIER SCHEMA
export const supplierSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, 'Le nom du fournisseur est requis.'),
  contactName: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal(''))
});

// EXPENSE SCHEMA
export const expenseSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(2, 'Le titre de la dépense est requis.'),
  amount: z.number().positive(),
  category: z.string().min(1, 'La catégorie est requise.'),
  date: z.string(),
  description: z.string().optional().nullable(),
  recipient: z.string().optional().nullable(),
  paymentMethod: z.string().min(1),
  status: z.enum(['paye', 'en_attente']).default('en_attente'),
  attachment: z.string().optional().nullable()
});

// LOAN SCHEMAS
export const repaymentSchema = z.object({
  id: z.string(),
  amount: z.number().positive(),
  date: z.string(),
  note: z.string().optional().nullable()
});

export const installmentSchema = z.object({
  id: z.string(),
  dueDate: z.string(),
  amount: z.number().positive(),
  status: z.enum(['en_attente', 'paye']).default('en_attente'),
  paidDate: z.string().optional().nullable(),
  note: z.string().optional().nullable()
});

export const loanSchema = z.object({
  id: z.string().optional(),
  type: z.enum(['entrant', 'sortant']),
  partnerName: z.string().min(2, 'Le nom du partenaire est requis.'),
  amount: z.number().positive(),
  date: z.string(),
  description: z.string().optional().nullable(),
  remainingBalance: z.number().nonnegative(),
  status: z.enum(['actif', 'rembourse']).default('actif'),
  repayments: z.array(repaymentSchema).optional().default([]),
  installments: z.array(installmentSchema).optional().default([])
});

// WAREHOUSE SCHEMA
export const warehouseSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, 'Le nom de l\'entrepôt est requis.'),
  location: z.string().optional().nullable()
});

// STOCK TRANSFER SCHEMA
export const stockTransferSchema = z.object({
  id: z.string().optional(),
  productId: z.string(),
  productName: z.string(),
  fromWarehouseId: z.string(),
  toWarehouseId: z.string(),
  quantity: z.number().int().positive(),
  date: z.string(),
  status: z.enum(['termine', 'en_cours']).default('en_cours')
});

// SALE ITEM SCHEMA
export const saleItemSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  quantity: z.number().int().positive(),
  price: z.number().nonnegative(),
  total: z.number().nonnegative()
});

// SALE SCHEMA
export const saleSchema = z.object({
  id: z.string().optional(),
  invoiceNumber: z.string(),
  date: z.string(),
  items: z.array(saleItemSchema).min(1, 'Une vente doit contenir au moins 1 produit.'),
  subtotal: z.number().nonnegative(),
  tax: z.number().nonnegative(),
  taxRate: z.number().optional().default(20),
  discount: z.number().nonnegative(),
  total: z.number().nonnegative(),
  paymentMethod: z.enum(['especes', 'carte', 'mobile_money', 'credit']),
  customerId: z.string().optional().nullable(),
  customerName: z.string().optional().nullable(),
  employeeId: z.string(),
  employeeName: z.string()
});

// TENANT UPDATE SCHEMA
export const tenantUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional().nullable(),
  logo: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  currency: z.string().optional(),
  taxRate: z.number().optional()
});
