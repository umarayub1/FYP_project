import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as deadlinesController from '../controllers/deadlines.controller';

const router = Router();

const ALLOWED_FILTERS = ['all', 'today', 'week', 'critical', 'upcoming', 'passed'] as const;
const TYPE_ENUM = z.enum(['exam', 'quiz', 'assignment', 'custom']);

const createSchema = z.object({
  userId:           z.string().min(1),
  type:             TYPE_ENUM,
  label:            z.string().min(1).max(100),
  date:             z.string().min(1),
  notifyDaysBefore: z.array(z.number().int().min(0).max(365)).optional(),
  studySetId:       z.string().nullable().optional(),
}).strict();

const updateSchema = z.object({
  userId:           z.string().min(1),
  type:             TYPE_ENUM.optional(),
  label:            z.string().min(1).max(100).optional(),
  date:             z.string().optional(),
  notifyDaysBefore: z.array(z.number().int().min(0).max(365)).optional(),
  studySetId:       z.string().nullable().optional(),
  snoozeUntil:      z.string().nullable().optional(),
  passedAt:         z.string().nullable().optional(),
}).strict();

const snoozeSchema = z.object({
  userId:      z.string().min(1),
  snoozeUntil: z.string().min(1),
}).strict();

router.get('/', async (req: Request, res: Response) => {
  const userId = req.query.userId as string;
  if (!userId) { res.status(400).json({ error: 'userId query param required' }); return; }
  const filter = (req.query.filter as string | undefined) ?? 'all';
  if (!ALLOWED_FILTERS.includes(filter as typeof ALLOWED_FILTERS[number])) {
    res.status(400).json({ error: `filter must be one of ${ALLOWED_FILTERS.join(', ')}` });
    return;
  }
  const ssQuery = req.query.studySetId as string | undefined;
  let studySetIdArg: string | null | undefined;
  if (ssQuery === 'null') studySetIdArg = null;
  else if (ssQuery) studySetIdArg = ssQuery;
  try {
    const items = await deadlinesController.listDeadlines(userId, {
      filter:     filter as deadlinesController.ListFilter,
      studySetId: studySetIdArg,
    });
    res.json(items);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  const userId = req.query.userId as string;
  if (!userId) { res.status(400).json({ error: 'userId query param required' }); return; }
  try {
    const d = await deadlinesController.getDeadline(req.params.id, userId);
    if (!d) { res.status(404).json({ error: 'Deadline not found' }); return; }
    res.json(d);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  try {
    const { userId, ...data } = parsed.data;
    const created = await deadlinesController.createDeadline(userId, data);
    res.status(201).json(created);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  try {
    const { userId, ...patch } = parsed.data;
    const updated = await deadlinesController.updateDeadline(req.params.id, userId, patch);
    if (!updated) { res.status(404).json({ error: 'Deadline not found' }); return; }
    res.json(updated);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/:id/snooze', async (req: Request, res: Response) => {
  const parsed = snoozeSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  try {
    const updated = await deadlinesController.snoozeDeadline(
      req.params.id,
      parsed.data.userId,
      new Date(parsed.data.snoozeUntil),
    );
    if (!updated) { res.status(404).json({ error: 'Deadline not found' }); return; }
    res.json(updated);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const userId = req.query.userId as string;
  if (!userId) { res.status(400).json({ error: 'userId query param required' }); return; }
  try {
    const deleted = await deadlinesController.deleteDeadline(req.params.id, userId);
    if (!deleted) { res.status(404).json({ error: 'Deadline not found' }); return; }
    res.status(204).end();
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
