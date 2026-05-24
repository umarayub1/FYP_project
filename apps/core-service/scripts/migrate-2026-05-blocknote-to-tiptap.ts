// Batch migration: BlockNote JSON → TipTap JSON for every note.
//
// The read-time shim in `apps/frontend/src/lib/editor/migrateBlockNoteToTiptap.ts`
// already handles unmigrated content at hydrate time, so for FYP scale this
// script is optional. Run it if you want to eliminate the per-open shim cost
// or you're about to delete the legacy BlockNote dep entirely.
//
// The script is idempotent: notes already in TipTap shape are skipped, and
// re-running over an already-migrated set is a no-op.

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Inline copy of the shim used on the frontend. Keeping the migrator
// self-contained avoids a build-time dep on the Next app.

type TipTapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
};
type TipTapDoc = { type: 'doc'; content: TipTapNode[] };

/* eslint-disable @typescript-eslint/no-explicit-any */

const EMPTY_DOC: TipTapDoc = { type: 'doc', content: [{ type: 'paragraph' }] };

function isBlockNoteArray(input: any): input is any[] {
  if (!Array.isArray(input)) return false;
  if (input.length === 0) return true;
  const first = input[0];
  if (!first || typeof first !== 'object') return false;
  return typeof first.type === 'string' && ('props' in first || 'content' in first);
}

function isTiptapDoc(input: any): input is TipTapDoc {
  return input && typeof input === 'object' && input.type === 'doc' && Array.isArray(input.content);
}

function bnInlineToTiptap(items: any[] | undefined): TipTapNode[] {
  if (!Array.isArray(items)) return [];
  const out: TipTapNode[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    if (item.type === 'text' && typeof item.text === 'string' && item.text.length > 0) {
      const marks: TipTapNode['marks'] = [];
      const styles = item.styles ?? {};
      if (styles.bold) marks.push({ type: 'bold' });
      if (styles.italic) marks.push({ type: 'italic' });
      if (styles.underline) marks.push({ type: 'underline' });
      if (styles.strike) marks.push({ type: 'strike' });
      if (styles.code) marks.push({ type: 'code' });
      out.push({ type: 'text', text: item.text, ...(marks.length ? { marks } : {}) });
      continue;
    }
    if (item.type === 'link' && Array.isArray(item.content)) {
      const inner = bnInlineToTiptap(item.content);
      const href = item.href ?? '';
      out.push(
        ...inner.map(n => ({
          ...n,
          marks: [...(n.marks ?? []), { type: 'link', attrs: { href } }],
        })),
      );
      continue;
    }
    if (item.type === 'mathInline' && item.props?.source) {
      out.push({ type: 'text', text: `$${String(item.props.source)}$` });
    }
  }
  return out;
}

function bnBlockToTiptap(block: any): TipTapNode | null {
  if (!block || typeof block !== 'object') return null;
  const type = String(block.type ?? 'paragraph');
  const inline = bnInlineToTiptap(block.content);

  switch (type) {
    case 'paragraph':
      return { type: 'paragraph', ...(inline.length ? { content: inline } : {}) };
    case 'heading': {
      const level = Math.min(3, Math.max(1, Number(block.props?.level ?? 1)));
      return { type: 'heading', attrs: { level }, ...(inline.length ? { content: inline } : {}) };
    }
    case 'bulletListItem':
    case 'numberedListItem': {
      const para: TipTapNode = { type: 'paragraph', ...(inline.length ? { content: inline } : {}) };
      return {
        type: 'listItem',
        content: [para],
        attrs: { __listKind: type === 'numberedListItem' ? 'ordered' : 'bullet' },
      };
    }
    case 'codeBlock': {
      const language = String(block.props?.language ?? 'plaintext');
      return { type: 'codeBlock', attrs: { language }, ...(inline.length ? { content: inline } : {}) };
    }
    case 'quote':
      return {
        type: 'blockquote',
        content: [{ type: 'paragraph', ...(inline.length ? { content: inline } : {}) }],
      };
    case 'math': {
      const source = String(block.props?.source ?? '');
      return {
        type: 'codeBlock',
        attrs: { language: 'latex' },
        content: source ? [{ type: 'text', text: source }] : undefined,
      };
    }
    case 'subpage': {
      return {
        type: 'subpage',
        attrs: {
          childNoteId: String(block.props?.childNoteId ?? ''),
          childTitle: String(block.props?.childTitle ?? 'Untitled'),
        },
      };
    }
    default:
      return { type: 'paragraph', ...(inline.length ? { content: inline } : {}) };
  }
}

function groupConsecutiveListItems(nodes: TipTapNode[]): TipTapNode[] {
  const out: TipTapNode[] = [];
  let bucket: TipTapNode[] | null = null;
  let bucketKind: 'bullet' | 'ordered' | null = null;
  const flush = (): void => {
    if (bucket && bucketKind) {
      out.push({
        type: bucketKind === 'ordered' ? 'orderedList' : 'bulletList',
        content: bucket,
      });
    }
    bucket = null;
    bucketKind = null;
  };
  for (const node of nodes) {
    if (node.type === 'listItem') {
      const kind = (node.attrs?.__listKind ?? 'bullet') as 'bullet' | 'ordered';
      const cleanItem: TipTapNode = { type: 'listItem', content: node.content ?? [] };
      if (bucket && bucketKind === kind) {
        bucket.push(cleanItem);
      } else {
        flush();
        bucket = [cleanItem];
        bucketKind = kind;
      }
    } else {
      flush();
      out.push(node);
    }
  }
  flush();
  return out;
}

function coerceToTiptapDoc(input: unknown): TipTapDoc {
  if (input == null) return EMPTY_DOC;
  if (isTiptapDoc(input)) return input as TipTapDoc;
  if (isBlockNoteArray(input)) {
    const mapped: TipTapNode[] = [];
    for (const block of input as any[]) {
      const res = bnBlockToTiptap(block);
      if (res) mapped.push(res);
    }
    const grouped = groupConsecutiveListItems(mapped);
    return { type: 'doc', content: grouped.length ? grouped : [{ type: 'paragraph' }] };
  }
  return EMPTY_DOC;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const notes = mongoose.connection.collection('notes');
  const cursor = notes.find({});
  let migrated = 0;
  let skipped = 0;
  let scanned = 0;

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    if (!doc) break;
    scanned++;
    const patch: Record<string, unknown> = {};
    let touched = false;
    for (const field of ['content', 'cornellCue', 'cornellSummary'] as const) {
      const value = doc[field];
      if (value == null) continue;
      if (isTiptapDoc(value)) continue;
      if (!isBlockNoteArray(value)) continue;
      patch[field] = coerceToTiptapDoc(value);
      touched = true;
    }
    if (!touched) {
      skipped++;
      continue;
    }
    await notes.updateOne({ _id: doc._id }, { $set: patch });
    migrated++;
  }

  console.log(`Scanned ${scanned} notes — migrated ${migrated}, skipped ${skipped}`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
