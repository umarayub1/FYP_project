'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GripVertical, Plus } from 'lucide-react';
import type { Editor } from '@tiptap/core';
import type { BlockGutterState } from './extensions/BlockGutter';
import { cn } from '@/lib/cn';

interface BlockGutterProps {
  state: BlockGutterState | null;
  editor: Editor | null;
  /** Optional boundary — when the gutter's natural left position would cross
   *  outside this element's left edge (e.g. narrow Cornell columns), tuck
   *  the gutter inside the column instead of bleeding into the sidebar. */
  boundaryRef?: React.RefObject<HTMLElement | null>;
}

interface DropTarget {
  // Where the moved block will be inserted (a block boundary in the doc).
  insertAt: number;
  // Viewport rect of the indicator line: a horizontal line spanning the
  // editor's content column above or below the target block.
  rectTop: number;
  rectLeft: number;
  rectWidth: number;
}

export function BlockGutter({ state, editor, boundaryRef }: BlockGutterProps): JSX.Element | null {
  const hover = state?.hover ?? null;

  // Compute the gutter's left position with a boundary check. The default
  // 56px-left offset sits the gutter in the page margin; for narrow columns
  // (Cornell cue / summary) we tuck it inside the column at `boundary + 2`.
  function leftFor(rectLeft: number): number {
    const natural = rectLeft - 56;
    const boundary = boundaryRef?.current?.getBoundingClientRect().left;
    if (boundary == null) return natural;
    if (natural < boundary) return boundary + 2;
    return natural;
  }

  const [dragging, setDragging] = useState(false);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  // Captured at the moment dragging starts — `hover` may shift during drag
  // (mousemove keeps updating it) and we need the *source* range to stay put.
  const sourceRef = useRef<{ from: number; to: number } | null>(null);
  // Frozen gutter rect for the duration of a drag. Without this, hover
  // changes as the cursor moves over other blocks, React re-renders the
  // gutter at a different position, the button gets remounted, and the
  // pointer capture is lost — the drag silently dies.
  const [frozenGutter, setFrozenGutter] = useState<{ top: number; left: number } | null>(null);

  const handleInsertBelow = useCallback(() => {
    if (!editor || !hover) return;
    editor
      .chain()
      .focus()
      .insertContentAt(hover.blockTo, { type: 'paragraph' })
      .setTextSelection(hover.blockTo + 1)
      .run();
  }, [editor, hover]);

  // Compute the drop target at a given viewport coordinate. We walk to a
  // top-level block (depth 1 — direct child of doc) and snap to either its
  // top or bottom edge depending on which half of the block the pointer is
  // over.
  const computeDropTarget = useCallback(
    (clientX: number, clientY: number): DropTarget | null => {
      if (!editor) return null;
      const view = editor.view;
      const at = view.posAtCoords({ left: clientX, top: clientY });
      if (!at) return null;
      const $pos = view.state.doc.resolve(
        Math.min(at.pos, view.state.doc.content.size - 1),
      );
      if ($pos.depth < 1) return null;
      const block = $pos.node(1);
      const blockStart = $pos.before(1);
      const blockEnd = blockStart + block.nodeSize;
      const dom = view.nodeDOM(blockStart);
      if (!dom || !(dom instanceof HTMLElement)) return null;
      const rect = dom.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const insertBefore = clientY < midY;
      const insertAt = insertBefore ? blockStart : blockEnd;
      const rectTop = insertBefore ? rect.top : rect.bottom;
      return {
        insertAt,
        rectTop,
        rectLeft: rect.left,
        rectWidth: rect.width,
      };
    },
    [editor],
  );

  const resetDragState = useCallback(() => {
    sourceRef.current = null;
    setDragging(false);
    setDropTarget(null);
    setFrozenGutter(null);
  }, []);

  const completeDrag = useCallback(
    (target: DropTarget | null) => {
      if (!editor || !sourceRef.current || !target) {
        resetDragState();
        return;
      }
      const { from, to } = sourceRef.current;
      // Drop onto the same block (above or below an adjacent position that
      // resolves to the same spot) → no-op.
      if (target.insertAt >= from && target.insertAt <= to) {
        resetDragState();
        return;
      }
      const view = editor.view;
      const tr = view.state.tr;
      const slice = tr.doc.slice(from, to);
      // Delete the source first.
      tr.delete(from, to);
      // If the drop position was after the source, shift it back by the
      // removed size so we insert at the user-perceived spot.
      let insertAt = target.insertAt;
      if (insertAt > to) insertAt -= to - from;
      tr.insert(insertAt, slice.content);
      view.dispatch(tr.scrollIntoView());
      resetDragState();
    },
    [editor, resetDragState],
  );

  // Pointer-based drag — chosen over HTML5 drag/drop because the source button
  // lives outside `view.dom` (portal-mounted to body), so ProseMirror's drag
  // handlers never see the dragstart. Custom pointer events let us drive the
  // whole interaction explicitly.
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!editor || !hover) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      sourceRef.current = { from: hover.blockFrom, to: hover.blockTo };
      // Snapshot the gutter position so it stays mounted at the same spot
      // during the drag, even when hover updates as the pointer travels.
      setFrozenGutter({
        top: hover.rect.top + Math.max(0, hover.rect.height / 2 - 14),
        left: leftFor(hover.rect.left),
      });
      setDragging(true);
      setDropTarget(computeDropTarget(e.clientX, e.clientY));
    },
    [editor, hover, computeDropTarget],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!sourceRef.current) return;
      setDropTarget(computeDropTarget(e.clientX, e.clientY));
    },
    [computeDropTarget],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!sourceRef.current) return;
      e.currentTarget.releasePointerCapture(e.pointerId);
      completeDrag(computeDropTarget(e.clientX, e.clientY));
    },
    [completeDrag, computeDropTarget],
  );

  const handlePointerCancel = useCallback(() => {
    resetDragState();
  }, [resetDragState]);

  // Escape cancels an in-progress drag.
  useEffect(() => {
    if (!dragging) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') resetDragState();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dragging, resetDragState]);

  if (typeof document === 'undefined') return null;
  // Keep the gutter rendered during a drag even if `hover` clears.
  if (!hover && !dragging) return null;

  // While dragging, snap to the frozen position so the button (and its
  // pointer capture) survives the drag. Otherwise follow live hover.
  const top = dragging && frozenGutter
    ? frozenGutter.top
    : hover
      ? hover.rect.top + Math.max(0, hover.rect.height / 2 - 14)
      : 0;
  const left = dragging && frozenGutter
    ? frozenGutter.left
    : hover
      ? leftFor(hover.rect.left)
      : 0;
  const showGutter = dragging ? !!frozenGutter : !!hover;

  return createPortal(
    <>
      {showGutter && (
        <div
          className="fixed z-[150] flex items-center gap-0.5 select-none"
          // Extra padding-right creates a "hover bridge" so the mouse traveling
          // from the gutter back into the editor doesn't hit dead space and
          // clear the hover state.
          style={{ top, left, paddingRight: 8 }}
          onMouseDown={e => e.preventDefault()}
        >
          <button
            type="button"
            aria-label="Insert paragraph below"
            onClick={handleInsertBelow}
            className={cn(
              'inline-flex h-6 w-6 items-center justify-center rounded',
              'text-[hsl(var(--foreground-subtle))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]',
              'transition-colors',
            )}
            title="Insert paragraph below"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Drag to reorder block"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            className={cn(
              'inline-flex h-6 w-4 items-center justify-center rounded',
              dragging ? 'cursor-grabbing' : 'cursor-grab',
              'text-[hsl(var(--foreground-subtle))] hover:bg-[hsl(var(--surface-2))] hover:text-[hsl(var(--foreground))]',
              'transition-colors',
            )}
            title="Drag to reorder"
          >
            <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
      {dragging && dropTarget && (
        <div
          className="pointer-events-none fixed z-[160] h-0.5 rounded-full bg-[hsl(var(--primary))] shadow-[0_0_4px_hsl(var(--primary))]"
          style={{
            top: dropTarget.rectTop - 1,
            left: dropTarget.rectLeft,
            width: dropTarget.rectWidth,
          }}
        />
      )}
    </>,
    document.body,
  );
}
