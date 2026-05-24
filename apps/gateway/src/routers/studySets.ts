import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { proxyTo, coreUrl } from '../services/proxy.service';

const router = Router();

const ALLOWED_COLORS = [
  '--set-violet', '--set-teal', '--set-amber', '--set-red',
  '--set-blue', '--set-green', '--set-pink', '--set-slate',
] as const;

const createSchema = z.object({
  name:  z.string().min(1).max(100),
  color: z.enum(ALLOWED_COLORS).default('--set-violet'),
});

const updateSchema = z.object({
  name:  z.string().min(1).max(100).optional(),
  color: z.enum(ALLOWED_COLORS).optional(),
});

const deadlineCreateSchema = z.object({
  type:             z.enum(['exam', 'quiz', 'assignment', 'custom']),
  label:            z.string().min(1).max(100),
  date:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notifyDaysBefore: z.array(z.number()).default([]),
});

const deadlineUpdateSchema = z.object({
  type:             z.enum(['exam', 'quiz', 'assignment', 'custom']).optional(),
  label:            z.string().min(1).max(100).optional(),
  date:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notifyDaysBefore: z.array(z.number()).optional(),
  passedAt:         z.string().optional(),
});

const noteCreateSchema = z.object({
  title:        z.string().max(300).default('Untitled'),
  parentNoteId: z.string().optional(),
});

// ── Study Sets CRUD ──────────────────────────────────────────────────────────

router.get('/', authMiddleware, async (req: Request, res: Response) => {
  const includeArchived = req.query.includeArchived === 'true' ? '&includeArchived=true' : '';
  const { status, body } = await proxyTo(
    coreUrl(`/internal/study-sets?userId=${req.user!.id}${includeArchived}`),
    { method: 'GET' },
  );
  res.status(status).json(body);
});

router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  const { status, body } = await proxyTo(
    coreUrl(`/internal/study-sets/${req.params.id}?userId=${req.user!.id}`),
    { method: 'GET' },
  );
  res.status(status).json(body);
});

router.post('/', authMiddleware, async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  const { status, body } = await proxyTo(coreUrl('/internal/study-sets'), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ ...parsed.data, userId: req.user!.id }),
  });
  res.status(status).json(body);
});

router.patch('/:id', authMiddleware, async (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  const { status, body } = await proxyTo(coreUrl(`/internal/study-sets/${req.params.id}`), {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ ...parsed.data, userId: req.user!.id }),
  });
  res.status(status).json(body);
});

router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  const { status } = await proxyTo(
    coreUrl(`/internal/study-sets/${req.params.id}?userId=${req.user!.id}`),
    { method: 'DELETE' },
  );
  res.status(status).end();
});

// ── Deadline sub-routes ──────────────────────────────────────────────────────

router.post('/:id/deadlines', authMiddleware, async (req: Request, res: Response) => {
  const parsed = deadlineCreateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  const { status, body } = await proxyTo(coreUrl(`/internal/study-sets/${req.params.id}/deadlines`), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId: req.user!.id, ...parsed.data }),
  });
  res.status(status).json(body);
});

router.patch('/:id/deadlines/:did', authMiddleware, async (req: Request, res: Response) => {
  const parsed = deadlineUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  const { status, body } = await proxyTo(
    coreUrl(`/internal/study-sets/${req.params.id}/deadlines/${req.params.did}`),
    {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ userId: req.user!.id, ...parsed.data }),
    },
  );
  res.status(status).json(body);
});

router.delete('/:id/deadlines/:did', authMiddleware, async (req: Request, res: Response) => {
  const { status } = await proxyTo(
    coreUrl(`/internal/study-sets/${req.params.id}/deadlines/${req.params.did}?userId=${req.user!.id}`),
    { method: 'DELETE' },
  );
  res.status(status).end();
});

// ── Archive ──────────────────────────────────────────────────────────────────

router.patch('/:id/archive', authMiddleware, async (req: Request, res: Response) => {
  const { archived } = req.body as { archived?: unknown };
  if (typeof archived !== 'boolean') {
    res.status(400).json({ error: 'archived (boolean) required' });
    return;
  }
  const { status, body } = await proxyTo(coreUrl(`/internal/study-sets/${req.params.id}/archive`), {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId: req.user!.id, archived }),
  });
  res.status(status).json(body);
});

// ── Readiness ─────────────────────────────────────────────────────────────────

router.get('/:id/readiness', authMiddleware, async (req: Request, res: Response) => {
  const { status, body } = await proxyTo(
    coreUrl(`/internal/study-sets/${req.params.id}/readiness?userId=${req.user!.id}`),
    { method: 'GET' },
  );
  res.status(status).json(body);
});

// ── Analytics ────────────────────────────────────────────────────────────────

router.get('/:id/analytics', authMiddleware, async (req: Request, res: Response) => {
  const { status, body } = await proxyTo(
    coreUrl(`/internal/study-sets/${req.params.id}/analytics?userId=${req.user!.id}`),
    { method: 'GET' },
  );
  res.status(status).json(body);
});

// ── Feynman session list ──────────────────────────────────────────────────────

router.get('/:id/feynman/sessions', authMiddleware, async (req: Request, res: Response) => {
  const { status, body } = await proxyTo(
    coreUrl(`/internal/study-sets/${req.params.id}/feynman/sessions?userId=${req.user!.id}`),
    { method: 'GET' },
  );
  res.status(status).json(body);
});

// ── Batch flashcard creation ──────────────────────────────────────────────────

router.post('/:id/flashcards/batch', authMiddleware, async (req: Request, res: Response) => {
  const { status, body } = await proxyTo(
    coreUrl(`/internal/flashcards/sets/${req.params.id}/batch`),
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ userId: req.user!.id, cards: req.body.cards }),
    },
  );
  res.status(status).json(body);
});

// ── Cornell note scoring ──────────────────────────────────────────────────────

router.post('/:id/cornell/:noteId/score', authMiddleware, async (req: Request, res: Response) => {
  const { score } = req.body as { score?: unknown };
  if (typeof score !== 'number' || score < 0 || score > 100) {
    res.status(400).json({ error: 'score must be a number between 0 and 100' });
    return;
  }
  const { status, body } = await proxyTo(
    coreUrl(`/internal/notes/${req.params.id}/cornell/${req.params.noteId}/score`),
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ userId: req.user!.id, score }),
    },
  );
  res.status(status).json(body);
});

// ── Notes sub-routes ─────────────────────────────────────────────────────────

router.get('/:setId/notes', authMiddleware, async (req: Request, res: Response) => {
  const parentNoteId = req.query.parentNoteId as string | undefined;
  const parentParam = parentNoteId !== undefined ? `&parentNoteId=${encodeURIComponent(parentNoteId)}` : '';
  const { status, body } = await proxyTo(
    coreUrl(`/internal/notes?userId=${req.user!.id}&studySetId=${req.params.setId}${parentParam}`),
    { method: 'GET' },
  );
  res.status(status).json(body);
});

router.post('/:setId/notes', authMiddleware, async (req: Request, res: Response) => {
  const parsed = noteCreateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  const { status, body } = await proxyTo(coreUrl('/internal/notes'), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId: req.user!.id, studySetId: req.params.setId, ...parsed.data }),
  });
  res.status(status).json(body);
});

export default router;
