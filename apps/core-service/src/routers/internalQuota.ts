import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as quotaController from '../controllers/quota.controller';

const router = Router();

const incrementSchema = z.object({
  type: z.enum(['pdfsIngested', 'feynmanSessions', 'tokensUsed']),
  amount: z.number().int().min(1).default(1),
});

router.get('/:userId', async (req: Request, res: Response) => {
  try {
    const quota = await quotaController.getQuota(req.params.userId);
    res.json(quota);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/:userId/check', async (req: Request, res: Response) => {
  const { type } = req.query as { type?: string };
  if (!type || !['pdfsIngested', 'feynmanSessions', 'tokensUsed'].includes(type)) {
    res.status(400).json({ error: 'type must be pdfsIngested | feynmanSessions | tokensUsed' });
    return;
  }
  try {
    const result = await quotaController.checkQuota(
      req.params.userId,
      type as 'pdfsIngested' | 'feynmanSessions' | 'tokensUsed',
    );
    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/:userId/increment', async (req: Request, res: Response) => {
  const parsed = incrementSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors });
    return;
  }
  try {
    await quotaController.incrementQuota(req.params.userId, parsed.data.type, parsed.data.amount);
    res.status(204).end();
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
