'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles, ArrowDownToLine, Replace, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAIStatus, detectAIErrorReason } from '@/contexts/AIStatusContext';
import { cn } from '@/lib/cn';

export type NoteAction = 'summarize' | 'explain' | 'key-points';

interface AISlashCommandDialogProps {
  action:      NoteAction | null;
  text:        string;
  studySetId?: string;
  open:        boolean;
  onClose:     () => void;
  onInsert:    (text: string) => void;
  onReplace:   (text: string) => void;
}

const ACTION_TITLES: Record<NoteAction, string> = {
  'summarize':  'Summarize',
  'explain':    'Explain',
  'key-points': 'Key Points',
};

export function AISlashCommandDialog({
  action, text, studySetId, open, onClose, onInsert, onReplace,
}: AISlashCommandDialogProps) {
  const [content, setContent]     = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const abortRef                  = useRef<AbortController | null>(null);
  const { setUnavailable, setAvailable } = useAIStatus();

  useEffect(() => {
    if (!open || !action) return;
    let cancelled = false;
    const abort = new AbortController();
    abortRef.current = abort;
    setContent('');
    setError(null);
    setStreaming(true);

    let accumulated = '';
    fetch('/api/ai/note-action', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      signal:  abort.signal,
      body:    JSON.stringify({ action, text, studySetId }),
    })
      .then(async (res) => {
        if (!res.ok || !res.body) {
          setUnavailable(detectAIErrorReason(res.status));
          throw new Error(`Note action failed: ${res.status}`);
        }
        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n');
          buffer = parts.pop() ?? '';
          for (const line of parts) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6);
            if (raw === '[DONE]') continue;
            try {
              const parsed = JSON.parse(raw);
              if (parsed.done) continue;
              if (parsed.error) { setError(parsed.error); continue; }
              accumulated += parsed.token ?? '';
              if (!cancelled) setContent(accumulated);
            } catch {
              // skip malformed frames
            }
          }
        }
        setAvailable();
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        if (!cancelled) setError('AI is unavailable. Try again.');
      })
      .finally(() => {
        if (!cancelled) setStreaming(false);
      });

    return () => { cancelled = true; abort.abort(); };
  }, [open, action, text, studySetId, setUnavailable, setAvailable]);

  function handleClose() {
    abortRef.current?.abort();
    onClose();
  }

  function handleInsert() {
    if (!content.trim()) return;
    onInsert(content);
    onClose();
  }

  function handleReplace() {
    if (!content.trim()) return;
    onReplace(content);
    onClose();
  }

  const title = action ? ACTION_TITLES[action] : '';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent
        className="max-w-lg"
        onEscapeKeyDown={handleClose}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-[120px] max-h-[400px] overflow-y-auto rounded-md bg-surface-2 p-3 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
          {content ? content : streaming ? (
            <span className="flex items-center gap-2 text-foreground-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Generating…
            </span>
          ) : (
            <span className="text-foreground-subtle italic">No content yet.</span>
          )}
          {streaming && content && (
            <span
              className={cn('inline-block w-2 h-[1em] ml-0.5 bg-foreground/60 align-text-bottom animate-pulse')}
              aria-hidden="true"
            />
          )}
        </div>

        {error && (
          <p className="text-xs text-danger" role="alert">{error}</p>
        )}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={handleClose} className="gap-1.5">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            {streaming ? 'Cancel' : 'Close'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReplace}
            disabled={streaming || !content.trim()}
            className="gap-1.5"
          >
            <Replace className="h-3.5 w-3.5" aria-hidden="true" />
            Replace
          </Button>
          <Button
            size="sm"
            onClick={handleInsert}
            disabled={streaming || !content.trim()}
            className="gap-1.5"
          >
            <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden="true" />
            Insert below
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
