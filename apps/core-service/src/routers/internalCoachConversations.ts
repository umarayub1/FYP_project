import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { CoachConversation } from '../models/CoachConversation';

const router = Router();

// GET /internal/coach-conversations?userId=&studySetId=
router.get('/', async (req: Request, res: Response) => {
  const { userId, studySetId } = req.query as { userId?: string; studySetId?: string };
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
  if (!studySetId) { res.status(400).json({ error: 'studySetId required' }); return; }
  try {
    const convos = await CoachConversation.find({
      userId: new Types.ObjectId(userId),
      studySetId: new Types.ObjectId(studySetId),
    })
      .sort({ updatedAt: -1 })
      .limit(20)
      .select('-messages')
      .lean();
    res.json(convos);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /internal/coach-conversations
router.post('/', async (req: Request, res: Response) => {
  const { userId, title, studySetId } = req.body as {
    userId?: string;
    title?: string;
    studySetId?: string;
  };
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
  try {
    const convo = await CoachConversation.create({
      userId: new Types.ObjectId(userId),
      studySetId: studySetId ? new Types.ObjectId(studySetId) : undefined,
      title: title || 'New conversation',
      messages: [],
    });
    res.status(201).json(convo);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /internal/coach-conversations/:id?userId=
router.get('/:id', async (req: Request, res: Response) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
  try {
    const convo = await CoachConversation.findOne({
      _id: req.params.id,
      userId: new Types.ObjectId(userId),
    });
    if (!convo) { res.status(404).json({ error: 'Conversation not found' }); return; }
    res.json(convo);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /internal/coach-conversations/:id/messages
router.post('/:id/messages', async (req: Request, res: Response) => {
  const { userId, role, content, citations } = req.body as {
    userId?: string;
    role?: string;
    content?: string;
    citations?: unknown[];
  };
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
  if (role !== 'user' && role !== 'assistant') {
    res.status(400).json({ error: 'role must be user or assistant' }); return;
  }
  if (typeof content !== 'string' || !content.trim()) {
    res.status(400).json({ error: 'content required' }); return;
  }
  try {
    const convo = await CoachConversation.findOneAndUpdate(
      { _id: req.params.id, userId: new Types.ObjectId(userId) },
      { $push: { messages: { role, content, citations, createdAt: new Date(), timestamp: new Date() } } },
      { new: true },
    );
    if (!convo) { res.status(404).json({ error: 'Conversation not found' }); return; }
    res.json({ ok: true, messageCount: convo.messages.length });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /internal/coach-conversations/:id?userId=
router.delete('/:id', async (req: Request, res: Response) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
  try {
    const convo = await CoachConversation.findOneAndDelete({
      _id: req.params.id,
      userId: new Types.ObjectId(userId),
    });
    if (!convo) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
    res.status(204).end();
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
