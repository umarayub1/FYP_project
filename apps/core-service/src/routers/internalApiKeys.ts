import { Router, Request, Response } from 'express';
import * as apiKeysController from '../controllers/apiKeys.controller';

const router = Router();

router.get('/:userId', async (req: Request, res: Response) => {
  try {
    const keys = await apiKeysController.listApiKeys(req.params.userId);
    res.json(keys);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/:userId', async (req: Request, res: Response) => {
  const { provider, key } = req.body as { provider?: string; key?: string };
  if (!provider || !['openai', 'anthropic'].includes(provider) || !key?.trim()) {
    res.status(400).json({ error: 'provider must be openai|anthropic and key must be non-empty' });
    return;
  }
  try {
    await apiKeysController.upsertApiKey(req.params.userId, provider as 'openai' | 'anthropic', key.trim());
    res.status(204).end();
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete('/:userId/:provider', async (req: Request, res: Response) => {
  const { provider } = req.params;
  if (!['openai', 'anthropic'].includes(provider)) {
    res.status(400).json({ error: 'Invalid provider' });
    return;
  }
  try {
    await apiKeysController.deleteApiKey(req.params.userId, provider as 'openai' | 'anthropic');
    res.status(204).end();
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
