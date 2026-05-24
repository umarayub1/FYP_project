import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as authController from '../controllers/auth.controller';

const router = Router();

const emailSchema = z.object({ email: z.string().email() });
const tokenSchema = z.object({ token: z.string().min(1) });
const refreshSchema = z.object({ refreshToken: z.string().min(1) });
const logoutSchema = z.object({ refreshToken: z.string().min(1) });

// Removed: magic link auth replaces password auth (POST /register, POST /login)

router.post('/magic-link', async (req: Request, res: Response) => {
  const parsed = emailSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors });
    return;
  }
  // Always return 200 to prevent user enumeration
  await authController.requestMagicLink(parsed.data.email).catch(() => {});
  res.json({ message: 'Check your email' });
});

router.post('/callback', async (req: Request, res: Response) => {
  const parsed = tokenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors });
    return;
  }
  try {
    const result = await authController.verifyMagicLink(parsed.data.token);
    res.json(result);
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    res.status(e.status ?? 400).json({ error: e.message });
  }
});

router.post('/refresh', async (req: Request, res: Response) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors });
    return;
  }
  try {
    const result = await authController.refresh(parsed.data.refreshToken);
    res.json(result);
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

router.post('/logout', async (req: Request, res: Response) => {
  const parsed = logoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors });
    return;
  }
  await authController.logout(parsed.data.refreshToken).catch(() => {});
  res.json({ message: 'Signed out' });
});

export default router;
