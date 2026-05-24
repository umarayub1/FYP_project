import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { Note } from '../models/Note';
import { Flashcard } from '../models/Flashcard';
import { Doc } from '../models/Document';
import { StudySet } from '../models/StudySet';

const router = Router();

// GET /internal/search?userId=&q=&type=&setId=&tag=
router.get('/', async (req: Request, res: Response) => {
  const { userId, q, type, setId } = req.query as {
    userId?: string; q?: string; type?: string; setId?: string;
  };
  if (!userId || !q?.trim()) {
    res.status(400).json({ error: 'userId and q required' });
    return;
  }

  try {
    const uid  = new Types.ObjectId(userId);
    const term = q.trim();
    const re   = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    // Load study sets for name lookup
    const sets = await StudySet.find({ userId: uid }).select('name').lean();
    const setMap = new Map(sets.map(s => [(s._id as Types.ObjectId).toString(), s.name]));

    const filter: Record<string, unknown> = { userId: uid };
    if (setId) filter.studySetId = new Types.ObjectId(setId);

    const results: unknown[] = [];

    // Notes
    if (!type || type === 'note') {
      const notes = await Note.find({ ...filter, $or: [{ title: re }] })
        .limit(20).lean();
      for (const n of notes) {
        const sid = (n.studySetId as Types.ObjectId).toString();
        results.push({
          id:           (n._id as Types.ObjectId).toString(),
          type:         'note',
          title:        n.title,
          studySetId:   sid,
          studySetName: setMap.get(sid) ?? '',
          excerpt:      n.title.slice(0, 160),
          matchRanges:  [],
        });
      }
    }

    // Flashcards
    if (!type || type === 'flashcard') {
      const cards = await Flashcard.find({ ...filter, $or: [{ front: re }, { back: re }] })
        .limit(20).lean();
      for (const c of cards) {
        const sid  = (c.studySetId as Types.ObjectId).toString();
        const text = c.front.slice(0, 160);
        const idx  = text.toLowerCase().indexOf(term.toLowerCase());
        results.push({
          id:           (c._id as Types.ObjectId).toString(),
          type:         'flashcard',
          title:        c.front.slice(0, 80),
          studySetId:   sid,
          studySetName: setMap.get(sid) ?? '',
          excerpt:      text,
          matchRanges:  idx >= 0 ? [{ start: idx, end: idx + term.length }] : [],
        });
      }
    }

    // PDFs / documents
    if (!type || type === 'pdf') {
      const docs = await Doc.find({ ...filter, title: re }).limit(20).lean();
      for (const d of docs) {
        const sid = (d.studySetId as Types.ObjectId).toString();
        results.push({
          id:           (d._id as Types.ObjectId).toString(),
          type:         'pdf',
          title:        d.title,
          studySetId:   sid,
          studySetName: setMap.get(sid) ?? '',
          excerpt:      d.title,
          matchRanges:  [],
        });
      }
    }

    res.json(results);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
