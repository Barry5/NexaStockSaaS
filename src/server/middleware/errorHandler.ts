import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  console.error('Unhandled Application Error:', err);
  
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Une erreur serveur interne est survenue.';
  
  res.status(status).json({
    error: message,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
  });
}
