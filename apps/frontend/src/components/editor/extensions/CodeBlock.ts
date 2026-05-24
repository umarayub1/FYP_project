// Code block extension configured with lowlight syntax highlighting.
//
// Languages registered: js, ts, py, sql, md, plaintext. Anything else falls
// back to plaintext, which is lowlight's default behaviour.
//
// The github-dark.css theme drives token colours. The host imports it via
// `TipTapEditorImpl.tsx` so it ships in the editor chunk only.

import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { createLowlight } from 'lowlight';
import { CodeBlockNodeView } from '../CodeBlockNodeView';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import markdown from 'highlight.js/lib/languages/markdown';
import plaintext from 'highlight.js/lib/languages/plaintext';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml'; // html lives here in highlight.js
import css from 'highlight.js/lib/languages/css';
import cpp from 'highlight.js/lib/languages/cpp';
import c from 'highlight.js/lib/languages/c';
import java from 'highlight.js/lib/languages/java';
import rust from 'highlight.js/lib/languages/rust';
import go from 'highlight.js/lib/languages/go';

const lowlight = createLowlight();
lowlight.register('javascript', javascript);
lowlight.register('js', javascript);
lowlight.register('typescript', typescript);
lowlight.register('ts', typescript);
lowlight.register('python', python);
lowlight.register('py', python);
lowlight.register('sql', sql);
lowlight.register('markdown', markdown);
lowlight.register('md', markdown);
lowlight.register('plaintext', plaintext);
lowlight.register('text', plaintext);
lowlight.register('bash', bash);
lowlight.register('sh', bash);
lowlight.register('shell', bash);
lowlight.register('json', json);
lowlight.register('html', xml);
lowlight.register('xml', xml);
lowlight.register('css', css);
lowlight.register('cpp', cpp);
lowlight.register('c++', cpp);
lowlight.register('c', c);
lowlight.register('java', java);
lowlight.register('rust', rust);
lowlight.register('rs', rust);
lowlight.register('go', go);

export const CodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView);
  },
}).configure({
  lowlight,
  defaultLanguage: 'plaintext',
  HTMLAttributes: {
    class: 'tiptap-code-block',
  },
});
