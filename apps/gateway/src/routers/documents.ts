import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { quotaCheck, incrementQuota } from '../middleware/quota';
import { proxyTo, coreUrl } from '../services/proxy.service';
import { enqueueIngestionJob } from '../queues/pdfIngestion.queue';

const router = Router();

const MAX_SIZE_MB = parseInt(process.env.UPLOAD_MAX_SIZE_MB || '50', 10);

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join('uploads', req.user!.id);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

async function validatePdfMagicBytes(req: Request, res: Response, next: NextFunction) {
  if (!req.file) return next();
  const buffer = Buffer.alloc(4);
  const fd = fs.openSync(req.file.path, 'r');
  fs.readSync(fd, buffer, 0, 4, 0);
  fs.closeSync(fd);
  if (buffer.toString('ascii', 0, 4) !== '%PDF') {
    fs.unlinkSync(req.file.path);
    res.status(400).json({ error: 'Uploaded file is not a valid PDF.' });
    return;
  }
  next();
}

const bodySchema = z.object({
  studySetId: z.string().min(1),
});

router.get('/', authMiddleware, async (req: Request, res: Response) => {
  const { studySetId } = req.query as { studySetId?: string };
  if (!studySetId) {
    res.status(400).json({ error: 'studySetId required' });
    return;
  }
  const { status, body } = await proxyTo(
    coreUrl(`/internal/documents?userId=${req.user!.id}&studySetId=${studySetId}`),
    { method: 'GET' },
  );
  res.status(status).json(body);
});

router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  const { status, body } = await proxyTo(
    coreUrl(`/internal/documents/${req.params.id}?userId=${req.user!.id}`),
    { method: 'GET' },
  );
  res.status(status).json(body);
});

// Stream the raw PDF bytes. Used by react-pdf via the Next.js BFF.
// Scoped to the owning user; rejects any storageUri that escapes the
// user's upload directory.
router.get('/:id/file', authMiddleware, async (req: Request, res: Response) => {
  const meta = await proxyTo(
    coreUrl(`/internal/documents/${req.params.id}?userId=${req.user!.id}`),
    { method: 'GET' },
  );
  if (meta.status !== 200) {
    res.status(meta.status).end();
    return;
  }
  const doc = meta.body as { storageUri?: string; type?: string };
  if (doc.type !== 'pdf' || !doc.storageUri) {
    res.status(404).json({ error: 'No file for this document' });
    return;
  }
  const uploadsRoot = path.resolve(process.cwd(), 'uploads');
  const userRoot    = path.resolve(uploadsRoot, req.user!.id);
  const absolute    = path.resolve(process.cwd(), doc.storageUri);
  if (!absolute.startsWith(userRoot + path.sep)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  if (!fs.existsSync(absolute)) {
    res.status(404).json({ error: 'File missing on disk' });
    return;
  }
  res.sendFile(absolute, {
    headers: { 'Content-Type': 'application/pdf' },
  }, (err) => {
    if (err && !res.headersSent) {
      res.status(500).end();
    }
  });
});

const patchSchema = z.object({
  title:      z.string().min(1).max(300).optional(),
  studySetId: z.string().min(1).optional(),
}).refine(
  data => data.title !== undefined || data.studySetId !== undefined,
  { message: 'title or studySetId required' },
);

router.patch('/:id', authMiddleware, async (req: Request, res: Response) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors });
    return;
  }
  const { status, body } = await proxyTo(coreUrl(`/internal/documents/${req.params.id}`), {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId: req.user!.id, ...parsed.data }),
  });
  res.status(status).json(body);
});

router.post('/:id/reingest', authMiddleware, async (req: Request, res: Response) => {
  const coreRes = await proxyTo(coreUrl(`/internal/documents/${req.params.id}/reingest`), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId: req.user!.id }),
  });
  if (coreRes.status !== 200) {
    res.status(coreRes.status).json(coreRes.body);
    return;
  }
  const job = coreRes.body as { _id: string; storagePath: string; studySetId: string };
  try {
    await enqueueIngestionJob({
      documentId:  job._id,
      userId:      req.user!.id,
      studySetId:  job.studySetId,
      storagePath: job.storagePath,
    });
  } catch {
    void proxyTo(coreUrl(`/internal/documents/${job._id}/status`), {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ingestionStatus: 'failed' }),
    });
    res.status(503).json({ error: 'Queue unavailable — could not enqueue re-ingestion' });
    return;
  }
  res.status(202).json({ documentId: job._id, message: 'Re-ingestion queued' });
});

router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  // Look up storage path BEFORE delete so we can clean up the file on disk.
  const meta = await proxyTo(
    coreUrl(`/internal/documents/${req.params.id}?userId=${req.user!.id}`),
    { method: 'GET' },
  );
  const storageUri = meta.status === 200
    ? (meta.body as { storageUri?: string }).storageUri
    : undefined;

  const { status, body } = await proxyTo(
    coreUrl(`/internal/documents/${req.params.id}?userId=${req.user!.id}`),
    { method: 'DELETE' },
  );

  if (status >= 200 && status < 300 && storageUri) {
    try {
      const uploadsRoot = path.resolve(process.cwd(), 'uploads');
      const userRoot    = path.resolve(uploadsRoot, req.user!.id);
      const absolute    = path.resolve(process.cwd(), storageUri);
      if (absolute.startsWith(userRoot + path.sep) && fs.existsSync(absolute)) {
        fs.unlinkSync(absolute);
      }
    } catch {
      // best-effort cleanup; logged elsewhere
    }
  }
  res.status(status).end();
  void body;
});

const bulkDeleteBodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

router.post('/bulk-delete', authMiddleware, async (req: Request, res: Response) => {
  const parsed = bulkDeleteBodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  const coreRes = await proxyTo(coreUrl('/internal/documents/bulk-delete'), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId: req.user!.id, ids: parsed.data.ids }),
  });
  if (coreRes.status !== 200) { res.status(coreRes.status).json(coreRes.body); return; }
  const result = coreRes.body as { storageUris?: string[] };
  const uploadsRoot = path.resolve(process.cwd(), 'uploads');
  const userRoot    = path.resolve(uploadsRoot, req.user!.id);
  for (const uri of result.storageUris ?? []) {
    try {
      const absolute = path.resolve(process.cwd(), uri);
      if (absolute.startsWith(userRoot + path.sep) && fs.existsSync(absolute)) {
        fs.unlinkSync(absolute);
      }
    } catch { /* best-effort */ }
  }
  res.json(coreRes.body);
});

const bulkMoveBodySchema = z.object({
  ids:         z.array(z.string().min(1)).min(1),
  targetSetId: z.string().min(1),
});

router.post('/bulk-move', authMiddleware, async (req: Request, res: Response) => {
  const parsed = bulkMoveBodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.errors }); return; }
  const { status, body } = await proxyTo(coreUrl('/internal/documents/bulk-move'), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId: req.user!.id, ids: parsed.data.ids, targetSetId: parsed.data.targetSetId }),
  });
  res.status(status).json(body);
});

router.post(
  '/',
  authMiddleware,
  quotaCheck('pdfsIngested'),
  (req: Request, res: Response, next) => {
    upload.single('file')(req, res, (err) => {
      if (err instanceof multer.MulterError || err) {
        res.status(400).json({ error: err.message });
        return;
      }
      next();
    });
  },
  validatePdfMagicBytes,
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors });
      return;
    }

    const docRes = await proxyTo(coreUrl('/internal/documents'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: req.user!.id,
        studySetId: parsed.data.studySetId,
        title: req.file.originalname,
        storageUri: req.file.path,
        type: 'pdf',
      }),
    });

    if (docRes.status !== 201) {
      res.status(docRes.status).json(docRes.body);
      return;
    }

    const docId = (docRes.body as { _id: string })._id;

    try {
      await enqueueIngestionJob({
        documentId: docId,
        userId: req.user!.id,
        studySetId: parsed.data.studySetId,
        storagePath: req.file.path,
      });
    } catch (err) {
      // Mark document as failed so it doesn't hang in 'pending' forever
      void proxyTo(coreUrl(`/internal/documents/${docId}/status`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingestionStatus: 'failed' }),
      });
      res.status(503).json({ error: 'Queue unavailable — could not enqueue ingestion job' });
      return;
    }

    // fire-and-forget quota increment
    void incrementQuota(req.user!.id, 'pdfsIngested');

    res.status(202).json({
      jobId: `job-${docId}`,
      documentId: docId,
      message: 'PDF queued for ingestion',
    });
  },
);

export default router;
