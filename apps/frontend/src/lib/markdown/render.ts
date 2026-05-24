/**
 * Lightweight markdown + KaTeX renderer for plain-text fields
 * (Feynman explanation, flashcard front/back, etc.).
 *
 * Math is processed FIRST so markdown-it doesn't mangle `_` or `*` inside
 * LaTeX expressions, then we hand the math placeholders back to markdown-it
 * inside `<span class="katex-html">` blocks it knows not to touch.
 */
import MarkdownIt from 'markdown-it';
import katex from 'katex';

const md = new MarkdownIt({
  html:        false,
  linkify:     true,
  typographer: false,
  breaks:      true,
});

function renderMathPlaceholders(text: string): { stripped: string; tokens: string[] } {
  const tokens: string[] = [];
  // Block math `$$ … $$` first (so $$ pairs don't get split by single-$ pass).
  let stripped = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, body) => {
    let html = '';
    try {
      html = katex.renderToString(body.trim(), { displayMode: true, throwOnError: false });
    } catch {
      html = `<code>$$${body}$$</code>`;
    }
    const i = tokens.push(`<div class="katex-block">${html}</div>`) - 1;
    return `@@KATEX${i}@@`;
  });
  // Inline math `$ … $`.
  stripped = stripped.replace(/\$([^$\n]+?)\$/g, (_, body) => {
    let html = '';
    try {
      html = katex.renderToString(body.trim(), { displayMode: false, throwOnError: false });
    } catch {
      html = `<code>$${body}$</code>`;
    }
    const i = tokens.push(html) - 1;
    return `@@KATEX${i}@@`;
  });
  return { stripped, tokens };
}

export function renderMarkdownWithMath(text: string): string {
  if (!text) return '';
  const { stripped, tokens } = renderMathPlaceholders(text);
  const html = md.render(stripped);
  return html.replace(/@@KATEX(\d+)@@/g, (_, idx) => tokens[Number(idx)] ?? '');
}

/**
 * Same as `renderMarkdownWithMath` but also recognises citation markers like
 * `[3]` inside the body (Coach output convention) and renders them as
 * styled `<sup>` chips that link to the corresponding `#cite-N` anchor.
 *
 * Citations are pulled out into placeholders *before* math/markdown so that
 * (a) markdown-it doesn't turn `[3]` into an autolink, and (b) the chip ends
 * up nested inside any surrounding `<p>`/`<li>` so HTML stays balanced.
 */
export function renderMarkdownWithCitations(text: string): string {
  if (!text) return '';
  const cites: number[] = [];
  // First pass: extract citation tokens. Standalone `[N]` (no leading `[`),
  // 1–3 digits — matches the Coach citation format.
  const withCitePlaceholders = text.replace(/(^|[^\[])\[(\d{1,3})\]/g, (_, lead, n) => {
    const i = cites.push(Number(n)) - 1;
    return `${lead}@@CITE${i}@@`;
  });
  // Second pass: math + markdown (existing logic).
  const { stripped, tokens } = renderMathPlaceholders(withCitePlaceholders);
  const html = md.render(stripped);
  const withMath = html.replace(/@@KATEX(\d+)@@/g, (_, idx) => tokens[Number(idx)] ?? '');
  // Final pass: swap citation placeholders for chip markup. Plain visual
  // reference — the SourcesSection below the bubble is the interactive path.
  return withMath.replace(/@@CITE(\d+)@@/g, (_, idx) => {
    const n = cites[Number(idx)];
    if (n === undefined) return '';
    return `<sup class="mx-0.5 inline-flex"><span class="rounded px-1 py-0.5 bg-surface-3 text-foreground-subtle text-[10px] font-mono leading-none">${n}</span></sup>`;
  });
}
