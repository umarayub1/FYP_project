import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { proxyTo, coreUrl } from '../services/proxy.service';

const router = Router();

const createSchema = z.object({
  name:  z.string().min(1).max(50),
  color: z.string().optional(),
});

const updateSchema = z.object({
  name:  z.string().min(1).max(50).optional(),
  color: z.string().optional(),
});

const mergeSchema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
});

// GET /api/tags?slug=
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  const qs = req.query.slug ? `?userId=${req.user!.id}&slug=${req.query.slug}` : `?userId=${req.user!.id}`;
  const { status, body } = await proxyTo(coreUrl(`/internal/tags${qs}`), { method: 'GET' });
  res.status(status).json(body);
});

// GET /api/tags/:id/items
router.get('/:id/items', authMiddleware, async (req: Request, res: Response) => {
  const { status, body } = await proxyTo(
    coreUrl(`/internal/tags/${req.params.id}/items?userId=${req.user!.id}`),
    { method: 'GET' },
  );
  res.status(status).json(body);
});

// POST /api/tags
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  const { status, body } = await proxyTo(coreUrl('/internal/tags'), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId: req.user!.id, ...parsed.data }),
  });
  res.status(status).json(body);
});

// POST /api/tags/merge
router.post('/merge', authMiddleware, async (req: Request, res: Response) => {
  const parsed = mergeSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  const { status } = await proxyTo(coreUrl('/internal/tags/merge'), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId: req.user!.id, ...parsed.data }),
  });
  res.status(status).end();
});

// PATCH /api/tags/:id
router.patch('/:id', authMiddleware, async (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  const { status, body } = await proxyTo(coreUrl(`/internal/tags/${req.params.id}`), {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId: req.user!.id, ...parsed.data }),
  });
  res.status(status).json(body);
});

// PATCH /api/tags/:id/promote
router.patch('/:id/promote', authMiddleware, async (req: Request, res: Response) => {
  const { status, body } = await proxyTo(coreUrl(`/internal/tags/${req.params.id}/promote`), {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId: req.user!.id }),
  });
  res.status(status).json(body);
});

// DELETE /api/tags/:id
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  const { status } = await proxyTo(
    coreUrl(`/internal/tags/${req.params.id}?userId=${req.user!.id}`),
    { method: 'DELETE' },
  );
  res.status(status).end();
});

export default router;
