'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { BlockEditor } from './BlockEditor';
import { updateNote, scoreCornellNote, type Note } from '@/lib/api/notes';
import { getFlashcards, type Flashcard } from '@/lib/api/flashcards';
import { useStagingContext } from '@/contexts/StagingContext';
import { useFirstTimeHint } from '@/hooks/useFirstTimeHint';
import { FirstTimeHint } from '@/components/patterns/FirstTimeHint';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CueFlashcardHoverCard } from '@/components/cornell/CueFlashcardHoverCard';
import { cn } from '@/lib/cn';
import { useAIStatus } from '@/contexts/AIStatusContext';

export interface StagedBlock {
  id: string;
  content: string;
  type: 'cue' | 'note';
}

interface CornellLayoutProps {
  note: Note;
  onContentChange: (field: 'content' | 'cornellCue' | 'cornellSummary', value: unknown) => void;
  onScoreUpdate?: (score: number, history: { score: number; timestamp: string }[]) => void;
  showTightenCues?: boolean;
  onTightenCuesClose?: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function extractBlockTexts(blocks: unknown): string[] {
  if (!Array.isArray(blocks)) return [];
  return (
    blocks as Array<{ content?: Array<{ type: string; text?: string }> }>
  )
    .map(b => {
      if (!Array.isArray(b.content)) return '';
      return b.content
        .filter(c => c.type === 'text')
        .map(c => c.text ?? '')
        .join('');
    })
    .filter(t => t.trim().length > 0);
}

function applyToBlocks(
  blocks: unknown,
  applied: Map<string, string>,
): unknown {
  if (!Array.isArray(blocks)) return blocks;
  return (
    blocks as Array<{
      content?: Array<{ type: string; text?: string }>;
      [k: string]: unknown;
    }>
  ).map(block => {
    if (!Array.isArray(block.content)) return block;
    const text = block.content
      .filter(c => c.type === 'text')
      .map(c => c.text ?? '')
      .join('');
    const suggested = applied.get(text);
    if (!suggested) return block;
    return {
      ...block,
      content: block.content.map((c, i) =>
        c.type !== 'text' ? c : i === 0 ? { ...c, text: suggested } : { ...c, text: '' },
      ),
    };
  });
}

async function streamCoach(studySetId: string, message: string): Promise<string> {
  const res = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history: [], studySetId }),
  });
  if (!res.ok || !res.body) throw new Error('Coach unavailable');
  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let out = '';

  function ingest(line: string): void {
    if (!line.startsWith('data: ')) return;
    const raw = line.slice(6);
    if (raw === '[DONE]') return;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.done) return;
      out += parsed.token ?? '';
    } catch {
      // Malformed/partial frame — drop it.
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n');
    buffer = parts.pop() ?? '';
    for (const line of parts) ingest(line);
  }
  buffer += decoder.decode();
  if (buffer.length > 0) ingest(buffer);
  return out;
}

function computeScore(note: Note, staged: number): number {
  const has = (v: unknown) =>
    Array.isArray(v) &&
    v.length > 0 &&
    (v as { content?: unknown[] }[]).some(b => Array.isArray(b.content) && b.content.length > 0);
  let s = 0;
  if (has(note.cornellCue)) s += 35;
  if (has(note.content)) s += 35;
  if (has(note.cornellSummary)) s += 30;
  if (staged > 0) s = Math.min(100, s + Math.min(staged * 3, 15));
  return Math.min(100, Math.max(0, s));
}

// ── TightenCuesDialog ──────────────────────────────────────────────────────

interface Suggestion {
  original: string;
  suggested: string;
}

function TightenCuesDialog({
  open,
  onClose,
  cueBlocks,
  studySetId,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  cueBlocks: unknown;
  studySetId: string;
  onApply: (newBlocks: unknown) => void;
}) {
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [applied, setApplied]         = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) {
      setSuggestions([]);
      setApplied(new Set());
      setError(null);
      return;
    }
    const cues = extractBlockTexts(cueBlocks);
    if (!cues.length) {
      setError('No cue text found. Add some cues first.');
      return;
    }
    setLoading(true);
    setError(null);
    const prompt = [
      'Analyze these Cornell note cues and suggest sharper, question-style versions.',
      'Return ONLY a JSON array — no other text: [{"original":"...","suggested":"..."}]',
      '',
      'Cues:',
      ...cues.map((c, i) => `${i + 1}. "${c}"`),
    ].join('\n');
    streamCoach(studySetId, prompt)
      .then(text => {
        const m = text.match(/\[[\s\S]*?\]/);
        if (!m) throw new Error('bad response');
        setSuggestions(JSON.parse(m[0]) as Suggestion[]);
      })
      .catch(() => setError('Could not get suggestions. Please try again.'))
      .finally(() => setLoading(false));
  }, [open, cueBlocks, studySetId]);

  function toggle(orig: string) {
    setApplied(prev => {
      const next = new Set(prev);
      next.has(orig) ? next.delete(orig) : next.add(orig);
      return next;
    });
  }

  function commit() {
    const map = new Map<string, string>();
    applied.forEach(orig => {
      const s = suggestions.find(x => x.original === orig);
      if (s) map.set(s.original, s.suggested);
    });
    onApply(applyToBlocks(cueBlocks, map));
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tighten Cues</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 max-h-96 overflow-y-auto py-2">
          {loading &&
            [0, 1, 2].map(i => (
              <div key={i} className="flex items-center gap-3 px-2">
                <Skeleton className="h-4 flex-1" />
                <span className="shrink-0 text-foreground-subtle">→</span>
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-8 w-16 shrink-0 rounded-md" />
              </div>
            ))}

          {error && (
            <p className="px-2 text-sm text-[hsl(var(--danger))]">{error}</p>
          )}

          {!loading &&
            suggestions.map(({ original, suggested }) => {
              const on = applied.has(original);
              return (
                <div
                  key={original}
                  className="flex items-start gap-3 rounded-md px-2 py-1.5 hover:bg-surface-2"
                >
                  <p
                    className={cn(
                      'flex-1 text-sm',
                      on && 'line-through text-foreground-subtle',
                    )}
                  >
                    {original}
                  </p>
                  <span className="mt-0.5 shrink-0 text-foreground-subtle">→</span>
                  <p className={cn('flex-1 text-sm', on && 'font-medium text-primary')}>
                    {suggested}
                  </p>
                  <Button
                    size="sm"
                    variant={on ? 'default' : 'outline'}
                    className="shrink-0"
                    onClick={() => toggle(original)}
                  >
                    {on ? 'Applied' : 'Apply'}
                  </Button>
                </div>
              );
            })}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {!loading && suggestions.length > 0 && applied.size < suggestions.length && (
            <Button
              variant="outline"
              onClick={() => setApplied(new Set(suggestions.map(s => s.original)))}
            >
              Apply all
            </Button>
          )}
          {applied.size > 0 && (
            <Button
              onClick={() => {
                commit();
                onClose();
              }}
            >
              Update {applied.size} cue{applied.size !== 1 ? 's' : ''}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── CornellLayout ──────────────────────────────────────────────────────────

export function CornellLayout({
  note,
  onContentChange,
  onScoreUpdate,
  showTightenCues = false,
  onTightenCuesClose,
}: CornellLayoutProps) {
  // Split percentage (cue column width, 20–40%)
  const storageKey = `cornell-split-${note._id}`;
  const [splitPct, setSplitPct] = useState<number>(() => {
    if (typeof window === 'undefined') return 30;
    const v = Number(localStorage.getItem(storageKey));
    return v >= 20 && v <= 40 ? v : 30;
  });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(storageKey, String(splitPct));
  }, [splitPct, storageKey]);

  // Drag to resize
  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    function move(ev: MouseEvent) {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct  = ((ev.clientX - rect.left) / rect.width) * 100;
      setSplitPct(Math.min(40, Math.max(20, pct)));
    }
    function up() {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }, []);

  // Review mode (⌘R)
  const [reviewMode, setReviewMode] = useState(false);
  const [recallText, setRecallText] = useState('');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        setReviewMode(prev => {
          if (prev) setRecallText('');
          return !prev;
        });
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Staging — initialize from note.stagedBlocks so they survive reload
  const [stagedBlocks, setStagedBlocks]  = useState<StagedBlock[]>(
    Array.isArray(note.stagedBlocks) ? (note.stagedBlocks as StagedBlock[]) : [],
  );
  const { setStagedCount, setOnCommit, setOnDiscard } = useStagingContext();
  const { status: aiStatus } = useAIStatus();
  const aiUnavailable = aiStatus === 'unavailable';
  const { shouldShow: showHighlightHint } = useFirstTimeHint('hint:highlight-stage');
  const [hasSelected, setHasSelected]    = useState(false);

  useEffect(() => {
    if (!showHighlightHint) return;
    function onUp() {
      const sel = window.getSelection();
      if (sel && sel.toString().trim().length > 0) setHasSelected(true);
    }
    document.addEventListener('mouseup', onUp);
    return () => document.removeEventListener('mouseup', onUp);
  }, [showHighlightHint]);

  const handleCommit = useCallback(async () => {
    const count = stagedBlocks.length;
    setStagedBlocks([]);
    if (onScoreUpdate) {
      const score = computeScore(note, count);
      try {
        const up = await scoreCornellNote(note.studySetId, note._id, score);
        onScoreUpdate(
          up.cornellScore ?? score,
          (up.scoreHistory ?? []).map(h => ({
            score: h.score,
            timestamp:
              typeof h.timestamp === 'string'
                ? h.timestamp
                : new Date(h.timestamp as unknown as Date).toISOString(),
          })),
        );
      } catch {
        /* non-critical */
      }
    }
  }, [note, stagedBlocks, onScoreUpdate]);

  const handleDiscard = useCallback(() => setStagedBlocks([]), []);

  // Bubble-menu "Stage" hook — appends the selected text to the staging queue.
  // Cornell cue column stages as 'cue'; notes / summary columns stage as 'note'.
  const handleStageFromBubble = useCallback(
    (kind: 'cue' | 'note', payload: { text: string }) => {
      const trimmed = payload.text.trim();
      if (!trimmed) return;
      const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `stg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setStagedBlocks(prev => [...prev, { id, content: trimmed, type: kind }]);
      // Rich behaviour (stage-as-flashcard, picker between cue/note, etc.) is
      // Phase E's job. For now: confirmation toast so the user sees the click
      // registered, plus the StagingContext badge in the SidePanel updates.
      const preview = trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed;
      toast.success(`Staged as ${kind} — “${preview}”`, {
        id: 'bubble-stage',
        description: 'Commit or discard from the staging panel.',
      });
    },
    [],
  );

  // Auto-persist stagedBlocks so they survive page reloads
  const stagedBlocksInitRef = useRef(false);
  useEffect(() => {
    if (!stagedBlocksInitRef.current) {
      stagedBlocksInitRef.current = true;
      return;
    }
    updateNote(note._id, note.studySetId, { stagedBlocks }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stagedBlocks]);

  useEffect(() => {
    setStagedCount(stagedBlocks.length);
  }, [stagedBlocks.length, setStagedCount]);

  useEffect(() => {
    setOnCommit(handleCommit);
    setOnDiscard(handleDiscard);
    return () => {
      setOnCommit(null);
      setOnDiscard(null);
      setStagedCount(0);
    };
  }, [handleCommit, handleDiscard, setOnCommit, setOnDiscard, setStagedCount]);

  // Flashcard linking
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  useEffect(() => {
    getFlashcards(note.studySetId)
      .then(r => setFlashcards(r.cards))
      .catch(() => {});
  }, [note.studySetId]);

  // Remember previously-resolved cue→flashcard mappings so we can show the
  // "deleted" empty state when a linked card disappears from the list.
  const cueLinkSnapshot = useRef<Map<string, string>>(new Map());
  const cueTexts = extractBlockTexts(note.cornellCue);
  const cardsById = useMemo(
    () => new Map(flashcards.map(c => [c._id, c])),
    [flashcards],
  );
  type LinkedEntry = { card: Flashcard | null; cueText: string };
  const linkedCards: LinkedEntry[] = cueTexts.map(cue => {
    const prevId = cueLinkSnapshot.current.get(cue);
    if (prevId) {
      const card = cardsById.get(prevId);
      if (card) return { card, cueText: cue };
      return { card: null, cueText: cue };
    }
    const prefix = cue.toLowerCase().substring(0, 20);
    const found = flashcards.find(f => f.front.toLowerCase().includes(prefix)) ?? null;
    if (found) cueLinkSnapshot.current.set(cue, found._id);
    return { card: found, cueText: cue };
  });
  const linkCount = linkedCards.filter(e => e.card !== null || cueLinkSnapshot.current.has(e.cueText)).length;
  const unlinkCue = useCallback((cue: string) => {
    cueLinkSnapshot.current.delete(cue);
    setFlashcards(prev => prev.slice());
  }, []);

  // Tighten cues: track effective cue blocks for forced remount
  const [effectiveCueBlocks, setEffectiveCueBlocks] = useState<unknown>(null);
  const [cueEditorKey, setCueEditorKey]             = useState(0);

  function handleTightenApply(newBlocks: unknown) {
    onContentChange('cornellCue', newBlocks);
    setEffectiveCueBlocks(newBlocks);
    setCueEditorKey(k => k + 1);
  }

  // Summary scoring
  const summaryWords = extractBlockTexts(note.cornellSummary)
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;
  const [scoringNote, setScoringNote]   = useState(false);
  const [scoreCallout, setScoreCallout] = useState<string | null>(null);

  async function handleScoreSummary() {
    if (scoringNote) return;
    setScoringNote(true);
    setScoreCallout(null);
    try {
      const summary = extractBlockTexts(note.cornellSummary).join('\n');
      const notes   = extractBlockTexts(note.content).join('\n');
      const prompt  = [
        'Score this Cornell note summary against the notes content.',
        'Return ONLY JSON: {"score":85,"feedback":"..."}',
        '',
        'Notes:',
        notes,
        '',
        'Summary:',
        summary,
      ].join('\n');
      const text = await streamCoach(note.studySetId, prompt);
      const m    = text.match(/\{[\s\S]*?\}/);
      if (m) {
        const parsed = JSON.parse(m[0]) as { score: number; feedback: string };
        setScoreCallout(parsed.feedback);
        if (onScoreUpdate) {
          try {
            const up = await scoreCornellNote(note.studySetId, note._id, parsed.score);
            onScoreUpdate(
              up.cornellScore ?? parsed.score,
              (up.scoreHistory ?? []).map(h => ({
                score: h.score,
                timestamp:
                  typeof h.timestamp === 'string'
                    ? h.timestamp
                    : new Date(h.timestamp as unknown as Date).toISOString(),
              })),
            );
          } catch {
            /* non-critical */
          }
        }
      }
    } catch {
      setScoreCallout('Unable to score. Try again.');
    } finally {
      setScoringNote(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tighten Cues Dialog */}
      <TightenCuesDialog
        open={showTightenCues}
        onClose={() => onTightenCuesClose?.()}
        cueBlocks={note.cornellCue}
        studySetId={note.studySetId}
        onApply={handleTightenApply}
      />

      {/* Review Mode Banner */}
      {reviewMode && (
        <div className="shrink-0 flex items-center justify-between border-b border-border px-4 py-1.5 text-xs font-medium bg-[hsl(var(--accent-soft))]">
          <span className="text-foreground-muted">
            Review Mode — cover the notes and recall from your cues
          </span>
          <button
            onClick={() => {
              setReviewMode(false);
              setRecallText('');
            }}
            className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded"
          >
            Exit (⌘R)
          </button>
        </div>
      )}

      {/* Main split: [CUE] [handle] [NOTES/RECALL] */}
      <div ref={containerRef} className="flex flex-1 min-h-0 overflow-hidden">
        {/* CUE COLUMN */}
        <div
          className="flex-none flex flex-col border-r border-border"
          style={{ width: `${splitPct}%` }}
        >
          <div className="flex items-center gap-2 shrink-0 border-b border-border bg-surface px-3 py-2">
            <span className="flex-1 text-xs font-medium uppercase tracking-wider text-foreground-subtle">
              Cue
            </span>
            {linkCount > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex select-none items-center gap-1 rounded px-1 py-0.5 text-xs text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                    aria-label={`${linkCount} cues linked to flashcards`}
                  >
                    <LinkIcon className="h-3 w-3" aria-hidden />
                    {linkCount}
                  </button>
                </PopoverTrigger>
                <PopoverContent side="bottom" align="end" className="w-80 p-2">
                  <p className="px-2 py-1 text-[10px] uppercase tracking-wider text-foreground-subtle">
                    Cues linked to flashcards
                  </p>
                  <ul className="space-y-1">
                    {linkedCards.map((entry, i) =>
                      (entry.card !== null || cueLinkSnapshot.current.has(entry.cueText)) ? (
                        <li
                          key={`${entry.cueText}-${i}`}
                          className="flex items-start gap-2 rounded px-2 py-1.5 hover:bg-surface-2"
                        >
                          <CueFlashcardHoverCard
                            card={entry.card}
                            cueText={entry.cueText}
                            onUnlink={() => unlinkCue(entry.cueText)}
                          />
                          <div className="min-w-0 flex-1">
                            <p
                              className={cn(
                                'text-xs truncate',
                                entry.card ? 'text-foreground' : 'text-foreground-subtle line-through',
                              )}
                            >
                              {entry.cueText}
                            </p>
                            {entry.card && (
                              <p className="text-[10px] text-foreground-muted truncate">
                                → {entry.card.front}
                              </p>
                            )}
                          </div>
                        </li>
                      ) : null,
                    )}
                  </ul>
                </PopoverContent>
              </Popover>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            <BlockEditor
              key={cueEditorKey}
              content={effectiveCueBlocks ?? note.cornellCue}
              onChange={val => {
                setEffectiveCueBlocks(null);
                onContentChange('cornellCue', val);
              }}
              onStage={(_kind, payload) => handleStageFromBubble('cue', payload)}
              placeholder="Key questions and cues…"
              studySetId={note.studySetId}
              disableSubpage
              disableCloze
              mode="cornell-cue"
            />
          </div>
        </div>

        {/* DRAG HANDLE */}
        <div
          className="flex-none w-1 cursor-ew-resize bg-border transition-colors hover:bg-primary/40 active:bg-primary/60"
          onMouseDown={startDrag}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize cue and notes columns"
        />

        {/* RIGHT SIDE: Notes and Recall share this space */}
        <div className="relative flex-1 overflow-hidden">
          {/* NOTES */}
          <div
            className="absolute inset-0 flex flex-col"
            style={{
              opacity: reviewMode ? 0 : 1,
              transform: reviewMode ? 'translateX(12px)' : 'translateX(0)',
              transition: 'opacity 180ms ease-in-out, transform 180ms ease-in-out',
              pointerEvents: reviewMode ? 'none' : 'auto',
            }}
          >
            <div className="shrink-0 border-b border-border bg-surface px-3 py-2">
              <span className="text-xs font-medium uppercase tracking-wider text-foreground-subtle">
                Notes
              </span>
            </div>
            <div className="relative flex-1 overflow-y-auto">
              <BlockEditor
                content={note.content}
                onChange={val => onContentChange('content', val)}
                onStage={(_kind, payload) => handleStageFromBubble('note', payload)}
                placeholder="Your notes…"
                studySetId={note.studySetId}
                currentNoteId={note._id}
                mode="cornell-notes"
              />
              {showHighlightHint && hasSelected && (
                <FirstTimeHint
                  hintId="hint:highlight-stage"
                  content="Highlight → stage it as a flashcard or Cornell note"
                  position="bottom"
                />
              )}
            </div>
          </div>

          {/* RECALL (review mode) */}
          <div
            className="absolute inset-0 flex flex-col"
            style={{
              backgroundColor: 'hsl(var(--accent-soft))',
              opacity: reviewMode ? 1 : 0,
              transform: reviewMode ? 'translateX(0)' : 'translateX(-12px)',
              transition: 'opacity 180ms ease-in-out, transform 180ms ease-in-out',
              pointerEvents: reviewMode ? 'auto' : 'none',
            }}
          >
            <div className="shrink-0 border-b border-border/40 px-3 py-2">
              <span className="text-xs font-medium uppercase tracking-wider text-foreground-muted">
                Recall
              </span>
            </div>
            <textarea
              className="w-full flex-1 resize-none bg-transparent px-4 py-3 text-base leading-relaxed text-foreground placeholder:text-foreground-subtle/50 focus-visible:outline-none"
              style={{
                fontFamily: "'Source Serif 4', Georgia, 'Times New Roman', serif",
                fontSize: '16px',
              }}
              placeholder="Write what you remember from this cue…"
              value={recallText}
              onChange={e => setRecallText(e.target.value)}
              tabIndex={reviewMode ? 0 : -1}
            />
          </div>
        </div>
      </div>

      {/* SUMMARY BAND */}
      <div className="flex h-32 shrink-0 flex-col overflow-hidden border-t-2 border-border">
        <div className="flex shrink-0 items-center border-b border-border bg-surface px-3 py-1.5">
          <span className="flex-1 text-xs font-medium uppercase tracking-wider text-foreground-subtle">
            Summary
          </span>
          {summaryWords >= 50 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleScoreSummary}
                    disabled={scoringNote || aiUnavailable}
                    className="text-xs text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded"
                  >
                    {scoringNote ? 'Scoring…' : 'Score Summary'}
                  </button>
                </TooltipTrigger>
                {aiUnavailable && (
                  <TooltipContent side="top" className="text-xs">
                    AI unavailable
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        {scoreCallout && (
          <div className="shrink-0 border-b border-border bg-[hsl(var(--info-soft))] px-3 py-1.5 text-xs text-foreground-muted">
            {scoreCallout}
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          <BlockEditor
            content={note.cornellSummary}
            onChange={val => onContentChange('cornellSummary', val)}
            onStage={(_kind, payload) => handleStageFromBubble('note', payload)}
            placeholder="Summarize the key ideas in your own words…"
            studySetId={note.studySetId}
            disableSubpage
            disableCloze
            mode="cornell-summary"
          />
        </div>
      </div>
    </div>
  );
}
