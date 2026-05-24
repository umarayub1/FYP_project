import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { proxyTo, coreUrl } from '../services/proxy.service';

const router = Router();

router.get('/', authMiddleware, async (req: Request, res: Response) => {
  const { status, body } = await proxyTo(
    coreUrl(`/internal/weakpoints?userId=${req.user!.id}`),
    { method: 'GET' },
  );
  res.status(status).json(body);
});

export default router;
