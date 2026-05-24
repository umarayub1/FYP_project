import { Router, Request, Response } from 'express';
import { getNowBrief } from '../controllers/nowBrief.controller';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const { userId } = req.query as { userId?: string };
  if (!userId) {
    res.status(400).json({ error: 'userId required' });
    return;
  }
  try {
    const items = await getNowBrief(userId);
    res.json({
      items,
      totalDue: items.reduce((sum, i) => sum + i.dueCount, 0),
      generatedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
