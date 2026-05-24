import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { Flashcard } from '../models/Flashcard';
import { SpacedRepetition } from '../models/SpacedRepetition';
import * as flashcardsController from '../controllers/flashcards.controller';

const router = Router();

const createSchema = z.object({
  userId:           z.string().min(1),
  studySetId:       z.string().min(1),
  cardType:         z.enum(['basic', 'bidirectional', 'cloze']).optional(),
  front:            z.string().optional(),
  back:             z.string().optional(),
  clozeBody:        z.string().optional(),
  bidirectional:    z.boolean().optional(),
  tags:             z.array(z.string()).optional(),
  sourceDocumentId: z.string().optional(),
  sourceTitle:      z.string().optional(),
  sourcePage:       z.number().optional(),
});

const updateSchema = z.object({
  userId:       z.string().min(1),
  studySetId:   z.string().min(1),
  cardType:     z.enum(['basic', 'bidirectional', 'cloze']).optional(),
  front:        z.string().optional(),
  back:         z.string().optional(),
  clozeBody:    z.string().optional(),
  bidirectional: z.boolean().optional(),
  tags:         z.array(z.string()).optional(),
  sourceTitle:  z.string().optional(),
  sourcePage:   z.number().optional(),
});

const reviewSchema = z.object({
  userId:     z.string().min(1),
  studySetId: z.string().min(1),
  quality:    z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  isCram:     z.boolean().optional(),
});

const bulkImportSchema = z.object({
  userId:     z.string().min(1),
  studySetId: z.string().min(1),
  rows: z.array(z.object({
    front:     z.string(),
    back:      z.string(),
    tags:      z.string().optional(),
    cardType:  z.enum(['basic', 'bidirectional', 'cloze']).optional(),
    clozeBody: z.string().optional(),
  })),
});

router.get('/leech-count', async (req: Request, res: Response) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
  try {
    const count = await flashcardsController.getLeechCount(userId);
    res.json({ count });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/sets/:setId/batch', async (req: Request, res: Response) => {
  const { cards, userId } = req.body as { cards?: unknown; userId?: string };
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
  if (!Array.isArray(cards) || cards.length === 0) {
    res.status(400).json({ error: 'cards must be a non-empty array' }); return;
  }
  if (cards.length > 200) {
    res.status(400).json({ error: 'Maximum 200 cards per batch' }); return;
  }

  const errors: string[] = [];
  const validCards: object[] = [];

  (cards as Record<string, unknown>[]).forEach((card, i) => {
    if (!card.front || typeof card.front !== 'string') {
      errors.push(`Card ${i + 1}: missing or invalid "front" field`);
    } else if (!card.back || typeof card.back !== 'string') {
      errors.push(`Card ${i + 1}: missing or invalid "back" field`);
    } else {
      const cardType = typeof card.cardType === 'string'
        && ['basic', 'bidirectional', 'cloze'].includes(card.cardType)
        ? card.cardType
        : 'basic';
      validCards.push({
        userId,
        studySetId: req.params.setId,
        front: (card.front as string).trim(),
        back:  (card.back as string).trim(),
        cardType,
        tags:  Array.isArray(card.tags) ? card.tags : [],
      });
    }
  });

  try {
    let created = 0;
    if (validCards.length > 0) {
      const result = await Flashcard.insertMany(validCards, { ordered: false });
      created = result.length;
    }
    res.status(errors.length > 0 && created === 0 ? 400 : 201).json({ created, errors });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/queue', async (req: Request, res: Response) => {
  const { userId, studySetId, cram } = req.query as { userId?: string; studySetId?: string; cram?: string };
  if (!userId || !studySetId) {
    res.status(400).json({ error: 'userId and studySetId are required' });
    return;
  }
  try {
    if (cram === 'true') {
      return res.json(await flashcardsController.getCramCards(userId, studySetId));
    }
    // Normal queue: unsuspended cards whose dueAt <= now
    const cardIds = await Flashcard.distinct('_id', { studySetId, userId, suspended: { $ne: true } });
    const dueRecords = await SpacedRepetition.find({
      userId,
      dueAt: { $lte: new Date() },
      flashcardId: { $in: cardIds },
    }).select('flashcardId').lean();
    const dueIds = dueRecords.map((r) => new Types.ObjectId(r.flashcardId.toString()));
    const cards = await Flashcard.find({ _id: { $in: dueIds }, userId, suspended: { $ne: true } }).lean();
    res.json(cards.sort(() => Math.random() - 0.5));
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/', async (req: Request, res: Response) => {
  const { userId, studySetId } = req.query as { userId?: string; studySetId?: string };
  if (!userId || !studySetId) {
    res.status(400).json({ error: 'userId and studySetId are required' });
    return;
  }
  try {
    res.json(await flashcardsController.listFlashcards(userId, studySetId));
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/bulk-import', async (req: Request, res: Response) => {
  const parsed = bulkImportSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  try {
    res.json(await flashcardsController.bulkImportFlashcards(
      parsed.data.userId, parsed.data.studySetId, parsed.data.rows,
    ));
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  try {
    const { userId, ...data } = parsed.data;
    res.status(201).json(await flashcardsController.createFlashcard(userId, data));
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  try {
    const { userId, studySetId, ...patch } = parsed.data;
    const card = await flashcardsController.updateFlashcard(req.params.id, userId, studySetId, patch);
    if (!card) { res.status(404).json({ error: 'Flashcard not found' }); return; }
    res.json(card);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.patch('/:id/suspend', async (req: Request, res: Response) => {
  const { userId, studySetId } = req.body as { userId?: string; studySetId?: string };
  if (!userId || !studySetId) { res.status(400).json({ error: 'userId and studySetId required' }); return; }
  try {
    const ok = await flashcardsController.suspendFlashcard(req.params.id, userId, studySetId);
    if (!ok) { res.status(404).json({ error: 'Flashcard not found' }); return; }
    res.status(204).end();
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/:id/review', async (req: Request, res: Response) => {
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  try {
    res.json(await flashcardsController.reviewFlashcard(
      req.params.id, parsed.data.userId, parsed.data.studySetId, parsed.data.quality, parsed.data.isCram ?? false,
    ));
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    res.status(status === 404 ? 404 : 500).json({ error: (err as Error).message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const { userId, studySetId } = req.query as { userId?: string; studySetId?: string };
  if (!userId || !studySetId) { res.status(400).json({ error: 'userId and studySetId are required' }); return; }
  try {
    const deleted = await flashcardsController.deleteFlashcard(req.params.id, userId, studySetId);
    if (!deleted) { res.status(404).json({ error: 'Flashcard not found' }); return; }
    res.status(204).end();
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const bulkDeleteCardSchema = z.object({
  userId:     z.string().min(1),
  studySetId: z.string().min(1),
  ids:        z.array(z.string().min(1)).min(1),
});

router.post('/bulk-delete', async (req: Request, res: Response) => {
  const parsed = bulkDeleteCardSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  try {
    const deleted = await flashcardsController.bulkDeleteFlashcards(parsed.data.ids, parsed.data.userId, parsed.data.studySetId);
    res.json({ deleted });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const bulkTagSchema = z.object({
  userId:     z.string().min(1),
  studySetId: z.string().min(1),
  ids:        z.array(z.string().min(1)).min(1),
  tags:       z.array(z.string().min(1)).min(1),
  mode:       z.enum(['add', 'remove']),
});

router.post('/bulk-tag', async (req: Request, res: Response) => {
  const parsed = bulkTagSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  try {
    const modified = await flashcardsController.bulkTagFlashcards(
      parsed.data.ids, parsed.data.userId, parsed.data.studySetId, parsed.data.tags, parsed.data.mode,
    );
    res.json({ modified });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const bulkMoveCardSchema = z.object({
  userId:         z.string().min(1),
  fromStudySetId: z.string().min(1),
  toStudySetId:   z.string().min(1),
  ids:            z.array(z.string().min(1)).min(1),
});

router.post('/bulk-move', async (req: Request, res: Response) => {
  const parsed = bulkMoveCardSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  try {
    const moved = await flashcardsController.bulkMoveFlashcards(
      parsed.data.ids, parsed.data.userId, parsed.data.fromStudySetId, parsed.data.toStudySetId,
    );
    res.json({ moved });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
