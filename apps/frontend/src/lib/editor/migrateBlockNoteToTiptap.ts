// Read-time migration: BlockNote JSON → TipTap JSON.
//
// BlockNote stores `Note.content` as a top-level array of blocks. TipTap stores
// a `{ type: 'doc', content: [...] }` root node. Notes written prior to this
// phase will arrive in BlockNote shape; new writes will arrive in TipTap shape.
// `coerceToTiptapDoc` recognises both and always returns a TipTap doc.
//
// Coverage: paragraph, heading, bulletListItem/numberedListItem, codeBlock,
// quote, math (custom), subpage (custom). Unknown node types degrade to a
// paragraph containing the inline text we can recover.

type TipTapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
};

type TipTapDoc = { type: 'doc'; content: TipTapNode[] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BNBlock = any;

interface BNInline {
  type: string;
  text?: string;
  styles?: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props?: Record<string, any>;
}

const EMPTY_DOC: TipTapDoc = { type: 'doc', content: [{ type: 'paragraph' }] };

function isBlockNoteArray(input: unknown): input is BNBlock[] {
  if (!Array.isArray(input)) return false;
  if (input.length === 0) return true;
  const first = input[0] as Record<string, unknown> | null;
  if (!first || typeof first !== 'object') return false;
  // BlockNote blocks have a top-level `type` string and usually `props` / `content` array
  return typeof first.type === 'string' && ('props' in first || 'content' in first);
}

function isTiptapDoc(input: unknown): input is TipTapDoc {
  if (!input || typeof input !== 'object') return false;
  const obj = input as Record<string, unknown>;
  return obj.type === 'doc' && Array.isArray(obj.content);
}

function bnInlineToTiptap(items: BNInline[] | undefined): TipTapNode[] {
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
      out.push({
        type: 'text',
        text: item.text,
        ...(marks.length > 0 ? { marks } : {}),
      });
      continue;
    }
    if (item.type === 'link' && Array.isArray((item as { content?: BNInline[] }).content)) {
      const inner = bnInlineToTiptap((item as { content?: BNInline[] }).content);
      const href = (item as { href?: string }).href ?? '';
      out.push(
        ...inner.map(n => ({
          ...n,
          marks: [...(n.marks ?? []), { type: 'link', attrs: { href } }],
        })),
      );
      continue;
    }
    if (item.type === 'mathInline' && item.props?.source) {
      // Render inline math as a textual `$src$` placeholder until the math
      // extension lands and re-parses these. Keeps content visible.
      out.push({ type: 'text', text: `$${String(item.props.source)}$` });
      continue;
    }
  }
  return out;
}

function bnBlockToTiptap(block: BNBlock): TipTapNode | TipTapNode[] | null {
  if (!block || typeof block !== 'object') return null;
  const type = String(block.type ?? 'paragraph');
  const inline = bnInlineToTiptap(block.content);
  const children: TipTapNode[] | undefined = Array.isArray(block.children)
    ? (block.children
        .map(bnBlockToTiptap)
        .flat()
        .filter(Boolean) as TipTapNode[])
    : undefined;

  switch (type) {
    case 'paragraph':
      return { type: 'paragraph', ...(inline.length > 0 ? { content: inline } : {}) };

    case 'heading': {
      const level = Math.min(3, Math.max(1, Number(block.props?.level ?? 1)));
      return {
        type: 'heading',
        attrs: { level },
        ...(inline.length > 0 ? { content: inline } : {}),
      };
    }

    case 'bulletListItem':
    case 'numberedListItem': {
      // BlockNote stores each list item as a separate block; the migrator emits
      // standalone listItem nodes. A post-pass groups consecutive items.
      const para: TipTapNode = {
        type: 'paragraph',
        ...(inline.length > 0 ? { content: inline } : {}),
      };
      const li: TipTapNode = {
        type: 'listItem',
        content: [para, ...(children ?? [])],
        attrs: { __listKind: type === 'numberedListItem' ? 'ordered' : 'bullet' },
      };
      return li;
    }

    case 'codeBlock': {
      const language = String(block.props?.language ?? 'plaintext');
      return {
        type: 'codeBlock',
        attrs: { language },
        ...(inline.length > 0 ? { content: inline } : {}),
      };
    }

    case 'quote':
      return {
        type: 'blockquote',
        content: [{ type: 'paragraph', ...(inline.length > 0 ? { content: inline } : {}) }],
      };

    case 'math': {
      const source = String(block.props?.source ?? '');
      // Until the math extension lands, drop math down to a code block so the
      // source stays visible and round-trippable.
      return {
        type: 'codeBlock',
        attrs: { language: 'latex' },
        content: source ? [{ type: 'text', text: source }] : undefined,
      };
    }

    case 'subpage': {
      const childNoteId = String(block.props?.childNoteId ?? '');
      const childTitle = String(block.props?.childTitle ?? 'Untitled');
      return {
        type: 'subpage',
        attrs: { childNoteId, childTitle },
      };
    }

    default:
      return { type: 'paragraph', ...(inline.length > 0 ? { content: inline } : {}) };
  }
}

function groupConsecutiveListItems(nodes: TipTapNode[]): TipTapNode[] {
  const out: TipTapNode[] = [];
  let bucket: TipTapNode[] | null = null;
  let bucketKind: 'bullet' | 'ordered' | null = null;

  function flush(): void {
    if (bucket && bucketKind) {
      out.push({
        type: bucketKind === 'ordered' ? 'orderedList' : 'bulletList',
        content: bucket,
      });
    }
    bucket = null;
    bucketKind = null;
  }

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

export function coerceToTiptapDoc(input: unknown): TipTapDoc {
  if (input === null || input === undefined) return EMPTY_DOC;
  if (isTiptapDoc(input)) {
    // Already TipTap shape — accept as-is.
    return input;
  }
  if (isBlockNoteArray(input)) {
    const mapped: TipTapNode[] = [];
    for (const block of input) {
      const res = bnBlockToTiptap(block);
      if (!res) continue;
      if (Array.isArray(res)) mapped.push(...res);
      else mapped.push(res);
    }
    const grouped = groupConsecutiveListItems(mapped);
    return {
      type: 'doc',
      content: grouped.length > 0 ? grouped : [{ type: 'paragraph' }],
    };
  }
  return EMPTY_DOC;
}

export function isEmptyTiptapDoc(
  doc: { type?: string; content?: { type?: string; content?: unknown[] }[] } | null | undefined,
): boolean {
  if (!doc || !Array.isArray(doc.content)) return true;
  if (doc.content.length === 0) return true;
  if (doc.content.length === 1) {
    const only = doc.content[0];
    if (only?.type === 'paragraph' && (!only.content || only.content.length === 0)) return true;
  }
  return false;
}
