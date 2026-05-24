import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { FeynmanSession } from '../models/FeynmanSession';
import { FeynmanSchedule } from '../models/FeynmanSchedule';

const router = Router();

const createSchema = z.object({
  userId:     z.string().min(1),
  studySetId: z.string().min(1),
  topic:      z.string().min(1).max(500),
  documentId: z.string().min(1).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
});

const patchSchema = z.object({
  userId:        z.string().min(1),
  // Live evaluates send the in-progress explanation so resume restores it.
  // Cap at 100KB so a runaway client can't blow up the doc.
  explanation:   z.string().max(100_000).optional(),
  clarityScore:  z.number().min(0).max(100).optional(),
  accuracyScore: z.number().min(0).max(100).optional(),
  coverage:      z.array(z.object({
    id:     z.string(),
    label:  z.string(),
    status: z.enum(['covered', 'partial', 'missing']),
  })).optional(),
  status: z.enum(['active', 'paused', 'complete']).optional(),
});

// POST /internal/feynman-sessions — create a new active session at /start time
router.post('/', async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  const { userId, studySetId, topic, documentId, difficulty } = parsed.data;
  try {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(studySetId)) {
      res.status(400).json({ error: 'userId and studySetId must be ObjectIds' });
      return;
    }
    const session = await FeynmanSession.create({
      userId:        new Types.ObjectId(userId),
      studySetId:    new Types.ObjectId(studySetId),
      topic,
      status:        'active',
      difficulty,
      clarityScore:  0,
      accuracyScore: 0,
      explanation:   '',
      coverage:      [],
      ...(documentId ? { documentId } : {}),
    });
    res.status(201).json({
      _id:        session._id.toString(),
      topic:      session.topic,
      studySetId: session.studySetId.toString(),
      status:     session.status,
      createdAt:  session.createdAt,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /internal/feynman-sessions/:id — used by gateway to clean up orphans
// when ai-engine fails immediately after the row is created.
router.delete('/:id', async (req: Request, res: Response) => {
  const userId = (req.body?.userId ?? req.query?.userId) as string | undefined;
  if (!userId || !Types.ObjectId.isValid(userId)) {
    res.status(400).json({ error: 'userId required' });
    return;
  }
  try {
    const result = await FeynmanSession.deleteOne({
      _id: req.params.id,
      userId: new Types.ObjectId(userId),
    });
    if (result.deletedCount === 0) { res.status(404).json({ error: 'Session not found' }); return; }
    res.status(204).end();
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /internal/feynman-sessions/:id?userId=...
router.get('/:id', async (req: Request, res: Response) => {
  const userId = req.query.userId as string | undefined;
  if (!userId || !Types.ObjectId.isValid(userId)) {
    res.status(400).json({ error: 'userId required' });
    return;
  }
  try {
    const session = await FeynmanSession.findOne({
      _id: req.params.id,
      userId: new Types.ObjectId(userId),
      // Soft-deleted sessions are gone as far as the user is concerned;
      // hitting Resume on a deleted row should 404, not silently work.
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
    }).lean();
    if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
    res.json(session);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /internal/feynman-sessions/:id/soft-delete — user-facing delete.
// Distinct from the hard DELETE above, which is reserved for orphan cleanup
// (when ai-engine fails immediately after the row is created).
router.post('/:id/soft-delete', async (req: Request, res: Response) => {
  const userId = (req.body?.userId ?? req.query?.userId) as string | undefined;
  if (!userId || !Types.ObjectId.isValid(userId)) {
    res.status(400).json({ error: 'userId required' });
    return;
  }
  try {
    const result = await FeynmanSession.updateOne(
      {
        _id: req.params.id,
        userId: new Types.ObjectId(userId),
        // Idempotent: a second delete on an already-deleted row is a 404,
        // matching how the user thinks about it ("that row is gone").
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
      },
      { $set: { deletedAt: new Date() } },
    );
    if (result.matchedCount === 0) { res.status(404).json({ error: 'Session not found' }); return; }
    res.status(204).end();
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PATCH /internal/feynman-sessions/:id
router.patch('/:id', async (req: Request, res: Response) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  const { userId, ...patch } = parsed.data;
  try {
    const session = await FeynmanSession.findOneAndUpdate(
      { _id: req.params.id, userId: new Types.ObjectId(userId) },
      { $set: patch },
      { new: true },
    );
    if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
    res.json(session);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /internal/feynman-sessions/:id/schedule
router.post('/:id/schedule', async (req: Request, res: Response) => {
  const { userId, interval, easeFactor } = req.body as {
    userId?: string;
    interval?: unknown;
    easeFactor?: unknown;
  };
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
  if (typeof interval !== 'number' || interval < 1 || interval > 365) {
    res.status(400).json({ error: 'interval must be a number between 1 and 365 days' });
    return;
  }
  try {
    const session = await FeynmanSession.findOne({
      _id: req.params.id,
      userId: new Types.ObjectId(userId),
    });
    if (!session) { res.status(404).json({ error: 'Session not found' }); return; }

    const nextReviewAt = new Date(Date.now() + interval * 24 * 60 * 60 * 1000);

    const schedule = await FeynmanSchedule.findOneAndUpdate(
      { feynmanSessionId: session._id, userId: new Types.ObjectId(userId) },
      {
        $set: {
          userId: new Types.ObjectId(userId),
          studySetId: session.studySetId,
          feynmanSessionId: session._id,
          topic: session.topic,
          scheduledFor: nextReviewAt,
          interval,
          easeFactor: typeof easeFactor === 'number' ? easeFactor : 2.5,
          nextReviewAt,
        },
        $inc: { repetitions: 1 },
      },
      { upsert: true, new: true },
    );

    await FeynmanSession.updateOne(
      { _id: session._id },
      { $set: { scheduledReviewAt: nextReviewAt } },
    );

    res.json({ nextReviewAt, scheduleId: schedule._id });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
