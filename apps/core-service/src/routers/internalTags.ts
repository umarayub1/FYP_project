import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as tagsController from '../controllers/tags.controller';

const router = Router();

const createSchema = z.object({
  userId: z.string().min(1),
  name:   z.string().min(1).max(50),
  color:  z.string().optional(),
});

const updateSchema = z.object({
  userId: z.string().min(1),
  name:   z.string().min(1).max(50).optional(),
  color:  z.string().optional(),
});

const mergeSchema = z.object({
  userId:   z.string().min(1),
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
});

// GET /internal/tags?userId=&slug=
router.get('/', async (req: Request, res: Response) => {
  const { userId, slug } = req.query as { userId?: string; slug?: string };
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
  try {
    if (slug) {
      const tag = await tagsController.getTagBySlug(userId, slug);
      res.json(tag ? [tag] : []);
    } else {
      res.json(await tagsController.listTags(userId));
    }
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /internal/tags/:id/items?userId=
router.get('/:id/items', async (req: Request, res: Response) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
  try {
    const items = await tagsController.getTagItems(req.params.id, userId);
    if (!items) { res.status(404).json({ error: 'Tag not found' }); return; }
    res.json(items);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /internal/tags
router.post('/', async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  try {
    const { userId, ...data } = parsed.data;
    res.status(201).json(await tagsController.createTag(userId, data));
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /internal/tags/merge
router.post('/merge', async (req: Request, res: Response) => {
  const parsed = mergeSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  try {
    await tagsController.mergeTags(parsed.data.userId, parsed.data.sourceId, parsed.data.targetId);
    res.status(204).end();
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PATCH /internal/tags/:id
router.patch('/:id', async (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  try {
    const { userId, ...patch } = parsed.data;
    const tag = await tagsController.updateTag(req.params.id, userId, patch);
    if (!tag) { res.status(404).json({ error: 'Tag not found' }); return; }
    res.json(tag);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PATCH /internal/tags/:id/promote
router.patch('/:id/promote', async (req: Request, res: Response) => {
  const { userId } = req.body as { userId?: string };
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
  try {
    const tag = await tagsController.promoteTag(req.params.id, userId);
    if (!tag) { res.status(404).json({ error: 'Tag not found' }); return; }
    res.json(tag);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /internal/tags/:id?userId=
router.delete('/:id', async (req: Request, res: Response) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
  try {
    const deleted = await tagsController.deleteTag(req.params.id, userId);
    if (!deleted) { res.status(404).json({ error: 'Tag not found' }); return; }
    res.status(204).end();
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
