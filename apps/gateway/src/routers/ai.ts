import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { quotaCheck, incrementQuota } from '../middleware/quota';
import { aiEngineUrl, coreUrl, proxyTo } from '../services/proxy.service';
import { getPrefsFromCache } from '../services/prefsCache';

const router = Router();

const chatSchema = z.object({
  studySetId:     z.string().optional(),
  conversationId: z.string().optional(),
  message:        z.string().min(1),
  socratic:       z.boolean().optional(),
  documentIds:    z.array(z.string()).optional(),
  commandType:    z.string().optional(),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
    .default([]),
});

const feynmanStartSchema = z.object({
  studySetId: z.string().min(1),
  topic: z.string().min(1),
  documentId: z.string().min(1).optional(),
  // Locks the rubric strictness for this session's lifetime. Defaults to
  // medium when the client doesn't specify.
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
});

const feynmanSocraticChatSchema = z.object({
  sessionId: z.string().min(1),
  message:   z.string().min(1).max(2000),
  history:   z.array(z.object({
    role:    z.enum(['user', 'assistant']),
    content: z.string().min(1).max(4000),
  })).max(40).default([]),
});

const feynmanEvaluateSchema = z.object({
  // studySetId is derived from the session row (sessionId is authoritative);
  // accept it from the client for forward-compat but don't require it.
  studySetId:  z.string().min(1).optional(),
  // Empty/whitespace allowed so the FE can re-evaluate when the user wipes
  // the canvas — ai-engine returns empty coverage and zero scores, which is
  // honest. Without this, an empty submit 400s and the stale coverage stays.
  explanation: z.string().max(100_000),
  sessionId:   z.string().min(1),
  // True only when the user explicitly clicks "End Session" (or hits ⌘E).
  // Live debounced evaluates leave this false so the session stays resumable
  // across tab switches, reloads, and intermittent network blips.
  endSession:  z.boolean().optional(),
});

const generateFlashcardsSchema = z.object({
  studySetId: z.string().min(1),
  documentId: z.string().min(1),
  count: z.number().int().min(1).max(100).default(50),
});

const noteActionSchema = z.object({
  action:     z.enum(['summarize', 'explain', 'key-points']),
  text:       z.string().min(1),
  studySetId: z.string().optional(),
});

router.post('/chat', authMiddleware, quotaCheck('tokensUsed'), async (req: Request, res: Response) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors });
    return;
  }

  const { conversationId, message } = parsed.data;
  const prefs = await getPrefsFromCache(req.user!.id);
  const llmHeaders: Record<string, string> = {
    'x-llm-provider': prefs.llmProvider || process.env.LLM_PROVIDER || 'external',
    'x-llm-model': prefs.llmModel || process.env.LLM_MODEL || 'gpt-4o-mini',
  };

  let aiRes: globalThis.Response;
  try {
    aiRes = await fetch(aiEngineUrl('/api/ai/chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...llmHeaders },
      body: JSON.stringify({ userId: req.user!.id, ...parsed.data }),
    });
  } catch {
    res.status(502).json({ error: 'AI Engine unavailable' });
    return;
  }

  if (!aiRes.ok || !aiRes.body) {
    res.status(aiRes.status).json({ error: 'AI Engine error' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const reader = aiRes.body.getReader();
  const decoder = new TextDecoder();
  let assistantContent = '';
  let lineBuf = '';
  let streamOk = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) { streamOk = true; break; }
      const chunk = decoder.decode(value, { stream: true });
      res.write(chunk);
      // Accumulate assistant tokens for persistence
      lineBuf += chunk;
      const lines = lineBuf.split('\n');
      lineBuf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6);
        if (raw === '[DONE]') continue;
        try {
          const evt = JSON.parse(raw) as Record<string, unknown>;
          if (typeof evt.token === 'string') assistantContent += evt.token;
        } catch { /* ignore parse errors */ }
      }
    }
  } finally {
    res.end();
    void incrementQuota(req.user!.id, 'tokensUsed');
    // Persist user and assistant turns fire-and-forget
    if (conversationId && streamOk) {
      const userId = req.user!.id;
      void proxyTo(coreUrl(`/internal/coach-conversations/${conversationId}/messages`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: 'user', content: message }),
      });
      if (assistantContent) {
        void proxyTo(coreUrl(`/internal/coach-conversations/${conversationId}/messages`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, role: 'assistant', content: assistantContent }),
        });
      }
    } else if (conversationId && assistantContent) {
      // Partial stream (aborted mid-stream) — still persist what we got
      const userId = req.user!.id;
      void proxyTo(coreUrl(`/internal/coach-conversations/${conversationId}/messages`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: 'user', content: message }),
      });
      void proxyTo(coreUrl(`/internal/coach-conversations/${conversationId}/messages`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: 'assistant', content: assistantContent + ' [truncated]' }),
      });
    }
  }
});

router.post('/feynman/start', authMiddleware, quotaCheck('feynmanSessions'), async (req: Request, res: Response) => {
  const parsed = feynmanStartSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors });
    return;
  }
  const userId = req.user!.id;
  const { studySetId, topic, documentId, difficulty } = parsed.data;

  // 1. Create the FeynmanSession row first (authoritative).
  const createRes = await proxyTo(coreUrl('/internal/feynman-sessions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      studySetId,
      topic,
      documentId,
      difficulty: difficulty ?? 'medium',
    }),
  });
  if (createRes.status !== 201) {
    res.status(502).json({ error: 'Failed to create session', detail: createRes.body });
    return;
  }
  const created = createRes.body as { _id: string; topic: string };

  // 2. Call ai-engine for the opening Socratic question.
  const prefs = await getPrefsFromCache(userId);
  const llmHeaders: Record<string, string> = {
    'x-llm-provider': prefs.llmProvider || process.env.LLM_PROVIDER || 'external',
    'x-llm-model':    prefs.llmModel    || process.env.LLM_MODEL    || 'gpt-4o-mini',
  };
  let aiRes: globalThis.Response;
  try {
    aiRes = await fetch(aiEngineUrl('/api/ai/feynman/start'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...llmHeaders },
      body: JSON.stringify({
        userId,
        studySetId,
        topic,
        sessionId:  created._id,
        documentId: documentId ?? null,
      }),
    });
  } catch {
    // ai-engine unreachable — clean up the orphan row.
    void proxyTo(coreUrl(`/internal/feynman-sessions/${created._id}`), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    res.status(502).json({ error: 'AI Engine unavailable' });
    return;
  }

  const body = await aiRes.json().catch(() => ({}));
  if (!aiRes.ok) {
    void proxyTo(coreUrl(`/internal/feynman-sessions/${created._id}`), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    res.status(502).json({ error: 'AI Engine error', detail: body });
    return;
  }

  void incrementQuota(userId, 'feynmanSessions');

  const aiPayload = body as { question?: string; topic?: string };

  // Cross-set fit hint — when the user's topic matches material in one or
  // more *other* study sets, the FE surfaces a chooser. ai-engine returns
  // the candidates list; we resolve each set's name from core in parallel.
  // The block is best-effort: any failure just means no chooser, no error.
  let suggestedSets: Array<{ studySetId: string; studySetName: string }> = [];
  try {
    const fitRes = await fetch(aiEngineUrl('/api/ai/feynman/topic-fit'), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        userId,
        topic,
        currentStudySetId: studySetId,
      }),
    });
    if (fitRes.ok) {
      const fitBody = await fitRes.json() as {
        fit?: {
          best_study_set_id: string;
          suggest_switch: boolean;
          candidates?: Array<{ study_set_id: string; mean_distance: number }>;
        } | null;
      };
      const candidates = fitBody.fit?.candidates ?? [];
      // Exclude the current set from the chooser — switching to where you
      // already are isn't a useful option.
      const otherSets = candidates
        .map(c => c.study_set_id)
        .filter(sid => sid && sid !== studySetId);

      if (otherSets.length > 0) {
        const lookups = await Promise.all(otherSets.map(async (sid) => {
          const lookup = await proxyTo(
            coreUrl(`/internal/study-sets/${sid}?userId=${userId}`),
            { method: 'GET' },
          );
          if (lookup.status === 200) {
            const setRow = lookup.body as { name?: string };
            if (setRow.name) {
              return { studySetId: sid, studySetName: setRow.name };
            }
          }
          return null;
        }));
        suggestedSets = lookups.filter((x): x is { studySetId: string; studySetName: string } => x !== null);
      }
    }
  } catch {
    // Non-fatal — proceed without a suggestion.
  }

  res.status(201).json({
    _id:           created._id,
    question:      aiPayload.question ?? '',
    topic:         aiPayload.topic    ?? created.topic,
    suggestedSets,
  });
});

router.post('/feynman/evaluate', authMiddleware, async (req: Request, res: Response) => {
  const parsed = feynmanEvaluateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors });
    return;
  }
  const userId = req.user!.id;
  const { sessionId, explanation, endSession } = parsed.data;

  // Look up the session so the rubric stays scoped to the source the user
  // picked at /start (G.0 persists documentId on the row). studySetId is
  // pulled from the session — sessionId is authoritative; the body field
  // is only honored as a sanity fallback if the lookup ever races.
  const lookup = await proxyTo(
    coreUrl(`/internal/feynman-sessions/${sessionId}?userId=${userId}`),
    { method: 'GET' },
  );
  if (lookup.status !== 200) {
    res.status(lookup.status === 404 ? 404 : 502).json({ error: 'Session not found' });
    return;
  }
  const session = lookup.body as {
    documentId?: string | null;
    studySetId?: string;
    difficulty?: 'easy' | 'medium' | 'hard';
    topic?: string;
  };
  const documentId = session.documentId ?? null;
  const studySetId = session.studySetId ?? parsed.data.studySetId;
  const difficulty = session.difficulty ?? 'medium';
  const topic = session.topic ?? null;
  if (!studySetId) {
    res.status(500).json({ error: 'Session missing studySetId' });
    return;
  }

  const prefs = await getPrefsFromCache(userId);
  const llmHeaders: Record<string, string> = {
    'x-llm-provider': prefs.llmProvider || process.env.LLM_PROVIDER || 'external',
    'x-llm-model':    prefs.llmModel    || process.env.LLM_MODEL    || 'gpt-4o-mini',
  };

  let aiRes: globalThis.Response;
  try {
    aiRes = await fetch(aiEngineUrl('/api/ai/feynman/evaluate'), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...llmHeaders },
      body:    JSON.stringify({
        userId,
        studySetId,
        explanation,
        sessionId,
        documentId,
        // Locks the rubric strictness for this grade — read from the session
        // row so changing difficulty mid-flight is impossible.
        difficulty,
        // Topic from the session row — ai-engine uses it as the semantic
        // query into Chroma so the rubric grounds in topic-relevant chunks,
        // and as the fallback when no chunk matches.
        topic,
      }),
    });
  } catch {
    res.status(502).json({ error: 'AI Engine unavailable' });
    return;
  }
  const body = await aiRes.json().catch(() => ({})) as Record<string, unknown>;

  // Persist scores fire-and-forget (G.3) — scores are on a 0..1 scale at
  // the source, so multiply by 100 to match the model's 0..100 range.
  if (aiRes.ok) {
    const { clarityScore, accuracyScore, coverage } = body as {
      clarityScore?: number;
      accuracyScore?: number;
      coverage?: unknown[];
    };
    const clarityPct  = typeof clarityScore  === 'number' ? Math.round(clarityScore  * 100) : undefined;
    const accuracyPct = typeof accuracyScore === 'number' ? Math.round(accuracyScore * 100) : undefined;
    void proxyTo(coreUrl(`/internal/feynman-sessions/${sessionId}`), {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        userId,
        // Persist the in-progress explanation so resume restores the canvas.
        // Without this, switching tabs / reloading returns an empty editor
        // even though the score metadata is still on the row.
        explanation,
        ...(clarityPct  !== undefined ? { clarityScore:  clarityPct }  : {}),
        ...(accuracyPct !== undefined ? { accuracyScore: accuracyPct } : {}),
        ...(Array.isArray(coverage) ? { coverage } : {}),
        // Only conclude the session when the user explicitly ends it.
        // Live evaluates keep the session in its prior status so the user
        // can switch tabs / reload / disconnect and still resume.
        ...(endSession ? { status: 'complete' } : {}),
      }),
    });
  }
  res.status(aiRes.status).json(body);
});

router.post('/feynman/socratic-chat', authMiddleware, async (req: Request, res: Response) => {
  const parsed = feynmanSocraticChatSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  const userId = req.user!.id;
  const { sessionId, message, history } = parsed.data;

  // Look up the session to derive topic / studySetId / documentId / current
  // explanation. Same authoritative-session pattern as /evaluate above.
  const lookup = await proxyTo(
    coreUrl(`/internal/feynman-sessions/${sessionId}?userId=${userId}`),
    { method: 'GET' },
  );
  if (lookup.status !== 200) {
    res.status(lookup.status === 404 ? 404 : 502).json({ error: 'Session not found' });
    return;
  }
  const session = lookup.body as {
    topic?:       string;
    studySetId?:  string;
    documentId?:  string | null;
    explanation?: string;
    coverage?:    Array<{ id: string; label: string; status: string }>;
  };
  if (!session.topic || !session.studySetId) {
    res.status(500).json({ error: 'Session missing topic/studySetId' });
    return;
  }

  const prefs = await getPrefsFromCache(userId);
  const llmHeaders: Record<string, string> = {
    'x-llm-provider': prefs.llmProvider || process.env.LLM_PROVIDER || 'external',
    'x-llm-model':    prefs.llmModel    || process.env.LLM_MODEL    || 'gpt-4o-mini',
  };

  let aiRes: globalThis.Response;
  try {
    aiRes = await fetch(aiEngineUrl('/api/ai/feynman/socratic-chat'), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...llmHeaders },
      body:    JSON.stringify({
        userId,
        studySetId:  session.studySetId,
        topic:       session.topic,
        explanation: session.explanation ?? '',
        message,
        history,
        documentId:  session.documentId ?? null,
        sessionId,
        // Passed through so the tutor can probe the actual gaps in the
        // current rubric state rather than asking generic questions.
        coverage:    session.coverage ?? [],
      }),
    });
  } catch {
    res.status(502).json({ error: 'AI Engine unavailable' });
    return;
  }
  const body = await aiRes.json().catch(() => ({})) as Record<string, unknown>;
  res.status(aiRes.status).json(body);
});

router.post('/note-action', authMiddleware, quotaCheck('tokensUsed'), async (req: Request, res: Response) => {
  const parsed = noteActionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors });
    return;
  }

  const prefs = await getPrefsFromCache(req.user!.id);
  const llmHeaders: Record<string, string> = {
    'x-llm-provider': prefs.llmProvider || process.env.LLM_PROVIDER || 'external',
    'x-llm-model':    prefs.llmModel    || process.env.LLM_MODEL    || 'gpt-4o-mini',
  };

  let aiRes: globalThis.Response;
  try {
    aiRes = await fetch(aiEngineUrl('/api/ai/note-action'), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...llmHeaders },
      body:    JSON.stringify({ userId: req.user!.id, ...parsed.data }),
    });
  } catch {
    res.status(502).json({ error: 'AI Engine unavailable' });
    return;
  }

  if (!aiRes.ok || !aiRes.body) {
    res.status(aiRes.status).json({ error: 'AI Engine error' });
    return;
  }

  res.setHeader('Content-Type',     'text/event-stream');
  res.setHeader('Cache-Control',    'no-cache');
  res.setHeader('Connection',       'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const reader  = aiRes.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
  } finally {
    res.end();
    void incrementQuota(req.user!.id, 'tokensUsed');
  }
});

router.post('/generate-flashcards', authMiddleware, async (req: Request, res: Response) => {
  const parsed = generateFlashcardsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors });
    return;
  }
  let aiRes: globalThis.Response;
  try {
    aiRes = await fetch(aiEngineUrl('/api/ai/generate-flashcards'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: req.user!.id, ...parsed.data }),
    });
  } catch {
    res.status(502).json({ error: 'AI Engine unavailable' });
    return;
  }
  const body = await aiRes.json();
  res.status(aiRes.status).json(body);
});

export default router;
