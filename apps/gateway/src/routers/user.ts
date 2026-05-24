import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { proxyTo, coreUrl } from '../services/proxy.service';
import { invalidatePrefs } from '../services/prefsCache';

const router = Router();

// ── Onboarding ────────────────────────────────────────────────────────────────

router.post('/onboarding', authMiddleware, async (req: Request, res: Response) => {
  const { status, body } = await proxyTo(
    coreUrl(`/internal/users/${req.user!.id}/onboarding`),
    { method: 'POST' },
  );
  res.status(status).json(body);
});

// ── Profile ───────────────────────────────────────────────────────────────────

router.patch('/profile', authMiddleware, async (req: Request, res: Response) => {
  const { status, body } = await proxyTo(
    coreUrl(`/internal/users/${req.user!.id}/profile`),
    {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(req.body),
    },
  );
  res.status(status).json(body);
});

// ── Study Sessions ────────────────────────────────────────────────────────────

router.get('/study-sessions', authMiddleware, async (req: Request, res: Response) => {
  const { limit, page, activityType } = req.query as Record<string, string | undefined>;
  const params = new URLSearchParams();
  if (limit) params.set('limit', limit);
  if (page) params.set('page', page);
  if (activityType) params.set('activityType', activityType);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const { status, body } = await proxyTo(
    coreUrl(`/internal/users/${req.user!.id}/study-sessions${qs}`),
    { method: 'GET' },
  );
  res.status(status).json(body);
});

router.post('/study-sessions', authMiddleware, async (req: Request, res: Response) => {
  const { status, body } = await proxyTo(
    coreUrl(`/internal/users/${req.user!.id}/study-sessions`),
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(req.body),
    },
  );
  res.status(status).json(body);
});

// ── Preferences ───────────────────────────────────────────────────────────────

router.get('/preferences', authMiddleware, async (req: Request, res: Response) => {
  const { status, body } = await proxyTo(
    coreUrl(`/internal/user-preferences/${req.user!.id}`),
    { method: 'GET' },
  );
  res.status(status).json(body);
});

router.patch('/preferences', authMiddleware, async (req: Request, res: Response) => {
  const { status, body } = await proxyTo(
    coreUrl(`/internal/user-preferences/${req.user!.id}`),
    {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(req.body),
    },
  );
  if (status >= 200 && status < 300) invalidatePrefs(req.user!.id);
  res.status(status).json(body);
});

// ── API Keys ──────────────────────────────────────────────────────────────────

router.get('/api-keys', authMiddleware, async (req: Request, res: Response) => {
  const { status, body } = await proxyTo(
    coreUrl(`/internal/api-keys/${req.user!.id}`),
    { method: 'GET' },
  );
  res.status(status).json(body);
});

/**
 * Ping-test a provider key without storing it. Returns:
 *   200: { ok: true }
 *   400: { ok: false, code: 'invalid_format' }
 *   401: { ok: false, code: 'invalid_key' }
 *   429: { ok: false, code: 'quota_exceeded' }
 *   502: { ok: false, code: 'network' }
 */
router.post('/api-keys/:provider/validate', authMiddleware, async (req: Request, res: Response) => {
  const { provider } = req.params as { provider: string };
  const { key } = req.body as { key?: string };
  if (typeof key !== 'string' || !key.trim()) {
    res.status(400).json({ ok: false, code: 'invalid_format' });
    return;
  }
  const trimmed = key.trim();

  // Cheap format guards first — saves a network round-trip.
  if (provider === 'openai' && !trimmed.startsWith('sk-')) {
    res.status(400).json({ ok: false, code: 'invalid_format' });
    return;
  }
  if (provider === 'anthropic' && !trimmed.startsWith('sk-ant-')) {
    res.status(400).json({ ok: false, code: 'invalid_format' });
    return;
  }

  try {
    if (provider === 'openai') {
      const upstream = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${trimmed}` },
      });
      if (upstream.ok) { res.status(200).json({ ok: true }); return; }
      if (upstream.status === 401) { res.status(401).json({ ok: false, code: 'invalid_key' }); return; }
      if (upstream.status === 429) { res.status(429).json({ ok: false, code: 'quota_exceeded' }); return; }
      res.status(upstream.status).json({ ok: false, code: 'invalid_key' });
      return;
    }
    if (provider === 'anthropic') {
      const upstream = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': trimmed, 'anthropic-version': '2023-06-01' },
      });
      if (upstream.ok) { res.status(200).json({ ok: true }); return; }
      if (upstream.status === 401 || upstream.status === 403) {
        res.status(401).json({ ok: false, code: 'invalid_key' });
        return;
      }
      if (upstream.status === 429) { res.status(429).json({ ok: false, code: 'quota_exceeded' }); return; }
      res.status(upstream.status).json({ ok: false, code: 'invalid_key' });
      return;
    }
    res.status(400).json({ ok: false, code: 'invalid_format' });
  } catch {
    res.status(502).json({ ok: false, code: 'network' });
  }
});

router.post('/api-keys', authMiddleware, async (req: Request, res: Response) => {
  const { status, body } = await proxyTo(
    coreUrl(`/internal/api-keys/${req.user!.id}`),
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(req.body),
    },
  );
  res.status(status).json(body);
});

router.delete('/api-keys/:provider', authMiddleware, async (req: Request, res: Response) => {
  const { status, body } = await proxyTo(
    coreUrl(`/internal/api-keys/${req.user!.id}/${req.params.provider}`),
    { method: 'DELETE' },
  );
  res.status(status).json(body);
});

export default router;
