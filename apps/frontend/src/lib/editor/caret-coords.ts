/**
 * Compute the on-screen position of the caret (or any character index) inside
 * a `<textarea>` using the classic "mirror div" technique.
 *
 * The browser doesn't expose caret coordinates directly for textareas. The
 * trick: render an invisible `<div>` that copies every CSS property that
 * affects layout (font, padding, border, whitespace, line-height, etc.), put
 * the text-up-to-caret inside it, then a sentinel `<span>` at the caret
 * position. The sentinel's bounding rect is the caret position in the mirror;
 * translating to the textarea's coordinate system gives us viewport-relative
 * x/y.
 *
 * Why a mirror at all: textareas are opaque to layout queries. canvas-text-
 * measuring works for single-line inputs but breaks the moment the text
 * wraps. The mirror is heavier but handles wrapping, scrolls, RTL — the lot.
 */

// CSS properties that affect how text lays out. Copying these from the
// textarea to the mirror is what makes the technique work.
const COPIED_STYLES = [
  'direction', 'boxSizing', 'width', 'height',
  'overflowX', 'overflowY',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'borderStyle',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontSizeAdjust',
  'lineHeight', 'fontFamily',
  'textAlign', 'textTransform', 'textIndent', 'textDecoration',
  'letterSpacing', 'wordSpacing',
  'tabSize',
  'whiteSpace', 'wordWrap', 'wordBreak',
] as const;

export interface CaretCoords {
  /** viewport x of the caret (left edge of the character) */
  left:        number;
  /** viewport y of the caret (top of the line) */
  top:         number;
  /** height of one line at the caret — useful for offsetting the menu below */
  lineHeight:  number;
}

/**
 * Returns the viewport coords of `position` inside `el`. Defaults to the
 * current selection start. Returns null if the element isn't laid out yet.
 */
export function getCaretCoordinates(
  el: HTMLTextAreaElement,
  position?: number,
): CaretCoords | null {
  if (typeof document === 'undefined') return null;
  const pos = position ?? el.selectionStart;
  if (pos === null || pos === undefined) return null;

  const mirror = document.createElement('div');
  mirror.id = 'synapse-textarea-caret-mirror';
  // Off-screen but laid out so measurements work. visibility:hidden keeps it
  // unrendered but still measurable; position:absolute keeps it out of flow.
  Object.assign(mirror.style, {
    position:   'absolute',
    visibility: 'hidden',
    top:        '0px',
    left:       '0px',
    whiteSpace: 'pre-wrap',
    wordWrap:   'break-word',
  });

  const computed = window.getComputedStyle(el);
  // Bracket access on CSSStyleDeclaration with our tuple's narrow keys —
  // both indexed types resolve to string but TS doesn't see them as compatible.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mirrorStyle = mirror.style as unknown as Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const computedAny = computed as unknown as Record<string, any>;
  for (const prop of COPIED_STYLES) {
    mirrorStyle[prop] = computedAny[prop];
  }

  // Replicate the text up to the caret. Use textContent (not innerText) to
  // preserve whitespace exactly.
  mirror.textContent = el.value.slice(0, pos);
  // Trailing space so the sentinel has somewhere to land for end-of-line.
  const sentinel = document.createElement('span');
  sentinel.textContent = el.value.slice(pos) || '.';
  mirror.appendChild(sentinel);

  document.body.appendChild(mirror);
  const sentinelRect = sentinel.getBoundingClientRect();
  const textareaRect = el.getBoundingClientRect();
  const lineHeight   = parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.2;
  document.body.removeChild(mirror);

  // The sentinel is positioned in the mirror's coordinate system (anchored
  // at 0,0). Translate by the mirror's own rect (which is 0,0 here) and add
  // the textarea's screen position, then subtract the textarea's scroll
  // offsets so we point at the visible caret not the buffer caret.
  return {
    left: textareaRect.left + (sentinelRect.left - el.scrollLeft),
    top:  textareaRect.top  + (sentinelRect.top  - el.scrollTop),
    lineHeight,
  };
}

/**
 * Given a desired anchor point (typically caret coords) and a menu's
 * intrinsic height, decide whether the menu should open downward (typical)
 * or flip up to stay inside the viewport. Returns the top-left coords
 * for the menu plus the "openUp" flag (callers may want to reverse animation).
 */
export function placeMenuNearCaret(
  caret:      CaretCoords,
  menuHeight: number,
  menuWidth:  number,
): { top: number; left: number; openUp: boolean } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const spaceBelow = vh - (caret.top + caret.lineHeight);
  const spaceAbove = caret.top;
  // Open upward only if there's not enough room below AND there's clearly
  // more above. Otherwise stick with below — it's the conventional placement.
  const openUp = spaceBelow < menuHeight && spaceAbove > spaceBelow;

  // Vertical: below caret line, or above with menu's bottom flush to caret.
  const top = openUp
    ? Math.max(8, caret.top - menuHeight - 4)
    : caret.top + caret.lineHeight + 4;

  // Horizontal: keep menu fully on-screen.
  const left = Math.min(Math.max(8, caret.left), vw - menuWidth - 8);

  return { top, left, openUp };
}
