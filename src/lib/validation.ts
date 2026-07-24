import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Adresse email invalide.'),
  password: z.string().min(4, 'Le mot de passe doit contenir au moins 4 caractères.'),
});

export const registerSchema = z.object({
  companyName: z.string().min(2, 'Le nom de l\'entreprise doit contenir au moins 2 caractères.'),
  email: z.string().email('Adresse email invalide.'),
  password: z.string().min(4, 'Le mot de passe doit contenir au moins 4 caractères.').optional(),
});

export const productSchema = z.object({
  name: z.string().min(2, 'Le nom du produit est requis.'),
  sku: z.string().min(1, 'L\'UGS (SKU) est requis.'),
  barcode: z.string().optional(),
  description: z.string().optional(),
  category: z.string().min(1, 'La catégorie est requise.'),
  buyPrice: z.number().min(0, 'Le prix d\'achat doit être positif.'),
  sellPrice: z.number().min(0, 'Le prix de vente doit être positif.'),
  quantity: z.number().int().min(0, 'La quantité doit être un nombre entier positif.'),
  alertThreshold: z.number().int().min(0).default(5),
  image: z.string().optional(),
});

export const customerSchema = z.object({
  name: z.string().min(2, 'Le nom du client est requis.'),
  email: z.string().email('Email invalide.').optional().or(z.literal('')),
  phone: z.string().optional(),
});

export const saleItemSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  quantity: z.number().int().positive('La quantité doit être supérieure à 0.'),
  price: z.number().min(0),
  total: z.number().min(0),
});

export const checkoutSchema = z.object({
  items: z.array(saleItemSchema).min(1, 'Ajoutez au moins un produit au panier.'),
  paymentMethod: z.enum(['especes', 'carte', 'mobile_money', 'credit'], { message: 'Sélectionnez un moyen de paiement.' }),
  amountPaid: z.number().min(0),
  customerId: z.string().optional(),
});

export const warehouseSchema = z.object({
  name: z.string().min(2, 'Le nom de l\'entrepôt est requis.'),
  location: z.string().optional(),
});

export const expenseSchema = z.object({
  title: z.string().min(2, 'Le titre de la dépense est requis.'),
  amount: z.number().positive('Le montant doit être positif.'),
  category: z.string().min(1, 'La catégorie est requise.'),
  date: z.string(),
  description: z.string().optional(),
  paymentMethod: z.string().min(1),
});

export type ValidationResult<T> =
  | { success: true; data: T; errors?: undefined }
  | { success: false; errors: Record<string, string[]>; data?: undefined };

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): ValidationResult<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join('.');
    if (!errors[path]) errors[path] = [];
    errors[path].push(issue.message);
  }
  return { success: false, errors };
}

export function getFirstError<T>(schema: z.ZodSchema<T>, data: unknown, field: string): string | null {
  const result = validate(schema, data);
  if (result.success) return null;
  return result.errors[field]?.[0] || null;
}
