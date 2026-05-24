import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { FeynmanSchedule } from '../models/FeynmanSchedule';
import { StudySet } from '../models/StudySet';

const router = Router();

type DueRow = {
  _id:          Types.ObjectId;
  topic:        string;
  studySetId:   Types.ObjectId;
  studySetName: string;
  nextReviewAt: Date;
};

async function loadDueRows(filter: Record<string, unknown>): Promise<DueRow[]> {
  const schedules = await FeynmanSchedule.find(filter)
    .sort({ nextReviewAt: 1 })
    .limit(20)
    .lean();

  const setIds = [...new Set(schedules.map(s => s.studySetId.toString()))];
  const sets = await StudySet.find({ _id: { $in: setIds } }).select('name').lean();
  const setNameMap = new Map(sets.map(s => [s._id.toString(), s.name]));

  return schedules.map(s => ({
    _id:          s._id,
    topic:        s.topic,
    studySetId:   s.studySetId,
    studySetName: setNameMap.get(s.studySetId.toString()) ?? '',
    nextReviewAt: s.nextReviewAt,
  }));
}

// GET /internal/feynman-schedules/due?userId=&studySetId=
// Per-set scoped — studySetId is REQUIRED to enforce NFR2.3 (no cross-set leak).
// For the intentional cross-set view, use /due-across-sets.
router.get('/due', async (req: Request, res: Response) => {
  const userId     = req.query.userId as string;
  const studySetId = req.query.studySetId as string | undefined;
  if (!userId)     { res.status(400).json({ error: 'userId required' });     return; }
  if (!studySetId) { res.status(400).json({ error: 'studySetId required' }); return; }

  try {
    const rows = await loadDueRows({
      userId:       new Types.ObjectId(userId),
      studySetId:   new Types.ObjectId(studySetId),
      nextReviewAt: { $lte: new Date() },
      completedAt:  null,
    });
    res.json(rows);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /internal/feynman-schedules/due-across-sets?userId=
// Explicit cross-set variant. Used by the Now Brief dashboard which is
// inherently cross-set; per-user scoping still enforced.
router.get('/due-across-sets', async (req: Request, res: Response) => {
  const userId = req.query.userId as string;
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }

  try {
    const rows = await loadDueRows({
      userId:       new Types.ObjectId(userId),
      nextReviewAt: { $lte: new Date() },
      completedAt:  null,
    });
    res.json(rows);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
