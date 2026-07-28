import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/auth.js';
import { AUTH_ERROR_MESSAGES, HTTP_STATUS } from '../constants/http.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    tenantId: string | null;
    role: string;
    name: string;
  };
}

function extractToken(req: AuthenticatedRequest): string | null {
  const authHeader = req.headers['authorization'];
  if (typeof authHeader === 'string') {
    const trimmed = authHeader.trim();
    if (trimmed.startsWith('Bearer ')) {
      return trimmed.slice(7).trim() || null;
    }
    return trimmed || null;
  }

  const fallbackHeader = req.headers['x-auth-token'];
  if (typeof fallbackHeader === 'string') {
    return fallbackHeader.trim() || null;
  }

  const cookie = req.cookies?.['nexastock_token'];
  if (typeof cookie === 'string' && cookie.length > 0) {
    return cookie;
  }

  return null;
}

export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);

  if (!token) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: AUTH_ERROR_MESSAGES.MISSING_TOKEN });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({ error: AUTH_ERROR_MESSAGES.INVALID_TOKEN });
  }

  req.user = decoded;
  next();
}

export function requireRole(roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: AUTH_ERROR_MESSAGES.UNAUTHENTICATED });
    }

    // superadmin always bypasses role checks
    if (req.user.role === 'superadmin') {
      return next();
    }

    if (!roles.includes(req.user.role)) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({ error: 'Accès refusé. Privilèges insuffisants pour cette action.' });
    }

    next();
  };
}
