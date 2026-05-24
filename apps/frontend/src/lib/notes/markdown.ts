// Lossy markdown serializer for BlockNote / TipTap JSON content. Handles
// the subset of blocks the editor produces today: paragraph, heading,
// bullet/numbered lists, quote, code block, inline marks (bold/italic/code).
// Everything else falls back to plain text so we never lose content.

type Node = {
  type?:    string;
  text?:    string;
  attrs?:   Record<string, unknown> | null;
  marks?:   { type?: string; attrs?: Record<string, unknown> | null }[];
  content?: unknown;
  children?: unknown;
  styles?:  Record<string, unknown>;
  props?:   Record<string, unknown>;
};

function walk(nodes: unknown, depth = 0, ordered = false, idx = 0): string {
  if (!Array.isArray(nodes)) return '';
  const out: string[] = [];
  nodes.forEach((raw, i) => {
    if (!raw || typeof raw !== 'object') return;
    const node = raw as Node;
    out.push(blockToMd(node, depth, ordered, idx + i + 1));
  });
  return out.filter(Boolean).join('\n\n');
}

function blockToMd(node: Node, depth: number, ordered: boolean, index: number): string {
  const indent = '  '.repeat(Math.max(0, depth));
  const inner  = inlineToMd(node.content ?? node.children);
  const type   = node.type ?? '';
  switch (type) {
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number((node.attrs ?? node.props ?? {}).level ?? 1)));
      return `${'#'.repeat(level)} ${inner}`;
    }
    case 'paragraph':
      return `${indent}${inner}`;
    case 'bulletListItem':
    case 'bullet_list_item':
    case 'bulletList':
      return `${indent}- ${inner}`;
    case 'numberedListItem':
    case 'ordered_list_item':
    case 'orderedList':
      return `${indent}${index}. ${inner}`;
    case 'quote':
    case 'blockquote':
      return `${indent}> ${inner}`;
    case 'codeBlock':
    case 'code_block': {
      const lang = String((node.attrs ?? node.props ?? {}).language ?? '');
      return `\`\`\`${lang}\n${inner}\n\`\`\``;
    }
    case 'horizontalRule':
    case 'horizontal_rule':
      return '---';
    case 'bulletListGroup':
    case 'orderedListGroup':
      return walk(node.content ?? node.children, depth, type.startsWith('ordered'), 0);
    default:
      // Unknown block — emit its inline content as a paragraph so we don't
      // silently drop user text.
      return `${indent}${inner}`;
  }
}

function inlineToMd(content: unknown): string {
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  content.forEach(raw => {
    if (!raw || typeof raw !== 'object') return;
    const node = raw as Node;
    if (node.type === 'text' || typeof node.text === 'string') {
      const marks = node.marks ?? [];
      let text = String(node.text ?? '');
      // Apply BlockNote `styles` map (bold/italic/code/strike) when present.
      const styles = node.styles ?? {};
      const isBold   = marks.some(m => m.type === 'bold')   || styles.bold;
      const isItalic = marks.some(m => m.type === 'italic') || styles.italic;
      const isCode   = marks.some(m => m.type === 'code')   || styles.code;
      const isStrike = marks.some(m => m.type === 'strike') || styles.strike;
      const linkMark = marks.find(m => m.type === 'link');
      if (isCode)   text = `\`${text}\``;
      if (isBold)   text = `**${text}**`;
      if (isItalic) text = `*${text}*`;
      if (isStrike) text = `~~${text}~~`;
      const href = linkMark?.attrs?.href;
      if (typeof href === 'string') text = `[${text}](${href})`;
      parts.push(text);
    } else if (Array.isArray(node.content)) {
      parts.push(inlineToMd(node.content));
    }
  });
  return parts.join('');
}

export function blocksToMarkdown(content: unknown): string {
  if (!content) return '';
  return walk(content);
}

export function downloadMarkdown(filename: string, body: string): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([body], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
