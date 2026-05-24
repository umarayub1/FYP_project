import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import * as notesController from '../controllers/notes.controller';
import { Note } from '../models/Note';

const router = Router();

const createSchema = z.object({
  userId:       z.string().min(1),
  studySetId:   z.string().min(1),
  title:        z.string().min(1).max(300),
  parentNoteId: z.string().optional(),
});

const updateSchema = z.object({
  userId:         z.string().min(1),
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

// GET /internal/notes?userId=&studySetId=[&parentNoteId=]
router.get('/', async (req: Request, res: Response) => {
  const { userId, studySetId, parentNoteId } = req.query as {
    userId?: string; studySetId?: string; parentNoteId?: string;
  };
  if (!userId || !studySetId) {
    res.status(400).json({ error: 'userId and studySetId required' });
    return;
  }
  try {
    res.json(await notesController.listNotes(userId, studySetId, parentNoteId));
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /internal/notes/:id?userId=&studySetId=
router.get('/:id', async (req: Request, res: Response) => {
  const { userId, studySetId } = req.query as { userId?: string; studySetId?: string };
  if (!userId || !studySetId) { res.status(400).json({ error: 'userId and studySetId required' }); return; }
  try {
    const note = await notesController.getNote(req.params.id, userId, studySetId);
    if (!note) { res.status(404).json({ error: 'Note not found' }); return; }
    res.json(note);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /internal/notes/:id/backlinks?userId=&studySetId=
router.get('/:id/backlinks', async (req: Request, res: Response) => {
  const { userId, studySetId } = req.query as { userId?: string; studySetId?: string };
  if (!userId || !studySetId) { res.status(400).json({ error: 'userId and studySetId required' }); return; }
  try {
    const refs = await notesController.getBacklinks(req.params.id, userId, studySetId);
    res.json(refs);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /internal/notes
router.post('/', async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  try {
    const { userId, ...data } = parsed.data;
    res.status(201).json(await notesController.createNote(userId, data));
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PATCH /internal/notes/:id
router.patch('/:id', async (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  try {
    const { userId, studySetId, ...patch } = parsed.data;
    const note = await notesController.updateNote(req.params.id, userId, studySetId, patch);
    if (!note) { res.status(404).json({ error: 'Note not found' }); return; }
    res.json(note);
  } catch (err: unknown) {
    const e = err as Error & { code?: string };
    if (e.code === 'CYCLE') { res.status(400).json({ error: e.message }); return; }
    res.status(500).json({ error: e.message });
  }
});

// POST /internal/notes/:setId/cornell/:noteId/score
router.post('/:setId/cornell/:noteId/score', async (req: Request, res: Response) => {
  const { userId, score } = req.body as { userId?: string; score?: unknown };
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
  if (typeof score !== 'number' || score < 0 || score > 100) {
    res.status(400).json({ error: 'score must be a number between 0 and 100' });
    return;
  }
  try {
    const note = await Note.findOneAndUpdate(
      {
        _id: req.params.noteId,
        studySetId: new Types.ObjectId(req.params.setId),
        userId: new Types.ObjectId(userId),
      },
      {
        $set: { cornellScore: score },
        $push: { scoreHistory: { score, timestamp: new Date() } },
      },
      { new: true },
    );
    if (!note) { res.status(404).json({ error: 'Note not found' }); return; }
    res.json(note);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const appendSchema = z.object({
  userId:     z.string().min(1),
  studySetId: z.string().min(1),
  blocks:     z.array(z.any()).min(1),
});

// POST /internal/notes/:id/append — append blocks to a note's content
router.post('/:id/append', async (req: Request, res: Response) => {
  const parsed = appendSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  try {
    const { userId, studySetId, blocks } = parsed.data;
    const updated = await notesController.appendBlocks(req.params.id, userId, studySetId, blocks);
    if (!updated) { res.status(404).json({ error: 'Note not found' }); return; }
    res.json(updated);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const moveSchema = z.object({
  userId:         z.string().min(1),
  fromStudySetId: z.string().min(1),
  toStudySetId:   z.string().min(1),
});

// POST /internal/notes/:id/move — move a note from one StudySet to another
router.post('/:id/move', async (req: Request, res: Response) => {
  const parsed = moveSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  if (parsed.data.fromStudySetId === parsed.data.toStudySetId) {
    res.status(400).json({ error: 'Source and target StudySets must differ' });
    return;
  }
  try {
    const moved = await notesController.moveNoteToSet(
      req.params.id,
      parsed.data.userId,
      parsed.data.fromStudySetId,
      parsed.data.toStudySetId,
    );
    if (!moved) { res.status(404).json({ error: 'Note not found' }); return; }
    res.json(moved);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const bulkDeleteNoteSchema = z.object({
  userId:     z.string().min(1),
  studySetId: z.string().min(1),
  ids:        z.array(z.string().min(1)).min(1),
});

// POST /internal/notes/bulk-delete
router.post('/bulk-delete', async (req: Request, res: Response) => {
  const parsed = bulkDeleteNoteSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  try {
    const deleted = await notesController.bulkDeleteNotes(parsed.data.ids, parsed.data.userId, parsed.data.studySetId);
    res.json({ deleted });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const bulkMoveNoteSchema = z.object({
  userId:         z.string().min(1),
  fromStudySetId: z.string().min(1),
  toStudySetId:   z.string().min(1),
  ids:            z.array(z.string().min(1)).min(1),
});

// POST /internal/notes/bulk-move
router.post('/bulk-move', async (req: Request, res: Response) => {
  const parsed = bulkMoveNoteSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  if (parsed.data.fromStudySetId === parsed.data.toStudySetId) {
    res.status(400).json({ error: 'Source and target StudySets must differ' });
    return;
  }
  try {
    const moved = await notesController.bulkMoveNotes(
      parsed.data.ids, parsed.data.userId, parsed.data.fromStudySetId, parsed.data.toStudySetId,
    );
    res.json({ moved });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /internal/notes/:id?userId=&studySetId=
router.delete('/:id', async (req: Request, res: Response) => {
  const { userId, studySetId } = req.query as { userId?: string; studySetId?: string };
  if (!userId || !studySetId) { res.status(400).json({ error: 'userId and studySetId required' }); return; }
  try {
    const deleted = await notesController.deleteNote(req.params.id, userId, studySetId);
    if (!deleted) { res.status(404).json({ error: 'Note not found' }); return; }
    res.status(204).end();
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
