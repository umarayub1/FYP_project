// Mouse-driven block gutter — emits "the block currently under the mouse" so
// the host can render a floating "+ / drag handle" pair next to it. Pattern
// mirrors SlashCommand: extension owns no UI; React owns the popup.
//
// Why custom: TipTap's official drag handle lives in the paid `@tiptap-pro`
// scope. Building it ourselves is cheap because we only need to track
// top-level blocks (children of the doc node), so the position math is
// straightforward.

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export interface BlockGutterHover {
  /** Document position of the first character INSIDE the hovered block. */
  blockFrom: number;
  /** Document position just AFTER the hovered block. */
  blockTo: number;
  /** Viewport rect of the block's DOM element. */
  rect: { top: number; left: number; bottom: number; right: number; height: number };
}

export interface BlockGutterState {
  hover: BlockGutterHover | null;
  /** Persists a single drag — `dragstart` snapshots, `drop` consumes. */
  dragSourceFrom: number | null;
}

export interface BlockGutterOptions {
  onState: (state: BlockGutterState) => void;
}

const BLOCK_GUTTER_KEY = new PluginKey('blockGutter');

export const BlockGutter = Extension.create<BlockGutterOptions>({
  name: 'blockGutter',

  addOptions() {
    return { onState: () => {} };
  },

  addProseMirrorPlugins() {
    const onState = this.options.onState;
    let current: BlockGutterState = { hover: null, dragSourceFrom: null };

    function emit(next: Partial<BlockGutterState>): void {
      current = { ...current, ...next };
      onState(current);
    }

    return [
      new Plugin({
        key: BLOCK_GUTTER_KEY,
        props: {
          handleDOMEvents: {
            mousemove(view, event) {
              const ev = event as MouseEvent;
              // `posAtCoords` resolves the doc position at viewport coords.
              // We then walk up to depth 1 (direct child of doc) so the
              // gutter targets paragraphs / headings / code / math etc., not
              // text nodes or inline marks.
              const pos = view.posAtCoords({ left: ev.clientX, top: ev.clientY });
              if (!pos) {
                if (current.hover) emit({ hover: null });
                return false;
              }
              const $pos = view.state.doc.resolve(Math.min(pos.pos, view.state.doc.content.size - 1));
              if ($pos.depth < 1) {
                if (current.hover) emit({ hover: null });
                return false;
              }
              const blockDepth = 1;
              const block = $pos.node(blockDepth);
              const from = $pos.before(blockDepth);
              const to = from + block.nodeSize;
              const dom = view.nodeDOM(from);
              if (!dom || !(dom instanceof HTMLElement)) {
                if (current.hover) emit({ hover: null });
                return false;
              }
              const r = dom.getBoundingClientRect();
              const next: BlockGutterHover = {
                blockFrom: from,
                blockTo: to,
                rect: {
                  top: r.top,
                  left: r.left,
                  bottom: r.bottom,
                  right: r.right,
                  height: r.height,
                },
              };
              // Cheap equality check — avoid storming React with identical
              // states on every mousemove (~60 events/sec).
              const prev = current.hover;
              if (
                prev &&
                prev.blockFrom === next.blockFrom &&
                prev.blockTo === next.blockTo &&
                Math.abs(prev.rect.top - next.rect.top) < 0.5 &&
                Math.abs(prev.rect.left - next.rect.left) < 0.5
              ) {
                return false;
              }
              emit({ hover: next });
              return false;
            },
            // Intentionally NOT clearing on `mouseleave`: the gutter is
            // portal-mounted to `document.body`, so the user reaching for it
            // crosses out of `view.dom` and we'd hide ourselves before they
            // arrive. The React side owns the dismiss policy (own hover state
            // + mouseleave on the gutter element).
            dragend() {
              if (current.dragSourceFrom !== null) emit({ dragSourceFrom: null });
              return false;
            },
          },
        },
      }),
    ];
  },
});

export { BLOCK_GUTTER_KEY };
