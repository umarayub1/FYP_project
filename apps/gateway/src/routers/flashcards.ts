import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { proxyTo, coreUrl } from '../services/proxy.service';

const router = Router();

const ALLOWED_DELIMITERS = [',', '\t', ';', '|'];

const createSchema = z.object({
  studySetId: z.string().min(1),
  cardType: z.enum(['basic', 'bidirectional', 'cloze']).optional(),
  front: z.string().min(1).optional(),
  back: z.string().min(1).optional(),
  clozeBody: z.string().optional(),
  bidirectional: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  sourceDocumentId: z.string().optional(),
});

const updateSchema = z.object({
  studySetId:  z.string().min(1),
  front:       z.string().optional(),
  back:        z.string().optional(),
  cardType:    z.enum(['basic', 'bidirectional', 'cloze']).optional(),
  clozeBody:   z.string().optional(),
  clozeNumber: z.number().int().optional(),
  tags:        z.array(z.string()).optional(),
  sourceTitle: z.string().optional(),
  sourcePage:  z.number().int().optional(),
});

const suspendSchema = z.object({
  studySetId: z.string().min(1),
});

const reviewSchema = z.object({
  studySetId: z.string().min(1),
  quality: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  isCram: z.boolean().optional(),
});

const bulkImportSchema = z.object({
  studySetId: z.string().min(1),
  csvText:    z.string().min(1),
  delimiter:  z.string().optional(),
});

router.get('/queue', authMiddleware, async (req: Request, res: Response) => {
  const { studySetId, cram } = req.query as { studySetId?: string; cram?: string };
  if (!studySetId) {
    res.status(400).json({ error: 'studySetId required' });
    return;
  }
  const cramParam = cram === 'true' ? '&cram=true' : '';
  const { status, body } = await proxyTo(
    coreUrl(`/internal/flashcards/queue?userId=${req.user!.id}&studySetId=${studySetId}${cramParam}`),
    { method: 'GET' },
  );
  res.status(status).json(body);
});

router.get('/', authMiddleware, async (req: Request, res: Response) => {
  const { studySetId } = req.query as { studySetId?: string };
  if (!studySetId) {
    res.status(400).json({ error: 'studySetId required' });
    return;
  }
  const { status, body } = await proxyTo(
    coreUrl(`/internal/flashcards?userId=${req.user!.id}&studySetId=${studySetId}`),
    { method: 'GET' },
  );
  res.status(status).json(body);
});

function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// Infer cloze from `{{c1::...}}` syntax in the front column
function inferCardType(front: string, type?: string): 'basic' | 'bidirectional' | 'cloze' {
  if (type === 'cloze' || type === 'bidirectional') return type;
  if (!type && /\{\{c\d+::/.test(front)) return 'cloze';
  return 'basic';
}

router.get('/leech-count', authMiddleware, async (req: Request, res: Response) => {
  const { status, body } = await proxyTo(
    coreUrl(`/internal/flashcards/leech-count?userId=${req.user!.id}`),
    { method: 'GET' },
  );
  res.status(status).json(body);
});

router.post('/bulk-import', authMiddleware, async (req: Request, res: Response) => {
  const parsed = bulkImportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors });
    return;
  }
  const rawDelimiter = parsed.data.delimiter ?? ',';
  if (typeof rawDelimiter !== 'string' || rawDelimiter.length !== 1 || !ALLOWED_DELIMITERS.includes(rawDelimiter)) {
    res.status(400).json({ error: 'Invalid delimiter. Must be one of: comma, tab, semicolon, pipe.' });
    return;
  }
  const delimiter = rawDelimiter;
  const lines = parsed.data.csvText.trim().split('\n').filter(Boolean);
  if (lines.length === 0) {
    res.status(400).json({ error: 'CSV is empty' });
    return;
  }

  // Parse header — support Front,Back (Anki) and front,back,tags,type,cloze
  const rawHeader = parseCSVLine(lines[0], delimiter).map(h => h.trim().toLowerCase());
  const isAnkiShape = rawHeader[0] === 'front' && rawHeader[1] === 'back';
  if (!isAnkiShape && !rawHeader.includes('front')) {
    res.status(400).json({ error: 'CSV must have a "front" column header' });
    return;
  }

  const colIndex = (name: string) => rawHeader.indexOf(name);
  const frontIdx = colIndex('front');
  const backIdx  = colIndex('back');
  const tagsIdx  = colIndex('tags');
  const typeIdx  = colIndex('type');
  const clozeIdx = colIndex('cloze');

  const rows = lines.slice(1).map((line) => {
    const cells = parseCSVLine(line, delimiter);
    const front     = (cells[frontIdx] ?? '').trim();
    const back      = (cells[backIdx]  ?? '').trim();
    const tags      = tagsIdx >= 0 ? (cells[tagsIdx] ?? '').trim() : '';
    const typeRaw   = typeIdx  >= 0 ? (cells[typeIdx] ?? '').trim().toLowerCase() : '';
    const clozeRaw  = clozeIdx >= 0 ? (cells[clozeIdx] ?? '').trim() : '';
    const cardType  = inferCardType(front, typeRaw);
    const clozeBody = cardType === 'cloze' ? (clozeRaw || front) : undefined;
    return { front, back, tags, cardType, clozeBody };
  });

  const { status, body } = await proxyTo(coreUrl('/internal/flashcards/bulk-import'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: req.user!.id, studySetId: parsed.data.studySetId, rows }),
  });
  res.status(status).json(body);
});

router.post('/', authMiddleware, async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors });
    return;
  }
  const { status, body } = await proxyTo(coreUrl('/internal/flashcards'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: req.user!.id, ...parsed.data }),
  });
  res.status(status).json(body);
});

router.patch('/:id/suspend', authMiddleware, async (req: Request, res: Response) => {
  const parsed = suspendSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  const { status, body } = await proxyTo(coreUrl(`/internal/flashcards/${req.params.id}/suspend`), {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId: req.user!.id, studySetId: parsed.data.studySetId }),
  });
  res.status(status).json(body);
});

router.patch('/:id', authMiddleware, async (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  const { status, body } = await proxyTo(coreUrl(`/internal/flashcards/${req.params.id}`), {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId: req.user!.id, ...parsed.data }),
  });
  res.status(status).json(body);
});

router.post('/:id/review', authMiddleware, async (req: Request, res: Response) => {
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors });
    return;
  }
  const { status, body } = await proxyTo(coreUrl(`/internal/flashcards/${req.params.id}/review`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId:     req.user!.id,
      studySetId: parsed.data.studySetId,
      quality:    parsed.data.quality,
      isCram:     parsed.data.isCram ?? false,
    }),
  });
  res.status(status).json(body);
});

router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  const studySetId = req.query.studySetId as string | undefined;
  if (!studySetId) { res.status(400).json({ error: 'studySetId required' }); return; }
  const { status, body } = await proxyTo(
    coreUrl(`/internal/flashcards/${req.params.id}?userId=${req.user!.id}&studySetId=${studySetId}`),
    { method: 'DELETE' },
  );
  res.status(status).end();
  void body;
});

const bulkDeleteCardBodySchema = z.object({
  studySetId: z.string().min(1),
  ids:        z.array(z.string().min(1)).min(1),
});

router.post('/bulk-delete', authMiddleware, async (req: Request, res: Response) => {
  const parsed = bulkDeleteCardBodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  const { status, body } = await proxyTo(coreUrl('/internal/flashcards/bulk-delete'), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId: req.user!.id, ...parsed.data }),
  });
  res.status(status).json(body);
});

const bulkTagBodySchema = z.object({
  studySetId: z.string().min(1),
  ids:        z.array(z.string().min(1)).min(1),
  tags:       z.array(z.string().min(1)).min(1),
  mode:       z.enum(['add', 'remove']),
});

router.post('/bulk-tag', authMiddleware, async (req: Request, res: Response) => {
  const parsed = bulkTagBodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  const { status, body } = await proxyTo(coreUrl('/internal/flashcards/bulk-tag'), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId: req.user!.id, ...parsed.data }),
  });
  res.status(status).json(body);
});

const bulkMoveCardBodySchema = z.object({
  fromStudySetId: z.string().min(1),
  toStudySetId:   z.string().min(1),
  ids:            z.array(z.string().min(1)).min(1),
});

router.post('/bulk-move', authMiddleware, async (req: Request, res: Response) => {
  const parsed = bulkMoveCardBodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  const { status, body } = await proxyTo(coreUrl('/internal/flashcards/bulk-move'), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId: req.user!.id, ...parsed.data }),
  });
  res.status(status).json(body);
});

export default router;
