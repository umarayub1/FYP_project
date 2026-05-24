import { Router, Request, Response } from 'express';
import { getWeakpoints } from '../controllers/weakpoints.controller';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const userId = req.query.userId as string;
  if (!userId) { res.status(400).json({ error: 'userId query param required' }); return; }
  try {
    const result = await getWeakpoints(userId);
    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
