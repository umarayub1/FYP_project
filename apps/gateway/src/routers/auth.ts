import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import * as authService from '../services/auth.service';
import { authMiddleware } from '../middleware/auth';
import { proxyTo, coreUrl } from '../services/proxy.service';

const CORE = process.env.CORE_SERVICE_URL ?? 'http://core-service:4001';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function fireSession(userId: string, userAgent: string) {
  fetch(`${CORE}/internal/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      device: userAgent || 'Unknown',
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    }),
  }).catch((err: unknown) => {
    console.warn(`[auth] fireSession failed for user ${userId}: ${(err as Error).message}`);
  });
}

// Rate limiter: 5 requests per 15 minutes per IP (SRS §FR9.4)
const magicLinkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again later.' },
});

const router = Router();

const emailSchema = z.object({ email: z.string().email() });
const refreshSchema = z.object({ refreshToken: z.string().min(1) });

// Removed: magic link auth replaces password auth (POST /register, POST /login)

router.post('/magic-link', magicLinkLimiter, async (req: Request, res: Response) => {
  const parsed = emailSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors });
    return;
  }
  const { status, data } = await authService.sendMagicLink(parsed.data.email);
  res.status(status).json(data);
});

router.get('/callback', async (req: Request, res: Response) => {
  const token = req.query.token;
  if (!token || typeof token !== 'string') {
    res.status(400).json({ error: 'Missing token' });
    return;
  }
  const { status, data } = await authService.verifyCallback(token);
  if (status !== 200) {
    res.status(status).json(data);
    return;
  }
  // Fire a session record for the new login
  if (data.user?._id) {
    fireSession(String(data.user._id), req.headers['user-agent'] ?? '');
  }
  res.status(200).json(data);
});

router.post('/refresh', async (req: Request, res: Response) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors });
    return;
  }
  const { status, data } = await authService.refreshTokens(parsed.data.refreshToken);
  res.status(status).json(data);
});

router.post('/logout', async (req: Request, res: Response) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    // Even with no/invalid token, clear cookies and return success
    res.json({ message: 'Signed out' });
    return;
  }
  const { status, data } = await authService.logoutUser(parsed.data.refreshToken);
  res.status(status).json(data);
});

router.post('/delete-account', authMiddleware, async (req: Request, res: Response) => {
  const { status, body } = await proxyTo(
    coreUrl(`/internal/users/${req.user!.id}`),
    { method: 'DELETE' },
  );
  res.status(status).json(body);
});

export default router;
