import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as documentsController from '../controllers/documents.controller';
import { Doc } from '../models/Document';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const { userId, studySetId } = req.query as { userId?: string; studySetId?: string };
  if (!userId || !studySetId) {
    res.status(400).json({ error: 'userId and studySetId are required' });
    return;
  }
  try {
    const docs = await documentsController.listDocuments(userId, studySetId);
    res.json(docs);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const createSchema = z.object({
  userId: z.string().min(1),
  studySetId: z.string().min(1),
  title: z.string().min(1),
  type: z.enum(['pdf', 'note']),
  storageUri: z.string().optional(),
});

const statusSchema = z.object({
  ingestionStatus: z.enum(['pending', 'processing', 'ready', 'failed']),
  vectorChunkIds: z.array(z.string()).optional(),
});

const patchSchema = z.object({
  userId:     z.string().min(1),
  title:      z.string().min(1).max(300).optional(),
  studySetId: z.string().min(1).optional(),
}).refine(
  data => data.title !== undefined || data.studySetId !== undefined,
  { message: 'At least one of title/studySetId is required' },
);

router.post('/', async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors });
    return;
  }
  try {
    const doc = await documentsController.createDocument(parsed.data);
    res.status(201).json(doc);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  try {
    const updated = await documentsController.patchDocument(
      req.params.id,
      parsed.data.userId,
      { title: parsed.data.title, studySetId: parsed.data.studySetId },
    );
    if (!updated) { res.status(404).json({ error: 'Document not found' }); return; }
    res.json(updated);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/:id/reingest', async (req: Request, res: Response) => {
  const { userId } = req.body as { userId?: string };
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
  try {
    const result = await documentsController.reingestDocument(req.params.id, userId);
    if (!result) { res.status(404).json({ error: 'Document not found or missing file' }); return; }
    res.json({
      _id:             result.doc._id,
      ingestionStatus: result.doc.ingestionStatus,
      storagePath:     result.storagePath,
      studySetId:      result.doc.studySetId,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.patch('/:id/status', async (req: Request, res: Response) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors });
    return;
  }
  try {
    const doc = await documentsController.updateIngestionStatus(
      req.params.id,
      parsed.data.ingestionStatus,
      parsed.data.vectorChunkIds,
    );
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    res.json(doc);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /internal/documents/:id/checkpoints?userId=
router.get('/:id/checkpoints', async (req: Request, res: Response) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
  try {
    const doc = await Doc.findOne({ _id: req.params.id, userId }).select('checkpoints').lean();
    if (!doc) { res.status(404).json({ error: 'Document not found' }); return; }
    res.json(doc.checkpoints ?? []);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /internal/documents/:id/checkpoints
router.post('/:id/checkpoints', async (req: Request, res: Response) => {
  const { userId, page, scrollY } = req.body as {
    userId?: string;
    page?: unknown;
    scrollY?: unknown;
  };
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
  if (typeof page !== 'number') {
    res.status(400).json({ error: 'page is required and must be a number' });
    return;
  }
  try {
    const doc = await Doc.findOneAndUpdate(
      { _id: req.params.id, userId },
      { $push: { checkpoints: { page, scrollY: typeof scrollY === 'number' ? scrollY : 0, savedAt: new Date() } } },
      { new: true },
    ).select('checkpoints');
    if (!doc) { res.status(404).json({ error: 'Document not found' }); return; }
    res.json(doc.checkpoints);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /internal/documents/:id/comprehension?userId=
router.get('/:id/comprehension', async (req: Request, res: Response) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
  try {
    const doc = await Doc.findOne({ _id: req.params.id, userId }).select('comprehensionChecks').lean();
    if (!doc) { res.status(404).json({ error: 'Document not found' }); return; }
    res.json(doc.comprehensionChecks ?? []);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /internal/documents/:id/comprehension
router.post('/:id/comprehension', async (req: Request, res: Response) => {
  const {
    userId, page, question, answer, correct, expected, feedback,
  } = req.body as {
    userId?:   string;
    page?:     unknown;
    question?: unknown;
    answer?:   unknown;
    correct?:  unknown;
    expected?: unknown;
    feedback?: unknown;
  };
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
  if (typeof page !== 'number' || typeof question !== 'string' || typeof answer !== 'string') {
    res.status(400).json({ error: 'page, question, answer required' });
    return;
  }
  try {
    const entry = {
      page,
      question,
      answer,
      correct: Boolean(correct),
      expected: typeof expected === 'string' ? expected : '',
      feedback: typeof feedback === 'string' ? feedback : '',
      takenAt: new Date(),
    };
    const doc = await Doc.findOneAndUpdate(
      { _id: req.params.id, userId },
      { $push: { comprehensionChecks: entry } },
      { new: true },
    ).select('comprehensionChecks');
    if (!doc) { res.status(404).json({ error: 'Document not found' }); return; }
    res.json(entry);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  const { userId } = req.query as { userId?: string };
  try {
    const doc = await documentsController.getDocument(req.params.id, userId);
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    res.json(doc);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const bulkDeleteSchema = z.object({
  userId: z.string().min(1),
  ids:    z.array(z.string().min(1)).min(1),
});

router.post('/bulk-delete', async (req: Request, res: Response) => {
  const parsed = bulkDeleteSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  try {
    const result = await documentsController.bulkDeleteDocuments(parsed.data.ids, parsed.data.userId);
    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const bulkMoveSchema = z.object({
  userId:      z.string().min(1),
  ids:         z.array(z.string().min(1)).min(1),
  targetSetId: z.string().min(1),
});

router.post('/bulk-move', async (req: Request, res: Response) => {
  const parsed = bulkMoveSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  try {
    const moved = await documentsController.bulkMoveDocuments(parsed.data.ids, parsed.data.userId, parsed.data.targetSetId);
    res.json({ moved });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
  try {
    const deleted = await documentsController.deleteDocument(req.params.id, userId);
    if (!deleted) { res.status(404).json({ error: 'Document not found' }); return; }
    res.status(204).end();
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
