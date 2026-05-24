import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as studySetsController from '../controllers/studySets.controller';
import { computeReadiness } from '../lib/readiness';
import { computeFullReadiness } from '../controllers/readiness.controller';
import { Flashcard } from '../models/Flashcard';
import { SpacedRepetition } from '../models/SpacedRepetition';
import { ReviewSession } from '../models/ReviewSession';
import { FeynmanSession } from '../models/FeynmanSession';
import { StudySet } from '../models/StudySet';

const router = Router();

const ALLOWED_COLORS = [
  '--set-violet', '--set-teal', '--set-amber', '--set-red',
  '--set-blue', '--set-green', '--set-pink', '--set-slate',
] as const;

const createSchema = z.object({
  userId: z.string().min(1),
  name:   z.string().min(1).max(100),
  color:  z.enum(ALLOWED_COLORS).default('--set-violet'),
});

const updateSchema = z.object({
  userId: z.string().min(1),
  name:   z.string().min(1).max(100).optional(),
  color:  z.enum(ALLOWED_COLORS).optional(),
});

const deadlineCreateSchema = z.object({
  userId:           z.string().min(1),
  type:             z.enum(['exam', 'quiz', 'assignment', 'custom']),
  label:            z.string().min(1).max(100),
  date:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notifyDaysBefore: z.array(z.number()).default([]),
});

const deadlineUpdateSchema = z.object({
  userId:           z.string().min(1),
  type:             z.enum(['exam', 'quiz', 'assignment', 'custom']).optional(),
  label:            z.string().min(1).max(100).optional(),
  date:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notifyDaysBefore: z.array(z.number()).optional(),
  passedAt:         z.string().optional(),
});

router.get('/', async (req: Request, res: Response) => {
  const userId = req.query.userId as string;
  if (!userId) { res.status(400).json({ error: 'userId query param required' }); return; }
  const includeArchived = req.query.includeArchived === 'true';
  try {
    res.json(await studySetsController.listStudySets(userId, includeArchived));
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  const userId = req.query.userId as string;
  if (!userId) { res.status(400).json({ error: 'userId query param required' }); return; }
  try {
    const studySet = await studySetsController.getStudySet(req.params.id, userId);
    if (!studySet) { res.status(404).json({ error: 'StudySet not found' }); return; }
    const readinessScore = await computeReadiness(studySet._id.toString(), userId);
    res.json({ ...studySet.toObject(), readinessScore });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  try {
    const { userId, ...data } = parsed.data;
    res.status(201).json(await studySetsController.createStudySet(userId, data));
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  try {
    const { userId, ...data } = parsed.data;
    const set = await studySetsController.updateStudySet(req.params.id, userId, data);
    if (!set) { res.status(404).json({ error: 'StudySet not found' }); return; }
    res.json(set);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const userId = req.query.userId as string;
  if (!userId) { res.status(400).json({ error: 'userId query param required' }); return; }
  try {
    const deleted = await studySetsController.deleteStudySet(req.params.id, userId);
    if (!deleted) { res.status(404).json({ error: 'StudySet not found' }); return; }
    res.status(204).end();
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Archive ──────────────────────────────────────────────────────────────────

router.patch('/:id/archive', async (req: Request, res: Response) => {
  const { userId, archived } = req.body as { userId?: string; archived?: boolean };
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
  if (typeof archived !== 'boolean') { res.status(400).json({ error: 'archived (boolean) required' }); return; }
  try {
    const set = await studySetsController.archiveStudySet(req.params.id, userId, archived);
    if (!set) { res.status(404).json({ error: 'StudySet not found' }); return; }
    res.json(set);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Analytics ────────────────────────────────────────────────────────────────

router.get('/:id/analytics', async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.query.userId as string;
  if (!userId) { res.status(400).json({ error: 'userId query param required' }); return; }
  try {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [totalCards, flashcardIds, readinessScore, weekSessions] = await Promise.all([
      Flashcard.countDocuments({ studySetId: id, userId }),
      Flashcard.distinct('_id', { studySetId: id, userId }),
      computeReadiness(id, userId),
      ReviewSession.find({ studySetId: id, userId, startedAt: { $gte: weekAgo } }).lean(),
    ]);

    const [agg] = await SpacedRepetition.aggregate<{ total: number; overdue: number; avgEase: number }>([
      { $match: { userId, flashcardId: { $in: flashcardIds } } },
      {
        $group: {
          _id: null,
          total:   { $sum: 1 },
          overdue: { $sum: { $cond: [{ $lt: ['$dueAt', now] }, 1, 0] } },
          avgEase: { $avg: '$easeFactor' },
        },
      },
    ]);

    const dueCards = agg?.overdue ?? 0;
    const avgEaseFactor = agg && agg.total > 0 ? agg.avgEase : 2.5;

    const avgSessionDurationMin = weekSessions.length > 0
      ? weekSessions.reduce((sum, s) => sum + s.durationMinutes, 0) / weekSessions.length
      : 0;

    // 90-day review history for charts
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const historySessions = await ReviewSession.find({
      studySetId: id,
      userId,
      startedAt: { $gte: ninetyDaysAgo },
    }).select('startedAt cardsReviewed accuracy').lean();

    const historyMap = new Map<string, { totalCards: number; totalAccuracy: number; count: number }>();
    for (const s of historySessions) {
      const dateKey = s.startedAt.toISOString().slice(0, 10);
      const existing = historyMap.get(dateKey) ?? { totalCards: 0, totalAccuracy: 0, count: 0 };
      existing.totalCards += s.cardsReviewed;
      existing.totalAccuracy += s.accuracy;
      existing.count += 1;
      historyMap.set(dateKey, existing);
    }
    const reviewHistory = Array.from(historyMap.entries()).map(([date, agg]) => ({
      date,
      retentionRate: parseFloat((agg.totalAccuracy / agg.count).toFixed(1)),
      cardsReviewed: agg.totalCards,
    })).sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      totalCards,
      dueCards,
      readinessScore,
      avgEaseFactor: parseFloat(avgEaseFactor.toFixed(2)),
      reviewSessionsThisWeek: weekSessions.length,
      avgSessionDurationMin: parseFloat(avgSessionDurationMin.toFixed(1)),
      reviewHistory,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Feynman session list ──────────────────────────────────────────────────────

router.get('/:id/feynman/sessions', async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.query.userId as string;
  if (!userId) { res.status(400).json({ error: 'userId query param required' }); return; }
  try {
    const sessions = await FeynmanSession.find({
      studySetId: id,
      userId,
      // Hide user-deleted sessions; the row is retained for recovery.
      $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json(sessions);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Deadline sub-routes ──────────────────────────────────────────────────────

router.post('/:id/deadlines', async (req: Request, res: Response) => {
  const parsed = deadlineCreateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  try {
    const { userId, ...data } = parsed.data;
    const deadline = await studySetsController.addDeadline(req.params.id, userId, data);
    if (!deadline) { res.status(404).json({ error: 'StudySet not found' }); return; }
    res.status(201).json(deadline);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.patch('/:id/deadlines/:did', async (req: Request, res: Response) => {
  const parsed = deadlineUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  try {
    const { userId, ...patch } = parsed.data;
    const deadline = await studySetsController.updateDeadline(req.params.id, userId, req.params.did, patch);
    if (!deadline) { res.status(404).json({ error: 'Deadline not found' }); return; }
    res.json(deadline);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete('/:id/deadlines/:did', async (req: Request, res: Response) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
  try {
    const deleted = await studySetsController.deleteDeadline(req.params.id, userId, req.params.did);
    if (!deleted) { res.status(404).json({ error: 'Deadline not found' }); return; }
    res.status(204).end();
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Readiness ─────────────────────────────────────────────────────────────────

router.get('/:id/readiness', async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.query.userId as string;
  if (!userId) { res.status(400).json({ error: 'userId query param required' }); return; }
  try {
    const set = await StudySet.findOne({ _id: id, userId });
    if (!set) { res.status(404).json({ error: 'StudySet not found' }); return; }
    const result = await computeFullReadiness(id, userId, set);
    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
