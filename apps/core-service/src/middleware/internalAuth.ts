import { Request, Response, NextFunction } from 'express';

export function internalAuth(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.INTERNAL_SECRET;
  if (!secret) {
    console.error('[internalAuth] INTERNAL_SECRET env var not set');
    return res.status(500).json({ error: 'Internal configuration error' });
  }
  const provided = req.headers['x-internal-secret'];
  const value = Array.isArray(provided) ? provided[0] : provided;
  if (!value || value !== secret) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}
