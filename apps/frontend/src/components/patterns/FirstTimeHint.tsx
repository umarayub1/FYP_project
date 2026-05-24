'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useFirstTimeHint } from '@/hooks/useFirstTimeHint';
import { useHintQueue } from '@/contexts/HintQueueContext';
import { cn } from '@/lib/cn';

interface FirstTimeHintProps {
  hintId: string;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

const containerCls: Record<string, string> = {
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  top:    'bottom-full left-1/2 -translate-x-1/2 mb-2',
  left:   'right-full top-1/2 -translate-y-1/2 mr-2',
  right:  'left-full top-1/2 -translate-y-1/2 ml-2',
};

// CSS border-trick arrows. Each arrow is a 0×0 div with borders forming a triangle.
// "bottom" callout → arrow at top of box, pointing ▲ toward the target above.
// "top" callout    → arrow at bottom of box, pointing ▼ toward the target below.
const arrowStyle: Record<string, React.CSSProperties> = {
  bottom: {
    position: 'absolute', top: -5, left: '50%', transform: 'translateX(-50%)',
    width: 0, height: 0,
    borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
    borderBottom: '5px solid hsl(var(--border))',
  },
  top: {
    position: 'absolute', bottom: -5, left: '50%', transform: 'translateX(-50%)',
    width: 0, height: 0,
    borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
    borderTop: '5px solid hsl(var(--border))',
  },
  left: {
    position: 'absolute', right: -5, top: '50%', transform: 'translateY(-50%)',
    width: 0, height: 0,
    borderTop: '5px solid transparent', borderBottom: '5px solid transparent',
    borderLeft: '5px solid hsl(var(--border))',
  },
  right: {
    position: 'absolute', left: -5, top: '50%', transform: 'translateY(-50%)',
    width: 0, height: 0,
    borderTop: '5px solid transparent', borderBottom: '5px solid transparent',
    borderRight: '5px solid hsl(var(--border))',
  },
};

export function FirstTimeHint({ hintId, content, position = 'bottom' }: FirstTimeHintProps) {
  const { dismiss } = useFirstTimeHint(hintId);
  const { register, unregister, isActive } = useHintQueue();
  const [shown, setShown] = useState(false);
  const [anim, setAnim]   = useState(false);
  const ref               = useRef<HTMLDivElement>(null);

  useEffect(() => {
    register(hintId);
    return () => { unregister(hintId); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = isActive(hintId);

  useEffect(() => {
    if (!active) { setShown(false); setAnim(false); return; }
    const t = setTimeout(() => {
      setShown(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setAnim(true)));
    }, 1000);
    return () => clearTimeout(t);
  }, [active]);

  const handleDismiss = useCallback(() => {
    setAnim(false);
    setShown(false);
    dismiss();
    unregister(hintId);
  }, [dismiss, hintId, unregister]);

  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(handleDismiss, 8000);
    return () => clearTimeout(t);
  }, [shown, handleDismiss]);

  useEffect(() => {
    if (!shown) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') handleDismiss(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [shown, handleDismiss]);

  useEffect(() => {
    if (!shown) return;
    function onPointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) handleDismiss();
    }
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [shown, handleDismiss]);

  if (!shown) return null;

  return (
    <div
      ref={ref}
      className={cn(
        'absolute z-[200] w-max max-w-[220px]',
        'bg-surface border border-border rounded-[6px] px-3 py-2',
        'shadow-md text-xs text-foreground leading-snug',
        containerCls[position],
      )}
      style={{
        opacity: anim ? 1 : 0,
        transition: 'opacity 120ms ease-out',
        pointerEvents: anim ? 'auto' : 'none',
      }}
      role="tooltip"
    >
      <div style={arrowStyle[position]} aria-hidden="true" />
      <span>{content}</span>
      <button
        onClick={handleDismiss}
        className="ml-2 text-foreground-muted hover:text-foreground cursor-pointer"
        aria-label="Dismiss hint"
      >
        ×
      </button>
    </div>
  );
}
