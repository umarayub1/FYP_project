import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { connectDB } from './db/connection';
import { internalAuth } from './middleware/internalAuth';
import './models/ReviewSession';
import './models/CoachConversation';
import './models/StudySession';
import './models/FeynmanSchedule';
import './models/FeynmanSession';
import internalAuthRouter from './routers/internalAuth';
import internalStudySetsRouter from './routers/internalStudySets';
import internalDocumentsRouter from './routers/internalDocuments';
import internalFlashcardsRouter from './routers/internalFlashcards';
import internalNowBriefRouter from './routers/internalNowBrief';
import internalQuotaRouter from './routers/internalQuota';
import internalNotesRouter from './routers/internalNotes';
import internalTagsRouter from './routers/internalTags';
import internalSearchRouter from './routers/internalSearch';
import internalUserPreferencesRouter from './routers/internalUserPreferences';
import internalApiKeysRouter from './routers/internalApiKeys';
import internalSessionsRouter from './routers/internalSessions';
import internalUsersRouter from './routers/internalUsers';
import internalCoachConversationsRouter from './routers/internalCoachConversations';
import internalFeynmanSessionsRouter from './routers/internalFeynmanSessions';
import internalFeynmanSchedulesRouter from './routers/internalFeynmanSchedules';
import internalWeakpointsRouter from './routers/internalWeakpoints';
import internalDeadlinesRouter from './routers/internalDeadlines';
import { startDeadlineCron } from './jobs/deadlineCron';

const app = express();
app.use(helmet());
app.use(express.json());

connectDB();

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({ status: 'ok', service: 'core-service', db: dbStatus });
});

// ── Internal routes (Docker-network only, not exposed via compose ports) ──────

app.use('/internal', internalAuth);
app.use('/internal/auth', internalAuthRouter);
app.use('/internal/study-sets', internalStudySetsRouter);
app.use('/internal/documents', internalDocumentsRouter);
app.use('/internal/flashcards', internalFlashcardsRouter);
app.use('/internal/now-brief', internalNowBriefRouter);
app.use('/internal/quota', internalQuotaRouter);
app.use('/internal/notes', internalNotesRouter);
app.use('/internal/tags', internalTagsRouter);
app.use('/internal/search', internalSearchRouter);
app.use('/internal/user-preferences', internalUserPreferencesRouter);
app.use('/internal/api-keys', internalApiKeysRouter);
app.use('/internal/sessions', internalSessionsRouter);
app.use('/internal/users', internalUsersRouter);
app.use('/internal/coach-conversations', internalCoachConversationsRouter);
app.use('/internal/feynman-sessions', internalFeynmanSessionsRouter);
app.use('/internal/feynman-schedules', internalFeynmanSchedulesRouter);
app.use('/internal/weakpoints', internalWeakpointsRouter);
app.use('/internal/deadlines', internalDeadlinesRouter);

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT ?? 4001;
app.listen(PORT, () => {
  console.log(`Core service listening on :${PORT}`);
  startDeadlineCron();
});

export { app };
