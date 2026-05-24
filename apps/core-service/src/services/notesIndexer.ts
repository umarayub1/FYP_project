/**
 * Debounced indexer that POSTs note text to the ai-engine for Chroma
 * upsert. Coalesces rapid edits (per noteId) into a single flush 3 s after
 * the last write so frequent typing doesn't hammer the embedding API.
 *
 * Plan F.2: notes must be searchable by Coach. The write path is the
 * existing `updateNote` controller; this module is its async tail. We
 * fire-and-forget — a downed ai-engine must not fail the user's save.
 */

const AI_ENGINE_URL    = process.env.AI_ENGINE_URL    || 'http://ai-engine:8000';
const INTERNAL_SECRET  = process.env.INTERNAL_SECRET  || '';
const DEBOUNCE_MS      = 3000;

interface PendingIndex {
  timer:      ReturnType<typeof setTimeout>;
  userId:     string;
  studySetId: string;
  noteId:     string;
  plainText:  string;
  title:      string | undefined;
}

const pending = new Map<string, PendingIndex>();

/** Walk a TipTap/ProseMirror JSON tree and concatenate all `text` leaves. */
export function extractPlainText(content: unknown): string {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (typeof content !== 'object') return '';
  const node = content as { type?: string; text?: string; content?: unknown[] };
  let acc = '';
  if (typeof node.text === 'string') acc += node.text + ' ';
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      acc += extractPlainText(child);
    }
  }
  return acc;
}

async function flush(entry: PendingIndex): Promise<void> {
  pending.delete(entry.noteId);
  try {
    await fetch(`${AI_ENGINE_URL}/internal/index-note`, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-internal-secret': INTERNAL_SECRET,
      },
      body: JSON.stringify({
        user_id:      entry.userId,
        study_set_id: entry.studySetId,
        note_id:      entry.noteId,
        plain_text:   entry.plainText,
        title:        entry.title ?? null,
      }),
    });
  } catch (err) {
    console.warn('[notesIndexer] index-note failed:', (err as Error).message);
  }
}

/**
 * Schedule a Chroma reindex for a note. Repeated calls within DEBOUNCE_MS
 * coalesce — the latest call wins (newest title/content used at flush).
 */
export function scheduleNoteReindex(args: {
  userId:     string;
  studySetId: string;
  noteId:     string;
  content:    unknown;
  title?:     string;
}): void {
  const plainText = extractPlainText(args.content).replace(/\s+/g, ' ').trim();

  const existing = pending.get(args.noteId);
  if (existing) {
    clearTimeout(existing.timer);
  }

  const entry: PendingIndex = {
    userId:     args.userId,
    studySetId: args.studySetId,
    noteId:     args.noteId,
    plainText,
    title:      args.title,
    timer:      setTimeout(() => { void flush(entry); }, DEBOUNCE_MS),
  };
  pending.set(args.noteId, entry);
}

/**
 * Drop a note from Chroma. Best-effort: we want the delete to land even
 * if the ai-engine is briefly down. Cancels any pending reindex for the
 * same note so we don't re-create stale chunks after deletion.
 */
export async function deleteNoteFromIndex(args: {
  userId:      string;
  noteId:      string;
  studySetId?: string;
}): Promise<void> {
  const pendingEntry = pending.get(args.noteId);
  if (pendingEntry) {
    clearTimeout(pendingEntry.timer);
    pending.delete(args.noteId);
  }
  try {
    await fetch(`${AI_ENGINE_URL}/internal/chunks/delete-note`, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-internal-secret': INTERNAL_SECRET,
      },
      body: JSON.stringify({
        user_id:      args.userId,
        note_id:      args.noteId,
        study_set_id: args.studySetId ?? null,
      }),
    });
  } catch (err) {
    console.warn('[notesIndexer] delete-note failed:', (err as Error).message);
  }
}
