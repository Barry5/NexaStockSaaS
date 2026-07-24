import { describe, it, expect, vi } from 'vitest';
import { authenticateToken, requireRole } from './auth';
import type { AuthenticatedRequest } from './auth';
import type { Response, NextFunction } from 'express';
import { generateToken } from '../services/auth';

function createMockReq(token?: string, user?: any): AuthenticatedRequest {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    user,
  } as AuthenticatedRequest;
}

function createMockRes(): Response {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe('authenticateToken', () => {
  it('returns 401 if no token', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next: NextFunction = vi.fn();

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Token d'authentification manquant." });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 if token is invalid', () => {
    const req = createMockReq('invalid-token');
    const res = createMockRes();
    const next: NextFunction = vi.fn();

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Session expirée ou jeton invalide.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next and sets req.user if token is valid', () => {
    const payload = { id: 'u1', email: 'a@b.com', tenantId: 't1', role: 'admin', name: 'Alice' };
    const token = generateToken(payload);
    const req = createMockReq(token);
    const res = createMockRes();
    const next: NextFunction = vi.fn();

    authenticateToken(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user?.id).toBe('u1');
    expect(req.user?.role).toBe('admin');
  });
});

describe('requireRole', () => {
  it('returns 401 if user is not authenticated', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next: NextFunction = vi.fn();
    const middleware = requireRole(['admin']);

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 if user role is not allowed', () => {
    const req = createMockReq('', { id: 'u1', email: 'a@b.com', tenantId: 't1', role: 'vendeur', name: 'Bob' });
    const res = createMockRes();
    const next: NextFunction = vi.fn();
    const middleware = requireRole(['admin']);

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows superadmin regardless of required roles', () => {
    const req = createMockReq('', { id: 'u1', email: 'a@b.com', tenantId: 't1', role: 'superadmin', name: 'Root' });
    const res = createMockRes();
    const next: NextFunction = vi.fn();
    const middleware = requireRole(['admin']);

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('allows user with matching role', () => {
    const req = createMockReq('', { id: 'u1', email: 'a@b.com', tenantId: 't1', role: 'admin', name: 'Alice' });
    const res = createMockRes();
    const next: NextFunction = vi.fn();
    const middleware = requireRole(['admin', 'owner']);

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
