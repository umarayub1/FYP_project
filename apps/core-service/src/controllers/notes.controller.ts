import { Types } from 'mongoose';
import { Note, NoteDoc } from '../models/Note';
import { scheduleNoteReindex, deleteNoteFromIndex } from '../services/notesIndexer';

export async function listNotes(
  userId: string,
  studySetId: string,
  parentNoteId?: string | null,
): Promise<NoteDoc[]> {
  const query: Record<string, unknown> = {
    userId:    new Types.ObjectId(userId),
    studySetId: new Types.ObjectId(studySetId),
  };
  if (parentNoteId !== undefined) {
    // explicit filter: null means root notes, string means children of that note
    query.parentNoteId = parentNoteId === 'null' || parentNoteId === null
      ? null
      : new Types.ObjectId(parentNoteId);
  }
  return Note.find(query).sort({ createdAt: -1 }).lean() as unknown as NoteDoc[];
}

export async function getNote(id: string, userId: string, studySetId: string): Promise<NoteDoc | null> {
  return Note.findOne({ _id: id, userId: new Types.ObjectId(userId), studySetId: new Types.ObjectId(studySetId) }).lean() as unknown as NoteDoc | null;
}

export async function createNote(
  userId: string,
  data: { studySetId: string; title: string; parentNoteId?: string | null },
): Promise<NoteDoc> {
  return Note.create({
    userId:       new Types.ObjectId(userId),
    studySetId:   new Types.ObjectId(data.studySetId),
    title:        data.title,
    isCornell:    false,
    tags:         [],
    parentNoteId: data.parentNoteId ? new Types.ObjectId(data.parentNoteId) : null,
  });
}

export async function updateNote(
  id: string,
  userId: string,
  studySetId: string,
  patch: Partial<{
    title:          string;
    content:        unknown;
    isCornell:      boolean;
    cornellCue:     unknown;
    cornellSummary: unknown;
    tags:           string[];
    parentNoteId:   string | null;
  }>,
): Promise<NoteDoc | null> {
  // Cycle prevention: if parentNoteId is being set, walk the parent chain
  if (patch.parentNoteId && patch.parentNoteId !== null) {
    if (patch.parentNoteId === id) {
      throw Object.assign(new Error('Would create a cycle: note cannot be its own parent'), { code: 'CYCLE' });
    }
    let current: string | null = patch.parentNoteId;
    let depth = 0;
    while (current && depth < 100) {
      const parent = await Note.findById(current).select('parentNoteId').lean() as { parentNoteId?: Types.ObjectId | null } | null;
      if (!parent) break;
      const nextId = parent.parentNoteId?.toString() ?? null;
      if (nextId === id) {
        throw Object.assign(new Error('Would create a cycle'), { code: 'CYCLE' });
      }
      current = nextId;
      depth++;
    }
  }

  const updatePatch: Record<string, unknown> = { ...patch };
  if ('parentNoteId' in patch) {
    updatePatch.parentNoteId = patch.parentNoteId ? new Types.ObjectId(patch.parentNoteId) : null;
  }

  const updated = await Note.findOneAndUpdate(
    { _id: id, userId: new Types.ObjectId(userId), studySetId: new Types.ObjectId(studySetId) },
    { $set: updatePatch },
    { new: true, lean: true },
  ) as unknown as NoteDoc | null;

  // Reindex into Chroma so the note is reachable from Coach retrieval.
  // Debounced so frequent autosaves coalesce to a single embed call.
  if (updated && ('content' in patch || 'title' in patch)) {
    scheduleNoteReindex({
      userId,
      studySetId,
      noteId:  id,
      content: (updated as { content?: unknown }).content,
      title:   (updated as { title?: string }).title,
    });
  }

  return updated;
}

export async function deleteNote(id: string, userId: string, studySetId: string): Promise<boolean> {
  const result = await Note.deleteOne({ _id: id, userId: new Types.ObjectId(userId), studySetId: new Types.ObjectId(studySetId) });
  if (result.deletedCount === 1) {
    // Fire-and-forget: a downed ai-engine must not fail the delete.
    void deleteNoteFromIndex({ userId, noteId: id, studySetId });
  }
  return result.deletedCount === 1;
}

/**
 * Append TipTap content blocks to the tail of a note's `content` doc. Used by
 * Plan E.3's Commit modal "Append to existing note" branch.
 *
 * The note's `content` is a TipTap doc-shaped tree `{ type: 'doc', content: [...] }`.
 * We push the new blocks into that array, schedule a Chroma reindex, and
 * return the updated note. If the note's content is empty or BlockNote-shaped
 * (legacy), we replace it with a fresh doc that contains the new blocks.
 */
export async function appendBlocks(
  id: string,
  userId: string,
  studySetId: string,
  blocks: unknown[],
): Promise<NoteDoc | null> {
  if (!Array.isArray(blocks) || blocks.length === 0) return null;
  const existing = await Note.findOne({
    _id: id,
    userId: new Types.ObjectId(userId),
    studySetId: new Types.ObjectId(studySetId),
  }).lean() as { content?: unknown } | null;
  if (!existing) return null;

  let nextContent: { type: 'doc'; content: unknown[] };
  const current = existing.content as { type?: string; content?: unknown[] } | unknown[] | null | undefined;
  if (current && typeof current === 'object' && !Array.isArray(current) && current.type === 'doc' && Array.isArray(current.content)) {
    nextContent = { type: 'doc', content: [...current.content, ...blocks] };
  } else {
    // BlockNote-shaped or empty — start a fresh TipTap doc holding the new blocks.
    nextContent = { type: 'doc', content: blocks };
  }

  const updated = await Note.findOneAndUpdate(
    { _id: id, userId: new Types.ObjectId(userId), studySetId: new Types.ObjectId(studySetId) },
    { $set: { content: nextContent } },
    { new: true, lean: true },
  ) as unknown as NoteDoc | null;

  if (updated) {
    scheduleNoteReindex({
      userId,
      studySetId,
      noteId:  id,
      content: nextContent,
      title:   (updated as { title?: string }).title,
    });
  }
  return updated;
}

// ── Backlinks (E3) ──────────────────────────────────────────────────────────
//
// "What notes link to me?" Two sources:
//   1. `parentNoteId` — a hierarchical subpage relationship (Phase 21.5).
//   2. Inline `noteLink` atoms embedded in the content tree, holding a
//      `childNoteId` attr (Phase 24 / Plan B / E1).
// We scan in-memory after a single Mongo round-trip; at FYP scale (≤ a few
// hundred notes per StudySet) this is well below any latency budget.

export interface BacklinkRef {
  _id: string;
  title: string;
  sourceType: 'parent' | 'inline';
}

// Walk a TipTap content tree looking for nodes that reference `targetId`.
// Captures both `noteLink` atoms (the inline mention chip) and `subpage`
// atoms (the hierarchical card from Phase 21.5). Either counts as a backlink.
function contentReferencesNote(content: unknown, targetId: string): boolean {
  if (!content || typeof content !== 'object') return false;
  const node = content as { type?: string; attrs?: Record<string, unknown>; content?: unknown };
  if (node.type === 'noteLink' || node.type === 'subpage') {
    const childId = node.attrs?.childNoteId;
    if (typeof childId === 'string' && childId === targetId) return true;
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      if (contentReferencesNote(child, targetId)) return true;
    }
  }
  return false;
}

export async function getBacklinks(
  noteId: string,
  userId: string,
  studySetId: string,
): Promise<BacklinkRef[]> {
  const userOid = new Types.ObjectId(userId);
  const setOid = new Types.ObjectId(studySetId);
  const targetOid = new Types.ObjectId(noteId);

  // Load the target to find its (single) hierarchical parent. `parentNoteId`
  // on the target tells us who owns it; that owner is reported as `parent`
  // type if it exists.
  const target = (await Note.findOne({
    _id: targetOid,
    userId: userOid,
    studySetId: setOid,
  })
    .select('parentNoteId')
    .lean()) as { parentNoteId?: Types.ObjectId | null } | null;

  let parent: { _id: Types.ObjectId; title: string } | null = null;
  if (target?.parentNoteId) {
    parent = (await Note.findOne({
      _id: target.parentNoteId,
      userId: userOid,
      studySetId: setOid,
    })
      .select('_id title')
      .lean()) as { _id: Types.ObjectId; title: string } | null;
  }

  // Inline backlinks — fetch every other note in the set and walk the content
  // tree(s). Cornell cue / summary are scanned too.
  const candidates = (await Note.find({
    userId: userOid,
    studySetId: setOid,
    _id: { $ne: targetOid },
  })
    .select('_id title content cornellCue cornellSummary')
    .lean()) as Array<{
      _id: Types.ObjectId;
      title: string;
      content?: unknown;
      cornellCue?: unknown;
      cornellSummary?: unknown;
    }>;

  const inlineMatches = candidates.filter(n =>
    contentReferencesNote(n.content, noteId) ||
    contentReferencesNote(n.cornellCue, noteId) ||
    contentReferencesNote(n.cornellSummary, noteId),
  );

  // Merge + dedupe by `_id`. A note appearing as BOTH the hierarchical parent
  // and an inline reference is reported as `parent` (the stronger
  // relationship).
  const byId = new Map<string, BacklinkRef>();
  if (parent) {
    byId.set(String(parent._id), {
      _id: String(parent._id),
      title: parent.title,
      sourceType: 'parent',
    });
  }
  for (const m of inlineMatches) {
    const id = String(m._id);
    if (byId.has(id)) continue;
    byId.set(id, { _id: id, title: m.title, sourceType: 'inline' });
  }
  return Array.from(byId.values()).sort((a, b) => a.title.localeCompare(b.title));
}

export async function bulkDeleteNotes(
  ids: string[],
  userId: string,
  studySetId: string,
): Promise<number> {
  const result = await Note.deleteMany({
    _id:        { $in: ids },
    userId:     new Types.ObjectId(userId),
    studySetId: new Types.ObjectId(studySetId),
  });
  // Fire-and-forget index cleanup for each deleted note
  for (const noteId of ids) {
    void deleteNoteFromIndex({ userId, noteId, studySetId });
  }
  return result.deletedCount;
}

export async function bulkMoveNotes(
  ids: string[],
  userId: string,
  fromStudySetId: string,
  toStudySetId: string,
): Promise<number> {
  const result = await Note.updateMany(
    {
      _id:        { $in: ids },
      userId:     new Types.ObjectId(userId),
      studySetId: new Types.ObjectId(fromStudySetId),
    },
    { $set: { studySetId: new Types.ObjectId(toStudySetId), parentNoteId: null } },
  );
  return result.modifiedCount;
}

export async function moveNoteToSet(
  id: string,
  userId: string,
  fromStudySetId: string,
  toStudySetId: string,
): Promise<NoteDoc | null> {
  // Move the note and orphan any subpages so they don't dangle across sets.
  // Subpage migration would need a separate UI flow; for now drop parent link.
  const moved = await Note.findOneAndUpdate(
    {
      _id: id,
      userId: new Types.ObjectId(userId),
      studySetId: new Types.ObjectId(fromStudySetId),
    },
    {
      $set: {
        studySetId: new Types.ObjectId(toStudySetId),
        parentNoteId: null,
      },
    },
    { new: true, lean: true },
  ) as unknown as NoteDoc | null;
  if (moved) {
    await Note.updateMany(
      { userId: new Types.ObjectId(userId), parentNoteId: new Types.ObjectId(id) },
      { $set: { parentNoteId: null } },
    );
    // Old chunks live under the previous study_set_id metadata, which would
    // exclude the note from scoped retrieval in its new home. Reindex.
    scheduleNoteReindex({
      userId,
      studySetId: toStudySetId,
      noteId:     id,
      content:    (moved as { content?: unknown }).content,
      title:      (moved as { title?: string }).title,
    });
  }
  return moved;
}
