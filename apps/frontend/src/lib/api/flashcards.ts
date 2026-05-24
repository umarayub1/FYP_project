import { gatewayGet, gatewayPost, gatewayPatch, gatewayDelete } from './gateway';

export interface Flashcard {
  _id:              string;
  userId:           string;
  studySetId:       string;
  cardType:         'basic' | 'bidirectional' | 'cloze';
  front:            string;
  back:             string;
  cloze?:           string;
  clozeBody?:       string;
  clozeNumber?:     number;
  bidirectional?:   boolean;
  isBidirectional?: boolean;
  tags:             string[];
  sourceDocumentId?: string;
  sourceTitle?:     string;
  sourcePage?:      number;
  suspended?:       boolean;
  isLeech?:         boolean;
  againCount?:      number;
  lapses?:          number;
  // SM-2 fields (from SpacedRepetition collection, joined on list endpoint)
  dueDate?:         string;
  interval?:        number;
  easeFactor?:      number;
  repetitions?:     number;
}

export interface FlashcardCreatePayload {
  studySetId:      string;
  cardType?:       'basic' | 'bidirectional' | 'cloze';
  front?:          string;
  back?:           string;
  clozeBody?:      string;
  bidirectional?:  boolean;
  tags?:           string[];
  sourceDocumentId?: string;
  sourceTitle?:    string;
  sourcePage?:     number;
}

export interface FlashcardUpdatePayload {
  cardType?:       'basic' | 'bidirectional' | 'cloze';
  front?:          string;
  back?:           string;
  clozeBody?:      string;
  bidirectional?:  boolean;
  tags?:           string[];
  sourceDocumentId?: string;
  sourceTitle?:    string;
  sourcePage?:     number;
}

export interface FlashcardListResponse {
  cards:    Flashcard[];
  dueCount: number;
  total:    number;
}

export async function getFlashcards(studySetId: string): Promise<FlashcardListResponse> {
  const cards = await gatewayGet<Flashcard[]>(
    `/flashcards?studySetId=${encodeURIComponent(studySetId)}`
  );
  const now = new Date().toISOString();
  const dueCount = cards.filter(c => !c.dueDate || c.dueDate <= now).length;
  return { cards, dueCount, total: cards.length };
}

export async function getDueFlashcards(studySetId: string): Promise<Flashcard[]> {
  const { cards } = await getFlashcards(studySetId);
  const now = new Date().toISOString();
  return cards.filter(c => !c.dueDate || c.dueDate <= now);
}

export async function createFlashcard(studySetId: string, data: Omit<FlashcardCreatePayload, 'studySetId'>): Promise<Flashcard> {
  return gatewayPost<Flashcard>('/flashcards', { studySetId, ...data });
}

export async function updateFlashcard(cardId: string, studySetId: string, data: FlashcardUpdatePayload): Promise<Flashcard> {
  return gatewayPatch<Flashcard>(`/flashcards/${cardId}`, { studySetId, ...data });
}

export async function deleteFlashcard(cardId: string, studySetId: string): Promise<void> {
  return gatewayDelete(`/flashcards/${cardId}?studySetId=${encodeURIComponent(studySetId)}`);
}

export async function suspendFlashcard(cardId: string, studySetId: string): Promise<void> {
  return gatewayPatch<void>(`/flashcards/${cardId}/suspend`, { studySetId });
}

export async function getCramFlashcards(studySetId: string): Promise<Flashcard[]> {
  return gatewayGet<Flashcard[]>(
    `/flashcards/queue?studySetId=${encodeURIComponent(studySetId)}&cram=true`
  );
}

export async function getLeechCount(): Promise<number> {
  const data = await gatewayGet<{ count: number }>('/flashcards/leech-count');
  return data.count;
}

export async function bulkDeleteFlashcards(
  ids: string[],
  studySetId: string,
): Promise<{ deleted: number }> {
  return gatewayPost<{ deleted: number }>('/flashcards/bulk-delete', { ids, studySetId });
}

export async function bulkTagFlashcards(
  ids: string[],
  studySetId: string,
  tags: string[],
  mode: 'add' | 'remove',
): Promise<{ modified: number }> {
  return gatewayPost<{ modified: number }>('/flashcards/bulk-tag', { ids, studySetId, tags, mode });
}

export async function bulkMoveFlashcards(
  ids: string[],
  fromStudySetId: string,
  toStudySetId: string,
): Promise<{ moved: number }> {
  return gatewayPost<{ moved: number }>('/flashcards/bulk-move', { ids, fromStudySetId, toStudySetId });
}
