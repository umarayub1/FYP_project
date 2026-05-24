import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { proxyTo, coreUrl } from '../services/proxy.service';

const router = Router();

const updateSchema = z.object({
  studySetId:     z.string().min(1),
  title:          z.string().min(1).max(300).optional(),
  content:        z.unknown().optional(),
  isCornell:      z.boolean().optional(),
  cornellCue:     z.unknown().optional(),
  cornellSummary: z.unknown().optional(),
  cornellScore:   z.number().int().min(0).max(100).optional(),
  tags:           z.array(z.string()).optional(),
  parentNoteId:   z.string().nullable().optional(),
  stagedBlocks:   z.array(z.any()).optional(),
}).strict();

// GET /api/notes/:id?studySetId=
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  const studySetId = req.query.studySetId as string | undefined;
  if (!studySetId) { res.status(400).json({ error: 'studySetId required' }); return; }
  const { status, body } = await proxyTo(
    coreUrl(`/internal/notes/${req.params.id}?userId=${req.user!.id}&studySetId=${studySetId}`),
    { method: 'GET' },
  );
  res.status(status).json(body);
});

// GET /api/notes/:id/backlinks?studySetId=
router.get('/:id/backlinks', authMiddleware, async (req: Request, res: Response) => {
  const studySetId = req.query.studySetId as string | undefined;
  if (!studySetId) { res.status(400).json({ error: 'studySetId required' }); return; }
  const { status, body } = await proxyTo(
    coreUrl(`/internal/notes/${req.params.id}/backlinks?userId=${req.user!.id}&studySetId=${studySetId}`),
    { method: 'GET' },
  );
  res.status(status).json(body);
});

// PATCH /api/notes/:id
router.patch('/:id', authMiddleware, async (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  const { studySetId, ...patch } = parsed.data;
  const { status, body } = await proxyTo(coreUrl(`/internal/notes/${req.params.id}`), {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId: req.user!.id, studySetId, ...patch }),
  });
  res.status(status).json(body);
});

const appendSchema = z.object({
  studySetId: z.string().min(1),
  blocks:     z.array(z.any()).min(1),
});

// POST /api/notes/:id/append — append blocks to a note's content
router.post('/:id/append', authMiddleware, async (req: Request, res: Response) => {
  const parsed = appendSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  const { status, body } = await proxyTo(coreUrl(`/internal/notes/${req.params.id}/append`), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId: req.user!.id, ...parsed.data }),
  });
  res.status(status).json(body);
});

const moveSchema = z.object({
  fromStudySetId: z.string().min(1),
  toStudySetId:   z.string().min(1),
});

// POST /api/notes/:id/move
router.post('/:id/move', authMiddleware, async (req: Request, res: Response) => {
  const parsed = moveSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  const { status, body } = await proxyTo(coreUrl(`/internal/notes/${req.params.id}/move`), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId: req.user!.id, ...parsed.data }),
  });
  res.status(status).json(body);
});

const bulkDeleteNoteBodySchema = z.object({
  studySetId: z.string().min(1),
  ids:        z.array(z.string().min(1)).min(1),
});

// POST /api/notes/bulk-delete
router.post('/bulk-delete', authMiddleware, async (req: Request, res: Response) => {
  const parsed = bulkDeleteNoteBodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  const { status, body } = await proxyTo(coreUrl('/internal/notes/bulk-delete'), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId: req.user!.id, ...parsed.data }),
  });
  res.status(status).json(body);
});

const bulkMoveNoteBodySchema = z.object({
  fromStudySetId: z.string().min(1),
  toStudySetId:   z.string().min(1),
  ids:            z.array(z.string().min(1)).min(1),
});

// POST /api/notes/bulk-move
router.post('/bulk-move', authMiddleware, async (req: Request, res: Response) => {
  const parsed = bulkMoveNoteBodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  const { status, body } = await proxyTo(coreUrl('/internal/notes/bulk-move'), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId: req.user!.id, ...parsed.data }),
  });
  res.status(status).json(body);
});

// DELETE /api/notes/:id?studySetId=
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  const studySetId = req.query.studySetId as string | undefined;
  if (!studySetId) { res.status(400).json({ error: 'studySetId required' }); return; }
  const { status } = await proxyTo(
    coreUrl(`/internal/notes/${req.params.id}?userId=${req.user!.id}&studySetId=${studySetId}`),
    { method: 'DELETE' },
  );
  res.status(status).end();
});

export default router;
