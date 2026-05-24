'use client';

import { useEffect, useRef, useState, useId, useCallback } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

interface CheckpointPayload {
  question: string;
  expected: string;
}

interface ScoredResult {
  correct:  boolean;
  expected: string;
  feedback: string;
}

interface ComprehensionCheckpointOverlayProps {
  documentId: string;
  page:       number;
  open:       boolean;
  onComplete: (result: ScoredResult) => void;
}

export function ComprehensionCheckpointOverlay({
  documentId, page, open, onComplete,
}: ComprehensionCheckpointOverlayProps) {
  const [question, setQuestion]   = useState<CheckpointPayload | null>(null);
  const [loading,  setLoading]    = useState(false);
  const [answer,   setAnswer]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result,   setResult]     = useState<ScoredResult | null>(null);
  const [error,    setError]      = useState<string | null>(null);
  const inputRef                  = useRef<HTMLInputElement>(null);
  const feedbackId                = useId();

  // Fetch the question when the overlay opens for a new page
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setQuestion(null);
    setAnswer('');
    setResult(null);
    fetch(`/api/pdfs/${documentId}/comprehension/question`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page }),
    })
      .then(async r => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<CheckpointPayload>;
      })
      .then(q => { if (!cancelled) setQuestion(q); })
      .catch(() => { if (!cancelled) setError('Could not load the question. Try again.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, documentId, page]);

  // Autofocus the input when the question arrives
  useEffect(() => {
    if (question && !result) inputRef.current?.focus();
  }, [question, result]);

  const handleSubmit = useCallback(async () => {
    if (!question || !answer.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/pdfs/${documentId}/comprehension/answer`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page,
          question: question.question,
          expected: question.expected,
          answer:   answer.trim(),
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const scored = await res.json() as ScoredResult;
      setResult(scored);
    } catch {
      setError('Could not save your answer. Try again.');
    } finally {
      setSubmitting(false);
    }
  }, [question, answer, submitting, documentId, page]);

  function handleContinue() {
    if (!result) return;
    onComplete(result);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={() => { /* checkpoints force completion — ESC ignored */ }}
    >
      <DialogContent
        className="max-w-md"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-baseline justify-between gap-2">
            <span>Quick check</span>
            <span className="font-mono text-xs text-foreground-subtle">page {page}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-foreground-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Building a question…
            </div>
          )}

          {error && !loading && (
            <p className="text-sm text-danger" role="alert">{error}</p>
          )}

          {question && !result && (
            <>
              <p
                className="text-base leading-relaxed text-foreground"
                style={{ fontFamily: "'Source Serif 4', Georgia, 'Times New Roman', serif" }}
              >
                {question.question}
              </p>
              <input
                ref={inputRef}
                type="text"
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={submitting}
                placeholder="Your answer…"
                aria-label="Your answer"
                aria-describedby={feedbackId}
                className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-60"
              />
            </>
          )}

          {result && (
            <div
              id={feedbackId}
              className={cn(
                'rounded-md border px-3 py-2 text-sm',
                result.correct
                  ? 'border-success/30 bg-success-soft text-foreground'
                  : 'border-warning/30 bg-warning-soft text-foreground',
              )}
            >
              <p className="font-medium mb-1">
                {result.correct ? '✓ Got it.' : '○ Close — here\'s the gap.'}
              </p>
              <p className="text-foreground-muted">{result.feedback}</p>
              {!result.correct && result.expected && (
                <p className="mt-1 text-xs text-foreground-subtle">
                  Expected: <span className="text-foreground-muted">{result.expected}</span>
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {!result ? (
            <Button
              onClick={() => void handleSubmit()}
              disabled={!question || !answer.trim() || submitting}
              className="gap-1.5"
            >
              {submitting
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                : <Send className="h-3.5 w-3.5" aria-hidden="true" />}
              {submitting ? 'Checking…' : 'Submit'}
            </Button>
          ) : (
            <Button onClick={handleContinue}>Continue reading</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
