import type { IUser, IStudySet, IDocument, IFlashcard, ISpacedRepetition } from './models';

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface AuthRegisterRequest {
  email: string;
  password: string;
}

export interface AuthLoginRequest {
  email: string;
  password: string;
}

export interface AuthRefreshRequest {
  refreshToken: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: Omit<IUser, 'passwordHash'>;
}

// ── StudySets ─────────────────────────────────────────────────────────────────

export interface CreateStudySetRequest {
  name: string;
  color: string;
}

export interface UpdateStudySetRequest {
  name?: string;
  color?: string;
  deadlines?: IStudySet['deadlines'];
}

export type StudySetResponse = IStudySet;

// ── Documents ─────────────────────────────────────────────────────────────────

export interface CreateDocumentRequest {
  studySetId: string;
  title: string;
  type: 'pdf' | 'note';
}

export interface DocumentUploadResponse {
  jobId: string;
  documentId: string;
  message: string;
}

export type DocumentResponse = IDocument;

// ── Flashcards ────────────────────────────────────────────────────────────────

export interface CreateFlashcardRequest {
  studySetId: string;
  cardType?: 'basic' | 'bidirectional' | 'cloze';
  front?: string;
  back?: string;
  clozeBody?: string;
  bidirectional?: boolean;
  tags?: string[];
  sourceDocumentId?: string;
}

export interface FlashcardReviewRequest {
  quality: 1 | 2 | 3 | 4;
}

export type FlashcardResponse = IFlashcard & { spacedRepetition?: ISpacedRepetition };

// ── Smart Coach ───────────────────────────────────────────────────────────────

export interface ChatRequest {
  message: string;
  studySetId?: string;
  referencedDocumentIds?: string[];
}

export interface ChatStreamChunk {
  type: 'token' | 'done' | 'error';
  content: string;
}
