'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Columns, FileText, MoreHorizontal, Wand2, Trash2, Smile, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { BlockEditor } from '@/components/editor/BlockEditor';
import { CornellLayout } from '@/components/editor/CornellLayout';
import { BacklinksFooter } from '@/components/editor/BacklinksFooter';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { updateNote, deleteNote, createNote, getChildNotes, type Note } from '@/lib/api/notes';
import { usePlatform } from '@/hooks/usePlatform';
import { cn } from '@/lib/cn';
import { useFirstTimeHint } from '@/hooks/useFirstTimeHint';
import { FirstTimeHint } from '@/components/patterns/FirstTimeHint';
import { useAIStatus } from '@/contexts/AIStatusContext';
import { SaveStatusIndicator, type SaveStatus } from '@/components/editor/SaveStatusIndicator';

function scoreBadgeClass(score: number): string {
  if (score >= 80) return 'bg-[hsl(var(--success-soft))] text-[hsl(var(--success))]';
  if (score >= 60) return 'bg-[hsl(var(--warning-soft))] text-[hsl(var(--warning))]';
  return 'bg-[hsl(var(--danger-soft))] text-[hsl(var(--danger))]';
}

function ScoreSparkline({ history }: { history: { score: number; timestamp: string }[] }) {
  const scores = history.slice(-10);
  if (scores.length < 2) return null;
  const W = 80, H = 24;
  const min = Math.min(...scores.map(h => h.score));
  const max = Math.max(...scores.map(h => h.score));
  const range = Math.max(max - min, 10);
  const pts = scores
    .map((h, i) => {
      const x = (i / (scores.length - 1)) * W;
      const y = H - ((h.score - min) / range) * H;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg width={W} height={H} className="mt-1.5" aria-label="Score trend">
      <polyline
        points={pts}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface NoteEditorClientProps {
  initialNote: Note;
  setId: string;
}

export function NoteEditorClient({ initialNote, setId }: NoteEditorClientProps) {
  const [note, setNote]           = useState(initialNote);
  const [isCornell, setIsCornell] = useState(initialNote.isCornell);
  const [title, setTitle]         = useState(initialNote.title);
  const [cornellScore, setCornellScore] = useState<number | null>(
    initialNote.cornellScore ?? null,
  );
  const [scoreHistory, setScoreHistory] = useState<{ score: number; timestamp: string }[]>(
    initialNote.scoreHistory ?? [],
  );
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showTightenCues, setShowTightenCues]   = useState(false);

  // Save / index status — drives the chip next to the Cornell/Linear toggle.
  // Timeline: onChange (post 800ms editor debounce) → 'saving' → updateNote
  // resolves → 'saved' (3.5s) → 'indexing' (3s ~= notesIndexer server debounce)
  // → 'indexed' (4s) → 'idle'.
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function scheduleStatus(next: SaveStatus, delayMs: number): void {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      setSaveStatus(next);
    }, delayMs);
  }
  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  const [childNotes, setChildNotes] = useState<Note[]>([]);
  // Bumped on every successful content save so BacklinksFooter refetches —
  // catches the user removing a `[[link]]` or `subpage` block from another
  // note that references this one.
  const [backlinkRefreshKey, setBacklinkRefreshKey] = useState(0);

  const platform = usePlatform();
  const router   = useRouter();
  const titleRef = useRef<HTMLInputElement>(null);
  // Fetch child notes for the Subpages footer
  const fetchChildNotes = useCallback(() => {
    getChildNotes(setId, note._id).then(setChildNotes).catch((err: unknown) => {
      console.warn('Failed to load child notes:', err);
    });
  }, [setId, note._id]);

  useEffect(() => { fetchChildNotes(); }, [fetchChildNotes]);

  const { shouldShow: showCornellHint } = useFirstTimeHint('hint:cornell-review');
  const { status: aiStatus } = useAIStatus();
  const aiUnavailable = aiStatus === 'unavailable';

  async function withSaveToast<T>(fn: () => Promise<T>, label: string): Promise<T | undefined> {
    try {
      return await fn();
    } catch (err: unknown) {
      const body = (err as Record<string, unknown>)?.body as Record<string, unknown> | undefined;
      const reason = typeof body?.error === 'string' ? body.error : ((err as Error)?.message ?? 'Retry?');
      toast.error(`Couldn't ${label}. ${reason}`);
      return undefined;
    }
  }

  // ⌘⇧E toggles Cornell layout
  useEffect(() => {
    const mod = platform === 'mac' ? 'metaKey' : 'ctrlKey';
    function handler(e: KeyboardEvent) {
      if ((e[mod as keyof KeyboardEvent] as boolean) && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        handleToggleCornell();
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, isCornell]);

  function handleToggleCornell() {
    const next = !isCornell;
    setIsCornell(next);
    void withSaveToast(
      () => updateNote(note._id, note.studySetId, { isCornell: next }).then(updated => { setNote(updated); }),
      'update layout',
    );
  }

  function handleTitleBlur() {
    if (title !== note.title) {
      void withSaveToast(
        () => updateNote(note._id, note.studySetId, { title }).then(updated => { setNote(updated); }),
        'save title',
      );
    }
  }

  function handleContentChange(
    field: 'content' | 'cornellCue' | 'cornellSummary',
    value: unknown,
  ) {
    setNote(prev => ({ ...prev, [field]: value }));
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveStatus('saving');
    updateNote(note._id, note.studySetId, { [field]: value })
      .then(() => {
        setSaveStatus('saved');
        // Cue the backlinks footer to refetch — a save here may have added
        // or removed a `[[link]]` / subpage to / from another note.
        setBacklinkRefreshKey(k => k + 1);
        // notesIndexer.ts debounces the reindex 3s after the save; let the
        // indicator say "Indexing…" during that window, then "Indexed".
        scheduleStatus('indexing', 3500);
        saveTimerRef.current = setTimeout(() => {
          setSaveStatus('indexed');
          saveTimerRef.current = setTimeout(() => {
            saveTimerRef.current = null;
            setSaveStatus('idle');
          }, 4000);
        }, 3500);
      })
      .catch((err: unknown) => {
        setSaveStatus('idle');
        const body = (err as Record<string, unknown>)?.body as Record<string, unknown> | undefined;
        const reason = typeof body?.error === 'string' ? body.error : 'Retry?';
        toast.error(`Couldn't save content. ${reason}`, { id: 'content-save-error' });
      });
  }

  async function handleDelete() {
    try {
      await deleteNote(note._id, note.studySetId);
      router.push(`/sets/${setId}/notes`);
    } catch (err: unknown) {
      const body = (err as Record<string, unknown>)?.body as Record<string, unknown> | undefined;
      const reason = typeof body?.error === 'string' ? body.error : ((err as Error)?.message ?? 'Retry?');
      toast.error(`Couldn't delete note. ${reason}`);
    }
  }

  function handleScoreUpdate(
    score: number,
    history: { score: number; timestamp: string }[],
  ) {
    setCornellScore(score);
    setScoreHistory(history);
  }

  async function handleContinueWithNewTopic() {
    try {
      const newNote = await createNote(setId, 'Untitled');
      router.push(`/sets/${setId}/notes/${newNote._id}`);
    } catch {
      toast.error("Couldn't create note. Try again.");
    }
  }

  // Shared Notion-style header (title + icon/cover affordance + action row)
  const notionHeader = (
    <div className="px-4 md:px-12 lg:px-24">
      {/* Icon / cover affordance — disabled v1, UI ready for phase 22 */}
      <div className="mb-3 flex items-center gap-2 opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* TODO(phase-22): icon/cover persistence */}
              <button
                disabled
                aria-disabled
                className="flex cursor-not-allowed items-center gap-1.5 rounded px-2 py-1 text-xs text-foreground-muted hover:bg-surface-2"
              >
                <Smile className="h-3.5 w-3.5" aria-hidden="true" />
                Add icon
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Coming soon</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* TODO(phase-22): icon/cover persistence */}
              <button
                disabled
                aria-disabled
                className="flex cursor-not-allowed items-center gap-1.5 rounded px-2 py-1 text-xs text-foreground-muted hover:bg-surface-2"
              >
                <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                Add cover
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Coming soon</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Large Notion-style title */}
      <input
        ref={titleRef}
        value={title}
        onChange={e => setTitle(e.target.value)}
        onBlur={handleTitleBlur}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); titleRef.current?.blur(); }
        }}
        placeholder="Untitled"
        className="mb-3 w-full bg-transparent text-[40px] font-semibold leading-tight text-foreground placeholder:text-foreground-subtle focus-visible:outline-none"
        aria-label="Note title"
      />

      {/* Action row — right-aligned, ghost buttons */}
      <div className="mb-4 flex items-center justify-end gap-1">
        {/* Save / index status chip */}
        <SaveStatusIndicator status={saveStatus} className="mr-2" />

        {/* Cornell score badge */}
        {isCornell && cornellScore !== null && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    'mr-1 flex cursor-help items-center gap-1.5 rounded-full px-2 py-0.5 text-xs',
                    scoreBadgeClass(cornellScore),
                  )}
                >
                  <span className="text-foreground-muted">Cornell</span>
                  <span className="font-mono font-medium">{cornellScore}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="flex flex-col">
                <p>Cornell note quality score: {cornellScore}/100</p>
                <p className="text-xs opacity-70">Updated when you commit staged blocks</p>
                <ScoreSparkline history={scoreHistory} />
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Back to notes list */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant="ghost" size="sm" className="gap-1.5 text-foreground-muted">
                <Link href={`/sets/${setId}/notes`}>
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Back to notes</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Cornell toggle */}
        <div className="relative">
          <button
            onClick={handleToggleCornell}
            className={cn(
              'flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              isCornell
                ? 'bg-primary/10 text-primary'
                : 'text-foreground-muted hover:bg-surface-2',
            )}
            aria-pressed={isCornell}
            aria-label="Toggle Cornell layout"
            title="Toggle Cornell layout (⌘⇧E)"
          >
            <Columns className="h-3.5 w-3.5" aria-hidden="true" />
            {isCornell ? 'Cornell' : 'Linear'}
          </button>
          {isCornell && showCornellHint && (
            <FirstTimeHint
              hintId="hint:cornell-review"
              content="Press ⌘R to test yourself from cues"
              position="bottom"
            />
          )}
        </div>

        {/* Options menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="cursor-pointer rounded-md p-1.5 text-foreground-muted hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              aria-label="More options"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isCornell && (
              <>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <DropdownMenuItem
                          onClick={() => !aiUnavailable && setShowTightenCues(true)}
                          className="gap-2"
                          disabled={aiUnavailable}
                          aria-disabled={aiUnavailable}
                        >
                          <Wand2 className="h-3.5 w-3.5" aria-hidden />
                          Tighten cues
                        </DropdownMenuItem>
                      </span>
                    </TooltipTrigger>
                    {aiUnavailable && (
                      <TooltipContent side="left" className="text-xs">
                        AI unavailable
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem
              onClick={() => setShowDeleteDialog(true)}
              className="gap-2 text-[hsl(var(--danger))] focus:text-[hsl(var(--danger))]"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Delete note
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Delete confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &ldquo;{note.title || 'Untitled'}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This note will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isCornell ? (
        /* Cornell mode: Notion-style header (shrink-0) + Cornell layout fills rest */
        <>
          <div className="shrink-0 pt-8 pb-0">
            {notionHeader}
          </div>
          <div className="flex-1 min-h-0">
            <CornellLayout
              note={note}
              onContentChange={handleContentChange}
              onScoreUpdate={handleScoreUpdate}
              showTightenCues={showTightenCues}
              onTightenCuesClose={() => setShowTightenCues(false)}
            />
          </div>
        </>
      ) : (
        /* Linear mode: single scrollable column — title + editor + continue button */
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="pt-8 pb-[30vh]">
            {notionHeader}
            <div className="px-4 md:px-12 lg:px-24">
              <BlockEditor
                content={note.content}
                onChange={val => handleContentChange('content', val)}
                studySetId={note.studySetId}
                currentNoteId={note._id}
              />
              {/* Subpages footer — shows child notes created via /page */}
              {childNotes.length > 0 && (
                <div className="mt-8 border-t border-border pt-6">
                  <p className="mb-3 text-xs font-medium uppercase tracking-wider text-foreground-subtle">
                    Subpages
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {childNotes.map(child => (
                      <Link
                        key={child._id}
                        href={`/sets/${setId}/notes/${child._id}`}
                        className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground hover:bg-surface-3 transition-colors"
                      >
                        <FileText className="h-4 w-4 shrink-0 text-foreground-subtle" aria-hidden="true" />
                        <span className="font-medium hover:underline">{child.title || 'Untitled'}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Backlinks — "what other notes reference this one" */}
              <BacklinksFooter
                noteId={note._id}
                studySetId={note.studySetId}
                refreshKey={backlinkRefreshKey}
              />

              {/* Task 21.4: Continue with a new topic */}
              <div className="mt-8 flex justify-center">
                <button
                  onClick={handleContinueWithNewTopic}
                  className="text-[13px] text-foreground-subtle hover:text-foreground hover:bg-surface-2 rounded-md px-4 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  + Continue with a new topic
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
