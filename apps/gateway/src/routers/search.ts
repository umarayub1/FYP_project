import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { proxyTo, coreUrl } from '../services/proxy.service';

const router = Router();

// GET /api/search?q=&type=&setId=&tag=
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  const params = new URLSearchParams({ userId: req.user!.id });
  if (req.query.q)     params.set('q',     req.query.q as string);
  if (req.query.type)  params.set('type',  req.query.type as string);
  if (req.query.setId) params.set('setId', req.query.setId as string);
  if (req.query.tag)   params.set('tag',   req.query.tag as string);
  const { status, body } = await proxyTo(
    coreUrl(`/internal/search?${params.toString()}`),
    { method: 'GET' },
  );
  res.status(status).json(body);
});

export default router;
