/**
 * Snippet catalog for the textarea slash menu.
 *
 * Each snippet has search keywords, a display label, a rendered preview, and
 * an `insert` template. The template may contain a single `$|` marker that
 * the menu replaces with the user's cursor after insertion — handy for things
 * like `\frac{$|}{}` where you want to start typing in the numerator.
 *
 * Used by the Feynman canvas and any other plain-textarea Markdown surface.
 */

export interface Snippet {
  id:       string;
  label:    string;
  keywords: string[];  // lower-case search terms
  category: 'math' | 'structure' | 'cloze' | 'math-bare';
  // Markdown source that gets rendered through renderMarkdownWithMath in the
  // preview pane of the menu. Should be small enough to read in a row.
  preview:  string;
  // What gets dropped into the textarea. `$|` marks the resting cursor spot.
  insert:   string;
}

// Math — vectors, fractions, common operators, Greek letters, relations.
const MATH: Snippet[] = [
  // Vectors
  { id: 'vec-arrow',    label: 'Vector (arrow)',     keywords: ['vector', 'vec', 'arrow'],     category: 'math', preview: '$\\vec{v}$',         insert: '$\\vec{$|}$' },
  { id: 'vec-hat',      label: 'Unit vector (hat)',  keywords: ['vector', 'unit', 'hat'],      category: 'math', preview: '$\\hat{n}$',         insert: '$\\hat{$|}$' },
  { id: 'vec-bold',     label: 'Vector (bold)',      keywords: ['vector', 'bold', 'mathbf'],   category: 'math', preview: '$\\mathbf{F}$',      insert: '$\\mathbf{$|}$' },
  { id: 'vec-bar',      label: 'Bar (mean)',         keywords: ['vector', 'mean', 'bar'],      category: 'math', preview: '$\\bar{x}$',         insert: '$\\bar{$|}$' },
  // Fractions
  { id: 'frac',         label: 'Fraction',           keywords: ['fraction', 'frac', 'divide'], category: 'math', preview: '$\\frac{a}{b}$',     insert: '$\\frac{$|}{}$' },
  { id: 'dfrac',        label: 'Display fraction',   keywords: ['fraction', 'dfrac'],          category: 'math', preview: '$$\\dfrac{a}{b}$$',  insert: '$\\dfrac{$|}{}$' },
  // Powers / subscripts
  { id: 'sqrt',         label: 'Square root',        keywords: ['sqrt', 'square', 'root'],     category: 'math', preview: '$\\sqrt{x}$',        insert: '$\\sqrt{$|}$' },
  { id: 'power',        label: 'Power (superscript)',keywords: ['power', 'super', 'exponent'], category: 'math', preview: '$x^{n}$',            insert: '$x^{$|}$' },
  { id: 'sub',          label: 'Subscript',          keywords: ['subscript', 'index'],         category: 'math', preview: '$x_{n}$',            insert: '$x_{$|}$' },
  // Sums / integrals
  { id: 'sum',          label: 'Summation',          keywords: ['sum', 'sigma', 'series'],     category: 'math', preview: '$\\sum_{i=1}^{n} x_i$',  insert: '$\\sum_{$|}^{}$' },
  { id: 'int',          label: 'Integral',           keywords: ['integral', 'int'],            category: 'math', preview: '$\\int_{a}^{b} f(x)\\,dx$', insert: '$\\int_{$|}^{}$' },
  { id: 'prod',         label: 'Product',            keywords: ['product', 'prod'],            category: 'math', preview: '$\\prod_{i=1}^{n} x_i$', insert: '$\\prod_{$|}^{}$' },
  { id: 'partial',      label: 'Partial derivative', keywords: ['partial', 'derivative'],      category: 'math', preview: '$\\frac{\\partial f}{\\partial x}$', insert: '$\\frac{\\partial $|}{\\partial }$' },
  // Limits / arrows
  { id: 'lim',          label: 'Limit',              keywords: ['limit', 'lim'],               category: 'math', preview: '$\\lim_{x \\to 0}$', insert: '$\\lim_{$|}$' },
  { id: 'infty',        label: 'Infinity',           keywords: ['infinity', 'infty'],          category: 'math', preview: '$\\infty$',          insert: '$\\infty$' },
  // Greek letters (just the most-used in physics; add more as needed)
  { id: 'alpha',        label: 'Alpha α',            keywords: ['alpha'],                      category: 'math', preview: '$\\alpha$',          insert: '$\\alpha$' },
  { id: 'beta',         label: 'Beta β',             keywords: ['beta'],                       category: 'math', preview: '$\\beta$',           insert: '$\\beta$' },
  { id: 'gamma',        label: 'Gamma γ',            keywords: ['gamma'],                      category: 'math', preview: '$\\gamma$',          insert: '$\\gamma$' },
  { id: 'delta',        label: 'Delta δ',            keywords: ['delta'],                      category: 'math', preview: '$\\delta$',          insert: '$\\delta$' },
  { id: 'epsilon',      label: 'Epsilon ε',          keywords: ['epsilon'],                    category: 'math', preview: '$\\varepsilon$',     insert: '$\\varepsilon$' },
  { id: 'theta',        label: 'Theta θ',            keywords: ['theta'],                      category: 'math', preview: '$\\theta$',          insert: '$\\theta$' },
  { id: 'lambda',       label: 'Lambda λ',           keywords: ['lambda'],                     category: 'math', preview: '$\\lambda$',         insert: '$\\lambda$' },
  { id: 'mu',           label: 'Mu μ',               keywords: ['mu'],                         category: 'math', preview: '$\\mu$',             insert: '$\\mu$' },
  { id: 'pi',           label: 'Pi π',               keywords: ['pi'],                         category: 'math', preview: '$\\pi$',             insert: '$\\pi$' },
  { id: 'rho',          label: 'Rho ρ',              keywords: ['rho'],                        category: 'math', preview: '$\\rho$',            insert: '$\\rho$' },
  { id: 'sigma',        label: 'Sigma σ',            keywords: ['sigma'],                      category: 'math', preview: '$\\sigma$',          insert: '$\\sigma$' },
  { id: 'phi',          label: 'Phi φ',              keywords: ['phi'],                        category: 'math', preview: '$\\varphi$',         insert: '$\\varphi$' },
  { id: 'omega',        label: 'Omega ω',            keywords: ['omega'],                      category: 'math', preview: '$\\omega$',          insert: '$\\omega$' },
  { id: 'Omega',        label: 'Omega Ω (capital)',  keywords: ['omega', 'capital', 'ohm'],    category: 'math', preview: '$\\Omega$',          insert: '$\\Omega$' },
  // Relations
  { id: 'leq',          label: 'Less than or equal', keywords: ['less', 'leq', 'lte'],         category: 'math', preview: '$\\leq$',            insert: '$\\leq$' },
  { id: 'geq',          label: 'Greater or equal',   keywords: ['greater', 'geq', 'gte'],      category: 'math', preview: '$\\geq$',            insert: '$\\geq$' },
  { id: 'neq',          label: 'Not equal',          keywords: ['not equal', 'neq', 'ne'],     category: 'math', preview: '$\\neq$',            insert: '$\\neq$' },
  { id: 'approx',       label: 'Approximately',      keywords: ['approx', 'approximately'],    category: 'math', preview: '$\\approx$',         insert: '$\\approx$' },
  { id: 'equiv',        label: 'Equivalent',         keywords: ['equiv', 'identically'],       category: 'math', preview: '$\\equiv$',          insert: '$\\equiv$' },
  // Display math block
  { id: 'block-math',   label: 'Equation block',     keywords: ['equation', 'block', 'math'],  category: 'math', preview: '$$E = mc^2$$',       insert: '$$\n$|\n$$' },
];

// Markdown structure — what newcomers usually look for.
const STRUCTURE: Snippet[] = [
  { id: 'h1',          label: 'Heading 1',     keywords: ['heading', 'h1', 'title'],         category: 'structure', preview: '# Big heading',           insert: '# $|' },
  { id: 'h2',          label: 'Heading 2',     keywords: ['heading', 'h2'],                  category: 'structure', preview: '## Section',              insert: '## $|' },
  { id: 'h3',          label: 'Heading 3',     keywords: ['heading', 'h3', 'subsection'],    category: 'structure', preview: '### Subsection',          insert: '### $|' },
  { id: 'bullet',      label: 'Bullet list',   keywords: ['list', 'bullet', 'unordered'],    category: 'structure', preview: '- item\n- item',          insert: '- $|' },
  { id: 'numbered',    label: 'Numbered list', keywords: ['list', 'numbered', 'ordered'],    category: 'structure', preview: '1. item\n2. item',        insert: '1. $|' },
  { id: 'bold',        label: 'Bold',          keywords: ['bold', 'strong'],                 category: 'structure', preview: '**bold text**',           insert: '**$|**' },
  { id: 'italic',      label: 'Italic',        keywords: ['italic', 'emphasis'],             category: 'structure', preview: '*italic text*',           insert: '*$|*' },
  { id: 'code-inline', label: 'Inline code',   keywords: ['code', 'inline', 'mono'],         category: 'structure', preview: '`code`',                  insert: '`$|`' },
  { id: 'code-block',  label: 'Code block',    keywords: ['code', 'block', 'fenced'],        category: 'structure', preview: '```\ncode\n```',          insert: '```\n$|\n```' },
  { id: 'quote',       label: 'Blockquote',    keywords: ['quote', 'blockquote', 'cite'],    category: 'structure', preview: '> a quote',               insert: '> $|' },
  { id: 'link',        label: 'Link',          keywords: ['link', 'hyperlink', 'url'],       category: 'structure', preview: '[text](url)',             insert: '[$|](url)' },
  { id: 'hr',          label: 'Horizontal rule',keywords: ['rule', 'hr', 'divider'],         category: 'structure', preview: '---',                     insert: '\n---\n$|' },
];

// Cloze patterns — used inside the cloze block's textarea. Inserts only the
// structural cN markers; `$|` lands the cursor inside the first blank. The
// preview shows an example to clarify what the pattern means.
const CLOZE: Snippet[] = [
  {
    id: 'cloze-blank',
    label: 'Single blank',
    keywords: ['cloze', 'blank', 'single', 'one'],
    category: 'cloze',
    preview: 'The {{c1::mitochondria}} is the powerhouse.',
    insert: '{{c1::$|}}',
  },
  {
    id: 'cloze-two-group',
    label: 'Two groups',
    keywords: ['cloze', 'two', 'pair', 'multi', 'group'],
    category: 'cloze',
    preview: 'The {{c1::cat}} sat on the {{c2::mat}}.',
    insert: '{{c1::$|}} {{c2::}}',
  },
  {
    id: 'cloze-three-group',
    label: 'Three groups',
    keywords: ['cloze', 'three', 'multi', 'group'],
    category: 'cloze',
    preview: '{{c1::Mitochondria}}, {{c2::ribosomes}}, {{c3::nucleus}}.',
    insert: '{{c1::$|}}, {{c2::}}, {{c3::}}',
  },
  {
    id: 'cloze-same-group',
    label: 'Same group, multi-blank',
    keywords: ['cloze', 'same', 'group', 'multi'],
    category: 'cloze',
    preview: '{{c1::Photosynthesis}} converts light into {{c1::energy}}.',
    insert: '{{c1::$|}} ... {{c1::}}',
  },
  {
    id: 'cloze-definition',
    label: 'Term & definition',
    keywords: ['cloze', 'definition', 'term', 'vocab'],
    category: 'cloze',
    preview: '{{c1::Entropy}}: {{c2::disorder in a system}}.',
    insert: '{{c1::$|}}: {{c2::}}',
  },
];

// Bare-math snippets — same expressions as MATH but WITHOUT the outer `$…$`
// wrappers, for surfaces (the math block input) that are already inside a
// math context. Keeps the catalog DRY by stripping the wrappers programmatically.
const MATH_BARE: Snippet[] = MATH
  .filter(s => s.id !== 'block-math')
  .map(s => ({
    ...s,
    id: `bare-${s.id}`,
    category: 'math-bare' as const,
    // Strip the outer `$…$` (or `$$\n…\n$$`) wrappers from `insert`.
    insert: s.insert.startsWith('$$\n') && s.insert.endsWith('\n$$')
      ? s.insert.slice(3, -3)
      : s.insert.startsWith('$') && s.insert.endsWith('$') && s.insert.length >= 2
        ? s.insert.slice(1, -1)
        : s.insert,
    preview: s.preview,
  }));

export const SNIPPET_CATALOG: Snippet[] = [...MATH, ...STRUCTURE, ...CLOZE, ...MATH_BARE];

/**
 * Filter snippets by a free-text query. Empty query returns the full catalog.
 * Match scoring: label/id prefix > label/id substring > keyword substring.
 * Optionally restrict to one or more categories — cloze textareas only want
 * the cloze patterns; math inputs only want math-bare snippets.
 */
export function searchSnippets(
  query: string,
  limit = 20,
  opts?: { categories?: Snippet['category'][] },
): Snippet[] {
  const cats = opts?.categories;
  const pool = cats ? SNIPPET_CATALOG.filter(s => cats.includes(s.category)) : SNIPPET_CATALOG;
  const q = query.trim().toLowerCase();
  if (!q) return pool.slice(0, limit);
  const scored: Array<{ s: Snippet; score: number }> = [];
  for (const s of pool) {
    const label = s.label.toLowerCase();
    const id    = s.id.toLowerCase();
    let score = 0;
    if (label.startsWith(q) || id.startsWith(q)) score = 100;
    else if (label.includes(q) || id.includes(q)) score = 60;
    else if (s.keywords.some(k => k.startsWith(q))) score = 40;
    else if (s.keywords.some(k => k.includes(q))) score = 20;
    if (score > 0) scored.push({ s, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(x => x.s);
}
