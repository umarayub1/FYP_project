import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { deleteAccount } from '../controllers/deleteAccount.controller';
import { StudySession } from '../models/StudySession';
import { User } from '../models/User';

const router = Router();

router.get('/:userId/study-sessions', async (req: Request, res: Response) => {
  const { userId } = req.params;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const page = Math.max(parseInt(req.query.page as string) || 1, 1);
  const skip = (page - 1) * limit;
  const filter: Record<string, unknown> = { userId };
  if (req.query.activityType) {
    filter.activityType = req.query.activityType;
  }
  try {
    const [sessions, total] = await Promise.all([
      StudySession.find(filter)
        .select('activityType studySetId startedAt date durationSeconds durationMinutes')
        .sort({ startedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      StudySession.countDocuments(filter),
    ]);
    res.json({ sessions, total, page, limit });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/:userId/study-sessions', async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { activityType, studySetId, startedAt, endedAt, durationSeconds, date } = req.body as {
    activityType?: string;
    studySetId?: string;
    startedAt?: string;
    endedAt?: string;
    durationSeconds?: number;
    date?: string;
  };
  if (!activityType || !date) {
    res.status(400).json({ error: 'activityType and date required' });
    return;
  }
  try {
    const secs = typeof durationSeconds === 'number' ? durationSeconds : 0;
    const session = await StudySession.create({
      userId:          new Types.ObjectId(userId),
      activityType,
      studySetId:      studySetId ? new Types.ObjectId(studySetId) : undefined,
      startedAt:       startedAt ? new Date(startedAt) : new Date(),
      endedAt:         endedAt ? new Date(endedAt) : undefined,
      durationSeconds: secs,
      durationMinutes: Math.round(secs / 60),
      date,
    });
    res.status(201).json(session);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/:userId/onboarding', async (req: Request, res: Response) => {
  try {
    await User.updateOne({ _id: req.params.userId }, { $set: { onboardingComplete: true } });
    res.json({ onboardingComplete: true });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.patch('/:userId/profile', async (req: Request, res: Response) => {
  try {
    const { name } = req.body as { name?: string };
    const update: Record<string, unknown> = {};
    if (name !== undefined) update.name = name;
    if (Object.keys(update).length > 0) {
      await User.updateOne({ _id: req.params.userId }, { $set: update });
    }
    res.json({ updated: true });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete('/:userId', async (req: Request, res: Response) => {
  try {
    const result = await deleteAccount(req.params.userId);
    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
