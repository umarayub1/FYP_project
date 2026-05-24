import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { proxyTo, coreUrl } from '../services/proxy.service';

const router = Router();

const scheduleSchema = z.object({
  interval:   z.number().int().min(1).max(365),
  easeFactor: z.number().optional(),
});

// GET /api/feynman/due
// - With ?studySetId=… → per-set scoped (NFR2.3)
// - Without studySetId  → cross-set (intentional, e.g. Now Brief)
router.get('/due', authMiddleware, async (req: Request, res: Response) => {
  const { studySetId } = req.query as { studySetId?: string };
  const url = studySetId
    ? coreUrl(`/internal/feynman-schedules/due?userId=${req.user!.id}&studySetId=${studySetId}`)
    : coreUrl(`/internal/feynman-schedules/due-across-sets?userId=${req.user!.id}`);
  const { status, body } = await proxyTo(url, { method: 'GET' });
  res.status(status).json(body);
});

// GET /api/feynman/:id — fetch a single session (for resume + evaluate lookup)
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  const { status, body } = await proxyTo(
    coreUrl(`/internal/feynman-sessions/${req.params.id}?userId=${req.user!.id}`),
    { method: 'GET' },
  );
  res.status(status).json(body);
});

// DELETE /api/feynman/:id — user-facing soft delete from the dashboard.
// Hits the soft-delete endpoint on core; the row stays in Mongo with a
// deletedAt timestamp so we can recover if needed.
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  const { status, body } = await proxyTo(
    coreUrl(`/internal/feynman-sessions/${req.params.id}/soft-delete`),
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ userId: req.user!.id }),
    },
  );
  // 204 has no body — proxyTo returns an empty object, send the bare status.
  if (status === 204) { res.status(204).end(); return; }
  res.status(status).json(body);
});

// POST /api/feynman/sessions/:id/schedule
router.post('/sessions/:id/schedule', authMiddleware, async (req: Request, res: Response) => {
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  const { status, body } = await proxyTo(
    coreUrl(`/internal/feynman-sessions/${req.params.id}/schedule`),
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ userId: req.user!.id, ...parsed.data }),
    },
  );
  res.status(status).json(body);
});

export default router;
