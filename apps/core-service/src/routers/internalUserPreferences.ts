import { Router, Request, Response } from 'express';
import * as prefsController from '../controllers/userPreferences.controller';

const router = Router();

router.get('/:userId', async (req: Request, res: Response) => {
  try {
    const prefs = await prefsController.getPreferences(req.params.userId);
    res.json(prefs);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.patch('/:userId', async (req: Request, res: Response) => {
  try {
    const prefs = await prefsController.upsertPreferences(req.params.userId, req.body);
    res.json(prefs);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
