import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { proxyTo, coreUrl } from '../services/proxy.service';

const router = Router();

const createSchema = z.object({
  title:      z.string().max(100).optional(),
  studySetId: z.string().min(1).optional(),
});

// GET /api/coach/conversations?studySetId=
router.get('/conversations', authMiddleware, async (req: Request, res: Response) => {
  const studySetId = (req.query.studySetId as string) || '';
  if (!studySetId) { res.status(400).json({ error: 'studySetId query param required' }); return; }
  const params = new URLSearchParams({ userId: req.user!.id, studySetId });
  const { status, body } = await proxyTo(
    coreUrl(`/internal/coach-conversations?${params.toString()}`),
    { method: 'GET' },
  );
  res.status(status).json(body);
});

// POST /api/coach/conversations
router.post('/conversations', authMiddleware, async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  const { status, body } = await proxyTo(coreUrl('/internal/coach-conversations'), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId: req.user!.id, ...parsed.data }),
  });
  res.status(status).json(body);
});

// GET /api/coach/conversations/:id
router.get('/conversations/:id', authMiddleware, async (req: Request, res: Response) => {
  const { status, body } = await proxyTo(
    coreUrl(`/internal/coach-conversations/${req.params.id}?userId=${req.user!.id}`),
    { method: 'GET' },
  );
  res.status(status).json(body);
});

// POST /api/coach/conversations/:id/messages
router.post('/conversations/:id/messages', authMiddleware, async (req: Request, res: Response) => {
  const { role, content, citations } = req.body as { role?: string; content?: string; citations?: unknown[] };
  if (role !== 'user' && role !== 'assistant') {
    res.status(400).json({ error: 'role must be user or assistant' }); return;
  }
  if (typeof content !== 'string' || !content.trim()) {
    res.status(400).json({ error: 'content required' }); return;
  }
  const { status, body } = await proxyTo(
    coreUrl(`/internal/coach-conversations/${req.params.id}/messages`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: req.user!.id, role, content, citations }),
    },
  );
  res.status(status).json(body);
});

// DELETE /api/coach/conversations/:id
router.delete('/conversations/:id', authMiddleware, async (req: Request, res: Response) => {
  const { status, body } = await proxyTo(
    coreUrl(`/internal/coach-conversations/${req.params.id}?userId=${req.user!.id}`),
    { method: 'DELETE' },
  );
  res.status(status).json(body);
});

export default router;
