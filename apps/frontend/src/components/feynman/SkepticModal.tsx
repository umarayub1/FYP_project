'use client';

import { useEffect, useRef } from 'react';
import { X, MessageCircleQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

interface SkepticModalProps {
  question:  string;
  onClose:   () => void;
  onAnswer:  (answer: string) => void;
  answering: boolean;
}

export function SkepticModal({ question, onClose, onAnswer, answering }: SkepticModalProps) {
  const inputRef    = useRef<HTMLTextAreaElement>(null);
  const overlayRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape; trap focus within modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const answer = inputRef.current?.value.trim();
    if (answer) onAnswer(answer);
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      aria-modal="true"
      role="dialog"
      aria-labelledby="skeptic-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-lg mx-4 rounded-xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <MessageCircleQuestion className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 id="skeptic-title" className="text-sm font-medium text-foreground">
              The Skeptic asks…
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer"
            aria-label="Close Skeptic"
          >
            <X className="h-4 w-4 text-foreground-muted" />
          </button>
        </div>

        <div className="px-6 py-5">
          <blockquote className="text-base text-foreground font-medium mb-5 leading-relaxed">
            "{question}"
          </blockquote>

          <form onSubmit={handleSubmit} aria-label="Answer the Skeptic's question">
            <textarea
              ref={inputRef}
              rows={4}
              placeholder="Your answer…"
              className={cn(
                'w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground',
                'placeholder:text-foreground-subtle resize-none outline-none',
                'focus:ring-2 focus:ring-focus-ring transition-shadow'
              )}
              disabled={answering}
              aria-label="Answer"
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={answering}>
                Cancel
              </Button>
              <Button type="submit" disabled={answering}>
                {answering ? 'Updating map…' : 'Submit answer'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
