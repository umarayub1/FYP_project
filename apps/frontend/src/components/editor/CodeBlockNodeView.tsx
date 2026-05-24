'use client';

import { useMemo } from 'react';
import {
  NodeViewWrapper,
  NodeViewContent,
  type NodeViewProps,
} from '@tiptap/react';
import { ChevronDown } from 'lucide-react';

// The subset of languages we've registered in `lowlight` (see CodeBlock.ts).
// Anything else falls back to plaintext — the picker just won't surface it.
const LANGUAGES: Array<{ value: string; label: string }> = [
  { value: 'plaintext', label: 'Plain text' },
  { value: 'bash', label: 'Bash' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'css', label: 'CSS' },
  { value: 'go', label: 'Go' },
  { value: 'html', label: 'HTML' },
  { value: 'java', label: 'Java' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'json', label: 'JSON' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'python', label: 'Python' },
  { value: 'rust', label: 'Rust' },
  { value: 'sql', label: 'SQL' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'xml', label: 'XML' },
];

function normaliseLanguage(raw: unknown): string {
  if (typeof raw !== 'string' || !raw) return 'plaintext';
  const alias: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    rs: 'rust',
    sh: 'bash',
    shell: 'bash',
    md: 'markdown',
    'c++': 'cpp',
    text: 'plaintext',
  };
  const lowered = raw.toLowerCase();
  return alias[lowered] ?? lowered;
}

export function CodeBlockNodeView({
  node,
  updateAttributes,
}: NodeViewProps): JSX.Element {
  const language = normaliseLanguage(node.attrs.language);
  const visibleLanguages = useMemo(() => {
    // Surface the current language even if it's not in our canonical list,
    // so renaming the picker on a legacy doc doesn't silently drop the lang.
    if (LANGUAGES.some(l => l.value === language)) return LANGUAGES;
    return [...LANGUAGES, { value: language, label: language }];
  }, [language]);

  return (
    <NodeViewWrapper as="div" className="code-block-wrapper" data-language={language}>
      <div className="code-block-header" contentEditable={false}>
        <span className="code-block-lang-picker">
          <select
            value={language}
            onChange={e => updateAttributes({ language: e.target.value })}
            onMouseDown={e => e.stopPropagation()}
            aria-label="Code language"
          >
            {visibleLanguages.map(l => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        </span>
      </div>
      <pre>
        <NodeViewContent as="code" className={`hljs language-${language}`} />
      </pre>
    </NodeViewWrapper>
  );
}
