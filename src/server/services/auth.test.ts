import { describe, it, expect } from 'vitest';
import { hashPassword, comparePassword, generateToken, verifyToken } from './auth';

describe('hashPassword and comparePassword', () => {
  it('hashes a password successfully', async () => {
    const hash = await hashPassword('monMotDePasse');
    expect(hash).toBeDefined();
    expect(typeof hash).toBe('string');
    expect(hash).not.toBe('monMotDePasse');
  });

  it('compares correct password returns true', async () => {
    const hash = await hashPassword('test1234');
    const match = await comparePassword('test1234', hash);
    expect(match).toBe(true);
  });

  it('compares wrong password returns false', async () => {
    const hash = await hashPassword('test1234');
    const match = await comparePassword('wrongPassword', hash);
    expect(match).toBe(false);
  });
});

describe('generateToken and verifyToken', () => {
  const payload = { id: 'user-1', email: 'test@example.com', tenantId: 'tenant-1', role: 'admin', name: 'Test User' };

  it('signs a valid token', () => {
    const token = generateToken(payload);
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
  });

  it('verifies a valid token', () => {
    const token = generateToken(payload);
    const decoded = verifyToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.id).toBe('user-1');
    expect(decoded?.email).toBe('test@example.com');
    expect(decoded?.role).toBe('admin');
  });

  it('verifies invalid token returns null', () => {
    const decoded = verifyToken('invalid-token-here');
    expect(decoded).toBeNull();
  });

  it('verifies tampered token returns null', () => {
    const token = generateToken(payload);
    const tampered = token.slice(0, -5) + 'XXXXX';
    const decoded = verifyToken(tampered);
    expect(decoded).toBeNull();
  });

  it('preserves custom payload fields', () => {
    const token = generateToken(payload);
    const decoded = verifyToken(token);
    expect(decoded?.name).toBe('Test User');
    expect(decoded?.tenantId).toBe('tenant-1');
  });

  it('handles empty string token', () => {
    const decoded = verifyToken('');
    expect(decoded).toBeNull();
  });
});
