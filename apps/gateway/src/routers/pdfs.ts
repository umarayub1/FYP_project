import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { proxyTo, coreUrl, aiEngineUrl } from '../services/proxy.service';
import { getPrefsFromCache } from '../services/prefsCache';

const router = Router();

const checkpointSchema = z.object({
  page:    z.number().int().min(0),
  scrollY: z.number().optional(),
});

const comprehensionQuestionSchema = z.object({
  page: z.number().int().min(1),
});

const comprehensionAnswerSchema = z.object({
  page:     z.number().int().min(1),
  question: z.string().min(1),
  expected: z.string().default(''),
  answer:   z.string().min(1),
});

// GET /api/pdfs/:id/checkpoints
router.get('/:id/checkpoints', authMiddleware, async (req: Request, res: Response) => {
  const { status, body } = await proxyTo(
    coreUrl(`/internal/documents/${req.params.id}/checkpoints?userId=${req.user!.id}`),
    { method: 'GET' },
  );
  res.status(status).json(body);
});

// POST /api/pdfs/:id/checkpoints
router.post('/:id/checkpoints', authMiddleware, async (req: Request, res: Response) => {
  const parsed = checkpointSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  const { status, body } = await proxyTo(
    coreUrl(`/internal/documents/${req.params.id}/checkpoints`),
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ userId: req.user!.id, ...parsed.data }),
    },
  );
  res.status(status).json(body);
});

// GET /api/pdfs/:id/comprehension — list completed checks for this user/doc
router.get('/:id/comprehension', authMiddleware, async (req: Request, res: Response) => {
  const { status, body } = await proxyTo(
    coreUrl(`/internal/documents/${req.params.id}/comprehension?userId=${req.user!.id}`),
    { method: 'GET' },
  );
  res.status(status).json(body);
});

// POST /api/pdfs/:id/comprehension/question — generate the next question
router.post('/:id/comprehension/question', authMiddleware, async (req: Request, res: Response) => {
  const parsed = comprehensionQuestionSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  const prefs = await getPrefsFromCache(req.user!.id);
  let aiRes: globalThis.Response;
  try {
    aiRes = await fetch(aiEngineUrl('/api/ai/comprehension/question'), {
      method:  'POST',
      headers: {
        'Content-Type':   'application/json',
        'x-llm-provider': prefs.llmProvider || process.env.LLM_PROVIDER || 'external',
        'x-llm-model':    prefs.llmModel    || process.env.LLM_MODEL    || 'gpt-4o-mini',
      },
      body: JSON.stringify({
        userId:     req.user!.id,
        documentId: req.params.id,
        page:       parsed.data.page,
      }),
    });
  } catch {
    res.status(502).json({ error: 'AI Engine unavailable' });
    return;
  }
  const body = await aiRes.json();
  res.status(aiRes.status).json(body);
});

// POST /api/pdfs/:id/comprehension/answer — score + persist
router.post('/:id/comprehension/answer', authMiddleware, async (req: Request, res: Response) => {
  const parsed = comprehensionAnswerSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  const prefs = await getPrefsFromCache(req.user!.id);

  // 1) Score via ai-engine
  let aiRes: globalThis.Response;
  try {
    aiRes = await fetch(aiEngineUrl('/api/ai/comprehension/score'), {
      method:  'POST',
      headers: {
        'Content-Type':   'application/json',
        'x-llm-provider': prefs.llmProvider || process.env.LLM_PROVIDER || 'external',
        'x-llm-model':    prefs.llmModel    || process.env.LLM_MODEL    || 'gpt-4o-mini',
      },
      body: JSON.stringify({
        question: parsed.data.question,
        expected: parsed.data.expected,
        answer:   parsed.data.answer,
      }),
    });
  } catch {
    res.status(502).json({ error: 'AI Engine unavailable' });
    return;
  }

  if (!aiRes.ok) {
    res.status(aiRes.status).json(await aiRes.json().catch(() => ({})));
    return;
  }

  const scored = await aiRes.json() as { correct: boolean; feedback: string; expected: string };

  // 2) Persist to core-service
  const persistRes = await proxyTo(
    coreUrl(`/internal/documents/${req.params.id}/comprehension`),
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        userId:   req.user!.id,
        page:     parsed.data.page,
        question: parsed.data.question,
        answer:   parsed.data.answer,
        correct:  scored.correct,
        expected: scored.expected,
        feedback: scored.feedback,
      }),
    },
  );

  if (persistRes.status >= 400) {
    res.status(persistRes.status).json(persistRes.body);
    return;
  }

  res.status(200).json({ ...scored, page: parsed.data.page });
});

export default router;
