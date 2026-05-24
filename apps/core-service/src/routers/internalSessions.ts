import { Router, Request, Response } from 'express';
import * as sessionsController from '../controllers/sessions.controller';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
  try {
    const sessions = await sessionsController.listSessions(userId);
    res.json(sessions);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const { userId, device, expiresAt } = req.body as { userId?: string; device?: string; expiresAt?: string };
  if (!userId || !device || !expiresAt) { res.status(400).json({ error: 'userId, device, expiresAt required' }); return; }
  try {
    const session = await sessionsController.createSession(userId, device, new Date(expiresAt));
    res.status(201).json(session);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete('/', async (req: Request, res: Response) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
  try {
    await sessionsController.deleteAllSessions(userId);
    res.status(204).end();
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete('/:sessionId', async (req: Request, res: Response) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
  try {
    await sessionsController.deleteSession(userId, req.params.sessionId);
    res.status(204).end();
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
