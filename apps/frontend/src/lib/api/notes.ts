import { gatewayGet, gatewayPost, gatewayPatch, gatewayDelete } from './gateway';

export interface Note {
  _id:            string;
  studySetId:     string;
  title:          string;
  content:        unknown;       // BlockNote JSON
  isCornell:      boolean;
  cornellCue?:    unknown;
  cornellSummary?: unknown;
  cornellScore?:  number | null;
  scoreHistory?:  { score: number; timestamp: string }[];
  tags:           string[];
  parentNoteId?:  string | null;
  stagedBlocks?:  unknown[];
  createdAt:      string;
  updatedAt:      string;
}

export async function getNotes(studySetId: string, parentNoteId?: string): Promise<Note[]> {
  const param = parentNoteId !== undefined ? `?parentNoteId=${encodeURIComponent(parentNoteId)}` : '';
  return gatewayGet<Note[]>(`/study-sets/${studySetId}/notes${param}`);
}

export async function getNote(noteId: string, studySetId: string): Promise<Note> {
  return gatewayGet<Note>(`/notes/${noteId}?studySetId=${encodeURIComponent(studySetId)}`);
}

export interface BacklinkRef {
  _id: string;
  title: string;
  sourceType: 'parent' | 'inline';
}

export async function getNoteBacklinks(
  noteId: string,
  studySetId: string,
): Promise<BacklinkRef[]> {
  return gatewayGet<BacklinkRef[]>(
    `/notes/${noteId}/backlinks?studySetId=${encodeURIComponent(studySetId)}`,
  );
}

export async function getChildNotes(studySetId: string, parentNoteId: string): Promise<Note[]> {
  return getNotes(studySetId, parentNoteId);
}

export async function createNote(
  studySetId: string,
  title: string,
  parentNoteId?: string,
): Promise<Note> {
  return gatewayPost<Note>(`/study-sets/${studySetId}/notes`, {
    title,
    ...(parentNoteId ? { parentNoteId } : {}),
  });
}

export async function updateNote(
  noteId: string,
  studySetId: string,
  patch: Partial<Omit<Note, '_id' | 'studySetId' | 'createdAt'>>,
): Promise<Note> {
  return gatewayPatch<Note>(`/notes/${noteId}`, { studySetId, ...patch });
}

export async function deleteNote(noteId: string, studySetId: string): Promise<void> {
  return gatewayDelete(`/notes/${noteId}?studySetId=${encodeURIComponent(studySetId)}`);
}

export async function moveNote(
  noteId: string,
  fromStudySetId: string,
  toStudySetId: string,
): Promise<Note> {
  return gatewayPost<Note>(`/notes/${noteId}/move`, { fromStudySetId, toStudySetId });
}

export async function scoreCornellNote(studySetId: string, noteId: string, score: number): Promise<Note> {
  return gatewayPost<Note>(`/study-sets/${studySetId}/cornell/${noteId}/score`, { score });
}

/**
 * Append TipTap content blocks to the end of an existing note. Backs the
 * "Append to existing note" branch of the Commit modal (Plan E.3).
 */
export async function appendToNote(
  noteId: string,
  studySetId: string,
  blocks: unknown[],
): Promise<Note> {
  return gatewayPost<Note>(`/notes/${noteId}/append`, { studySetId, blocks });
}

export async function bulkDeleteNotes(
  ids: string[],
  studySetId: string,
): Promise<{ deleted: number }> {
  return gatewayPost<{ deleted: number }>('/notes/bulk-delete', { ids, studySetId });
}

export async function bulkMoveNotes(
  ids: string[],
  fromStudySetId: string,
  toStudySetId: string,
): Promise<{ moved: number }> {
  return gatewayPost<{ moved: number }>('/notes/bulk-move', { ids, fromStudySetId, toStudySetId });
}
