import { Request, Response, NextFunction } from 'express';
import { proxyTo, coreUrl } from '../services/proxy.service';

type QuotaType = 'pdfsIngested' | 'feynmanSessions' | 'tokensUsed';

export function quotaCheck(type: QuotaType) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try {
      const { status, body } = await proxyTo(
        coreUrl(`/internal/quota/${req.user.id}/check?type=${type}`),
        { method: 'GET' },
      );
      if (status !== 200) {
        // Fail open: quota service error — allow request
        next();
        return;
      }
      const result = body as { allowed: boolean; used: number; limit: number };
      if (!result.allowed) {
        res.status(429).json({
          error: 'Monthly quota exceeded',
          code: 'QUOTA_EXCEEDED',
          used: result.used,
          limit: result.limit,
        });
        return;
      }
      next();
    } catch {
      // Fail open: quota service unreachable — allow request
      next();
    }
  };
}

export async function incrementQuota(userId: string, type: QuotaType, amount = 1): Promise<void> {
  try {
    await proxyTo(coreUrl(`/internal/quota/${userId}/increment`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, amount }),
    });
  } catch {
    // fire-and-forget: increment failures are non-critical
  }
}
