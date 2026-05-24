import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { proxyTo, coreUrl } from '../services/proxy.service';

const router = Router();

const TYPE_ENUM = z.enum(['exam', 'quiz', 'assignment', 'custom']);

const createSchema = z.object({
  type:             TYPE_ENUM,
  label:            z.string().min(1).max(100),
  date:             z.string().min(1),
  notifyDaysBefore: z.array(z.number().int().min(0).max(365)).optional(),
  studySetId:       z.string().nullable().optional(),
}).strict();

const updateSchema = z.object({
  type:             TYPE_ENUM.optional(),
  label:            z.string().min(1).max(100).optional(),
  date:             z.string().optional(),
  notifyDaysBefore: z.array(z.number().int().min(0).max(365)).optional(),
  studySetId:       z.string().nullable().optional(),
  snoozeUntil:      z.string().nullable().optional(),
  passedAt:         z.string().nullable().optional(),
}).strict();

const snoozeSchema = z.object({
  snoozeUntil: z.string().min(1),
}).strict();

router.get('/', authMiddleware, async (req: Request, res: Response) => {
  const filter = (req.query.filter as string | undefined) ?? 'all';
  const studySetId = req.query.studySetId as string | undefined;
  const params = new URLSearchParams({ userId: req.user!.id, filter });
  if (studySetId !== undefined) params.set('studySetId', studySetId);
  const { status, body } = await proxyTo(
    coreUrl(`/internal/deadlines?${params.toString()}`),
    { method: 'GET' },
  );
  res.status(status).json(body);
});

router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  const { status, body } = await proxyTo(
    coreUrl(`/internal/deadlines/${req.params.id}?userId=${req.user!.id}`),
    { method: 'GET' },
  );
  res.status(status).json(body);
});

router.post('/', authMiddleware, async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  const { status, body } = await proxyTo(coreUrl('/internal/deadlines'), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ ...parsed.data, userId: req.user!.id }),
  });
  res.status(status).json(body);
});

router.patch('/:id', authMiddleware, async (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  const { status, body } = await proxyTo(coreUrl(`/internal/deadlines/${req.params.id}`), {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ ...parsed.data, userId: req.user!.id }),
  });
  res.status(status).json(body);
});

router.post('/:id/snooze', authMiddleware, async (req: Request, res: Response) => {
  const parsed = snoozeSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  const { status, body } = await proxyTo(coreUrl(`/internal/deadlines/${req.params.id}/snooze`), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ ...parsed.data, userId: req.user!.id }),
  });
  res.status(status).json(body);
});

router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  const { status } = await proxyTo(
    coreUrl(`/internal/deadlines/${req.params.id}?userId=${req.user!.id}`),
    { method: 'DELETE' },
  );
  res.status(status).end();
});

export default router;
