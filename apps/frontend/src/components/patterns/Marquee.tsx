'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

interface DragRect { x: number; y: number; width: number; height: number; }

function rectsIntersect(a: DragRect, b: DragRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

interface MarqueeProps {
  /** ref to the scrollable list container whose rows carry data-selectable-id */
  containerRef: React.RefObject<HTMLElement | null>;
  /** called when drag ends; mode='add' when Shift was held */
  onSelect: (ids: string[], mode: 'replace' | 'add') => void;
  /** disable on touch devices or when not needed */
  disabled?: boolean;
}

export function Marquee({ containerRef, onSelect, disabled }: MarqueeProps) {
  const [dragRect, setDragRect] = useState<DragRect | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (disabled) return;
    // Only primary button
    if (e.button !== 0) return;
    const el = e.target as HTMLElement;
    const container = containerRef.current;
    if (!container || !container.contains(el)) return;
    // Block buttons, inputs, menu items — but NOT anchors, since row
    // wrappers may be <a> (e.g., Next.js <Link>). 6px threshold handles
    // click-vs-drag, and mouseup suppresses the follow-up click event.
    if (
      el.closest('button') ||
      el.closest('input') ||
      el.closest('[role="menuitem"]')
    ) return;
    startPos.current = { x: e.clientX, y: e.clientY };
    isDragging.current = false;
  }, [disabled, containerRef]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!startPos.current) return;
    const dx = e.clientX - startPos.current.x;
    const dy = e.clientY - startPos.current.y;
    if (!isDragging.current && Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
    isDragging.current = true;
    setDragRect({
      x:      Math.min(e.clientX, startPos.current.x),
      y:      Math.min(e.clientY, startPos.current.y),
      width:  Math.abs(dx),
      height: Math.abs(dy),
    });
  }, []);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (!startPos.current) return;
    const wasDragging = isDragging.current;
    const rect: DragRect = {
      x:      Math.min(e.clientX, startPos.current.x),
      y:      Math.min(e.clientY, startPos.current.y),
      width:  Math.abs(e.clientX - startPos.current.x),
      height: Math.abs(e.clientY - startPos.current.y),
    };
    startPos.current = null;
    isDragging.current = false;
    setDragRect(null);
    if (!wasDragging || rect.width < 6 || rect.height < 6) return;

    // Drag ended inside an anchor row would otherwise fire a click and
    // navigate — capture-phase swallow the next click only.
    const swallow = (ev: MouseEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      window.removeEventListener('click', swallow, true);
    };
    window.addEventListener('click', swallow, true);
    setTimeout(() => window.removeEventListener('click', swallow, true), 100);

    const container = containerRef.current;
    if (!container) return;
    const rows = container.querySelectorAll('[data-selectable-id]');
    const hit: string[] = [];
    rows.forEach(row => {
      const r = row.getBoundingClientRect();
      if (rectsIntersect(rect, { x: r.x, y: r.y, width: r.width, height: r.height })) {
        const id = (row as HTMLElement).dataset.selectableId;
        if (id) hit.push(id);
      }
    });
    if (hit.length > 0) {
      onSelect(hit, e.shiftKey ? 'add' : 'replace');
    }
  }, [containerRef, onSelect]);

  useEffect(() => {
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup',   handleMouseUp);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup',   handleMouseUp);
    };
  }, [handleMouseDown, handleMouseMove, handleMouseUp]);

  if (!dragRect) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50" aria-hidden="true">
      <div
        style={{
          position: 'fixed',
          left:     dragRect.x,
          top:      dragRect.y,
          width:    dragRect.width,
          height:   dragRect.height,
          background:   'hsl(var(--primary) / 0.08)',
          border:       '1px solid hsl(var(--primary) / 0.35)',
          borderRadius: 4,
        }}
      />
    </div>
  );
}
