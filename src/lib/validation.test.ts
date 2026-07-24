import { describe, it, expect } from 'vitest';
import {
  loginSchema,
  registerSchema,
  productSchema,
  customerSchema,
  checkoutSchema,
  warehouseSchema,
  expenseSchema,
  validate,
  getFirstError,
} from './validation';

describe('loginSchema', () => {
  it('accepts valid login data', () => {
    const result = loginSchema.safeParse({ email: 'test@example.com', password: '1234' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = loginSchema.safeParse({ email: 'invalid', password: '1234' });
    expect(result.success).toBe(false);
  });

  it('rejects short password', () => {
    const result = loginSchema.safeParse({ email: 'test@example.com', password: '12' });
    expect(result.success).toBe(false);
  });

  it('rejects empty email', () => {
    const result = loginSchema.safeParse({ email: '', password: '1234' });
    expect(result.success).toBe(false);
  });
});

describe('productSchema', () => {
  const validProduct = {
    name: 'Produit Test',
    sku: 'SKU-001',
    category: 'Électronique',
    buyPrice: 50,
    sellPrice: 100,
    quantity: 10,
  };

  it('accepts valid product', () => {
    const result = productSchema.safeParse(validProduct);
    expect(result.success).toBe(true);
  });

  it('rejects product without name', () => {
    const result = productSchema.safeParse({ ...validProduct, name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects product without sku', () => {
    const result = productSchema.safeParse({ ...validProduct, sku: '' });
    expect(result.success).toBe(false);
  });

  it('rejects negative price', () => {
    const result = productSchema.safeParse({ ...validProduct, buyPrice: -10 });
    expect(result.success).toBe(false);
  });

  it('rejects negative quantity', () => {
    const result = productSchema.safeParse({ ...validProduct, quantity: -5 });
    expect(result.success).toBe(false);
  });

  it('accepts optional fields', () => {
    const result = productSchema.safeParse({
      ...validProduct,
      barcode: '123456',
      description: 'Un produit test',
      image: 'https://example.com/img.jpg',
    });
    expect(result.success).toBe(true);
  });
});

describe('customerSchema', () => {
  it('accepts valid customer', () => {
    const result = customerSchema.safeParse({ name: 'Client Test', phone: '0123456789' });
    expect(result.success).toBe(true);
  });

  it('rejects customer without name', () => {
    const result = customerSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('accepts empty email as valid', () => {
    const result = customerSchema.safeParse({ name: 'Test', email: '' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email format', () => {
    const result = customerSchema.safeParse({ name: 'Test', email: 'not-an-email' });
    expect(result.success).toBe(false);
  });
});

describe('checkoutSchema', () => {
  it('accepts valid checkout data', () => {
    const result = checkoutSchema.safeParse({
      items: [{ productId: 'p1', productName: 'Prod', quantity: 1, price: 100, total: 100 }],
      paymentMethod: 'especes',
      amountPaid: 100,
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty cart', () => {
    const result = checkoutSchema.safeParse({
      items: [],
      paymentMethod: 'especes',
      amountPaid: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid payment method', () => {
    const result = checkoutSchema.safeParse({
      items: [{ productId: 'p1', productName: 'Prod', quantity: 1, price: 100, total: 100 }],
      paymentMethod: 'bitcoin',
      amountPaid: 100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative quantity', () => {
    const result = checkoutSchema.safeParse({
      items: [{ productId: 'p1', productName: 'Prod', quantity: 0, price: 100, total: 0 }],
      paymentMethod: 'credit',
      amountPaid: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe('warehouseSchema', () => {
  it('accepts valid warehouse', () => {
    const result = warehouseSchema.safeParse({ name: 'Entrepôt Principal', location: 'Dakar' });
    expect(result.success).toBe(true);
  });

  it('rejects warehouse without name', () => {
    const result = warehouseSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });
});

describe('expenseSchema', () => {
  const validExpense = {
    title: 'Achat fournitures',
    amount: 15000,
    category: 'Fournitures',
    date: '2026-07-22',
    paymentMethod: 'especes',
  };

  it('accepts valid expense', () => {
    const result = expenseSchema.safeParse(validExpense);
    expect(result.success).toBe(true);
  });

  it('rejects expense without title', () => {
    const result = expenseSchema.safeParse({ ...validExpense, title: '' });
    expect(result.success).toBe(false);
  });

  it('rejects negative amount', () => {
    const result = expenseSchema.safeParse({ ...validExpense, amount: -100 });
    expect(result.success).toBe(false);
  });

  it('rejects zero amount', () => {
    const result = expenseSchema.safeParse({ ...validExpense, amount: 0 });
    expect(result.success).toBe(false);
  });
});

describe('validate helper', () => {
  it('returns success with data for valid input', () => {
    const result = validate(productSchema, { name: 'Test', sku: 'S1', category: 'Cat', buyPrice: 10, sellPrice: 20, quantity: 5 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Test');
    }
  });

  it('returns errors for invalid input', () => {
    const result = validate(productSchema, { name: '', sku: '', category: '', buyPrice: -1, sellPrice: -1, quantity: -1 });
    expect(result.success).toBe(false);
    if (!result.success && result.errors) {
      expect(result.errors.name).toBeDefined();
      expect(result.errors.sku).toBeDefined();
    }
  });
});

describe('getFirstError helper', () => {
  it('returns null for valid data', () => {
    const error = getFirstError(loginSchema, { email: 'a@b.com', password: '1234' }, 'email');
    expect(error).toBeNull();
  });

  it('returns first error message for invalid field', () => {
    const error = getFirstError(loginSchema, { email: 'bad', password: '1234' }, 'email');
    expect(error).toBeTruthy();
    expect(typeof error).toBe('string');
  });

  it('returns null for non-errored field', () => {
    const error = getFirstError(loginSchema, { email: 'bad', password: '1234' }, 'password');
    expect(error).toBeNull();
  });
});
