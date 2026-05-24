export interface IUser {
  _id: string;
  email: string;
  passwordHash: string;
  apiKeys: { openai?: string; anthropic?: string };
  preferences: {
    theme: 'light' | 'dark' | 'system';
    llmProvider: 'external' | 'local';
    embeddingProvider: 'openai' | 'local';
  };
  subscription: { tier: 'free' | 'pro'; renewsAt: Date };
  createdAt: Date;
}

export interface IUsageQuota {
  _id: string;
  userId: string;
  period: string;
  tokensUsed: number;
  pdfsIngested: number;
  feynmanSessions: number;
}

export interface IDeadline {
  id:               string;
  userId:           string;
  studySetId:       string | null;
  type:             'exam' | 'quiz' | 'assignment' | 'custom';
  label:            string;
  date:             string;   // ISO 8601 datetime
  notifyDaysBefore: number[];
  snoozeUntil:      string | null;
  remindedAt:       string | null;
  passedAt:         string | null;
  createdAt:        string;
  updatedAt:        string;
}

export interface ITag {
  _id:        string;
  userId:     string;
  name:       string;
  slug:       string;
  color?:     string;
  global:     boolean;
  usageCount: number;
}

export interface IStudySet {
  _id:       string;
  userId:    string;
  name:      string;
  color:     string;
  deadlines: IDeadline[];
  createdAt: Date;
}

export interface IDocument {
  _id: string;
  userId: string;
  studySetId: string;
  type: 'pdf' | 'note';
  title: string;
  storageUri?: string;
  blockNoteJson?: object;
  ingestionStatus: 'pending' | 'processing' | 'ready' | 'failed';
  vectorChunkIds: string[];
  createdAt: Date;
}

export interface IFlashcard {
  _id: string;
  userId: string;
  studySetId: string;
  cardType: 'basic' | 'bidirectional' | 'cloze';
  front: string;
  back: string;
  clozeBody?: string;
  clozeNumber?: number;
  bidirectional?: boolean;
  isBidirectional?: boolean;
  tags: string[];
  sourceDocumentId?: string;
  sourceChunkId?: string;
  createdAt: Date;
}

export interface ISpacedRepetition {
  _id: string;
  flashcardId: string;
  userId: string;
  easeFactor: number;
  interval: number;
  repetitions: number;
  dueAt: Date;
  lastReviewedAt: Date;
}
