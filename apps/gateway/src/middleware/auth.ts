import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const ACCESS_COOKIE = 'synapse_token';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string };
    }
  }
}

function verifyToken(token: string, req: Request, next: NextFunction): boolean {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { sub: string; email: string };
    req.user = { id: payload.sub, email: payload.email };
    next();
    return true;
  } catch {
    return false;
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // 1. Try Authorization: Bearer header (server-side Next.js calls)
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    if (verifyToken(header.slice(7), req, next)) return;
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // 2. Try httpOnly cookie (browser direct calls with credentials: 'include')
  const cookieToken = (req as any).cookies?.[ACCESS_COOKIE];
  if (cookieToken) {
    if (verifyToken(cookieToken, req, next)) return;
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  res.status(401).json({ error: 'Unauthorized' });
}
