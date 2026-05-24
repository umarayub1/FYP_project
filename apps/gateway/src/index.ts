import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import Redis from 'ioredis';

// Ensure uploads root exists at startup so multer can create user subdirs
fs.mkdirSync(path.join(process.cwd(), 'uploads'), { recursive: true });

import authRouter from './routers/auth';
import studySetsRouter from './routers/studySets';
import documentsRouter from './routers/documents';
import flashcardsRouter from './routers/flashcards';
import aiRouter from './routers/ai';
import nowBriefRouter from './routers/nowBrief';
import quotaRouter from './routers/quota';
import notesRouter from './routers/notes';
import tagsRouter from './routers/tags';
import searchRouter from './routers/search';
import userRouter from './routers/user';
import sessionsRouter from './routers/sessions';
import coachRouter from './routers/coach';
import feynmanRouter from './routers/feynman';
import pdfsRouter from './routers/pdfs';
import weakpointsRouter from './routers/weakpoints';
import deadlinesRouter from './routers/deadlines';
import { startIngestionBridge } from './lib/ingestionBridge';

const app = express();
const httpServer = http.createServer(app);

const corsOrigins = process.env.CORS_ORIGINS?.split(',').filter(Boolean) ?? ['http://localhost:3000'];

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: corsOrigins,
    methods: ['GET', 'POST'],
  },
});

// ── Middleware ───────────────────────────────────────────────────────────────

// Disable CSP — Next.js frontend manages its own CSP
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(rateLimit({ windowMs: 60_000, max: 100, standardHeaders: true, legacyHeaders: false }));

// ── Socket.IO auth ───────────────────────────────────────────────────────────

function extractCookieToken(rawCookie: string | undefined): string | undefined {
  if (!rawCookie) return undefined;
  for (const part of rawCookie.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === 'synapse_token') return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

io.use((socket, next) => {
  const headerToken = socket.handshake.auth?.token as string | undefined;
  const cookieToken = extractCookieToken(socket.handshake.headers.cookie);
  const token = headerToken ?? cookieToken;
  if (!token) return next(new Error('Unauthorized'));
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { sub: string; email: string };
    socket.data.userId = payload.sub;
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  const userId: string = socket.data.userId;
  socket.join(`user:${userId}`);

  socket.on('join:doc', (docId: string) => {
    if (typeof docId !== 'string' || docId.length === 0) return;
    socket.join(`doc:${docId}`);
  });

  socket.on('leave:doc', (docId: string) => {
    if (typeof docId !== 'string' || docId.length === 0) return;
    socket.leave(`doc:${docId}`);
  });
});

startIngestionBridge(io);

// ── Redis Pub/Sub → Socket.IO bridge (Python worker → browser) ───────────────

if (process.env.REDIS_URL) {
  const subscriber = new Redis(process.env.REDIS_URL);
  subscriber.psubscribe('user:*').catch((err) => console.error('Redis psubscribe error:', err));
  subscriber.on('pmessage', (_pattern: string, channel: string, message: string) => {
    const userId = channel.replace('user:', '');
    let payload: { event?: unknown; [k: string]: unknown };
    try {
      payload = JSON.parse(message);
    } catch {
      return;
    }
    if (!payload || typeof payload.event !== 'string') {
      console.warn(`[pubsub] payload missing event field on channel ${channel}`);
      return;
    }
    io.to(`user:${userId}`).emit(payload.event, payload);
  });

  const shutdown = () => {
    void subscriber.disconnect();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// ── Routes ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'gateway' });
});

app.use('/api/auth', authRouter);
app.use('/api/study-sets', studySetsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/flashcards', flashcardsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/now-brief', nowBriefRouter);
app.use('/api/quota', quotaRouter);
app.use('/api/notes', notesRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/search', searchRouter);
app.use('/api/user', userRouter);
app.use('/api/auth/sessions', sessionsRouter);
app.use('/api/coach', coachRouter);
app.use('/api/feynman', feynmanRouter);
app.use('/api/pdfs', pdfsRouter);
app.use('/api/weakpoints', weakpointsRouter);
app.use('/api/deadlines', deadlinesRouter);

// ── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT ?? 4000;
httpServer.listen(PORT, () => {
  console.log(`Gateway listening on :${PORT}`);
});

export { app, httpServer, io };
