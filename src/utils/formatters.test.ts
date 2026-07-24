import { describe, it, expect } from 'vitest';
import { formatCurrency, formatDate, formatDateTime, formatTime, generateId, generateInvoiceNumber } from './formatters';

describe('formatCurrency', () => {
  it('formats with default EUR currency (shows € symbol)', () => {
    const result = formatCurrency(1234.5);
    expect(result).toContain('1');
    expect(result).toContain('234');
    expect(result).toContain('€');
  });

  it('handles zero', () => {
    const result = formatCurrency(0);
    expect(result).toContain('0');
  });

  it('handles custom currency', () => {
    const result = formatCurrency(500, 'XOF', 0);
    expect(result).toContain('500');
    expect(result).toContain('F');
  });

  it('handles fallback for invalid currency', () => {
    const result = formatCurrency(100, 'INVALID', 2);
    expect(result).toContain('100');
  });

  it('handles negative numbers', () => {
    const result = formatCurrency(-50);
    expect(result).toContain('50');
  });

  it('handles decimal formatting', () => {
    const result = formatCurrency(99.99);
    expect(result).toContain(',99');
  });
});

describe('formatDate', () => {
  it('formats a date string correctly', () => {
    const result = formatDate('2026-07-22');
    expect(result).toContain('22');
    expect(result).toContain('07');
    expect(result).toContain('2026');
  });

  it('handles ISO date with time', () => {
    const result = formatDate('2026-01-15T10:30:00Z');
    expect(result).toBeTruthy();
  });
});

describe('formatDateTime', () => {
  it('returns a non-empty string', () => {
    const result = formatDateTime('2026-07-22T14:30:00');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });
});

describe('formatTime', () => {
  it('returns a time string', () => {
    const result = formatTime('2026-07-22T14:30:00');
    expect(result).toBeTruthy();
  });
});

describe('generateId', () => {
  it('generates an id with the given prefix', () => {
    const id = generateId('prod');
    expect(id).toMatch(/^prod-/);
  });

  it('generates unique ids on successive calls', () => {
    const id1 = generateId('test');
    const id2 = generateId('test');
    expect(id1).not.toBe(id2);
  });

  it('uses default prefix when not provided', () => {
    const id = generateId();
    expect(id).toMatch(/^id-/);
  });
});

describe('generateInvoiceNumber', () => {
  it('generates an invoice number with FACT prefix', () => {
    const inv = generateInvoiceNumber();
    expect(inv).toMatch(/^FACT-\d{6}-\d{4}$/);
  });

  it('generates unique invoice numbers', () => {
    const inv1 = generateInvoiceNumber();
    const inv2 = generateInvoiceNumber();
    expect(inv1).not.toBe(inv2);
  });
});
