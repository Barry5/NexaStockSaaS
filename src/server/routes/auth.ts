import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loginSchema, registerSchema } from '../schemas/index.js';
import { authService } from '../services/domain/authService.js';

const router = Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' as const : 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};

router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const result = await authService.login(req.body.email, req.body.password);
    if ('error' in result) {
      return res.status(result.status).json({ error: result.error });
    }
    res.cookie('nexastock_token', result.token, COOKIE_OPTIONS);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const result = await authService.register(req.body.companyName, req.body.email, req.body.password, req.body.role);
    if ('error' in result) {
      return res.status(result.status).json({ error: result.error });
    }
    if ('token' in result) {
      res.cookie('nexastock_token', result.token, COOKIE_OPTIONS);
    }
    res.status(210).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie('nexastock_token', { path: '/' });
  res.json({ success: true });
});

router.get('/me', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Non authentifié.' });
  }
  const profile = authService.getProfile(req.user.id);
  if (!profile) {
    return res.status(404).json({ error: 'Utilisateur non trouvé.' });
  }
  res.json(profile);
});

export default router;
