'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Brain, Plus, ChevronDown, ChevronUp, BookX, Trash2 } from 'lucide-react';
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
import { EmptyState } from '@/components/patterns/EmptyState';
import { type SynapseDocument } from '@/lib/api/documents';
import { type Note } from '@/lib/api/notes';
import { type FeynmanSession, getFeynmanSessions, deleteFeynmanSession } from '@/lib/api/feynman';
import { formatRelative } from '@/lib/format/date';
import { cn } from '@/lib/cn';
import { useAIStatus } from '@/contexts/AIStatusContext';

interface FeynmanStartScreenProps {
  studySetId:   string;
  studySetName: string;
  documents:    SynapseDocument[];
  notes?:       Note[];
  initialTopic?: string;
}

type SourceOption = {
  id:    string;
  label: string;
  kind:  'pdf' | 'note';
};

// `clarity` is expected on the 0..100 scale (Mongo convention).
function ClarityRing({ clarity, size = 40 }: { clarity: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(clarity)));
  const sw = 3;
  const r = (size - sw * 2) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct >= 70 ? 'hsl(var(--primary))'
              : pct >= 40 ? 'hsl(var(--warning))'
              : 'hsl(var(--danger))';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--border))" strokeWidth={sw} />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%" y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="10"
        fontFamily="monospace"
        fill="hsl(var(--foreground))"
      >
        {pct}
      </text>
    </svg>
  );
}

function SessionRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 h-9 animate-pulse">
      <div className="flex-1 h-3 rounded bg-surface-2" />
      <div className="w-16 h-3 rounded bg-surface-2" />
      <div className="w-10 h-10 rounded-full bg-surface-2" />
      <div className="w-14 h-3 rounded bg-surface-2" />
    </div>
  );
}

export function FeynmanStartScreen({
  studySetId,
  studySetName,
  documents,
  notes = [],
  initialTopic = '',
}: FeynmanStartScreenProps) {
  const router  = useRouter();
  const [topic, setTopic]     = useState(initialTopic);
  const [docId, setDocId]     = useState('');
  // Difficulty locks the rubric strictness for the session's lifetime —
  // see DIFFICULTY_DIRECTIVES in accuracy_rubric.py. Default = medium.
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const { status: aiStatus } = useAIStatus();
  const aiUnavailable = aiStatus === 'unavailable';

  const [sessions, setSessions]           = useState<FeynmanSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [showAll, setShowAll]             = useState(false);
  const [deletingId, setDeletingId]       = useState<string | null>(null);
  // Two-stage delete: trash click opens the confirm dialog, OK runs the
  // actual delete. Keeping the candidate in state (vs. a one-shot prompt)
  // lets us show the session title in the dialog body.
  const [pendingDelete, setPendingDelete] = useState<FeynmanSession | null>(null);
  const [deleteError, setDeleteError]     = useState<string | null>(null);

  useEffect(() => {
    getFeynmanSessions(studySetId)
      .then(setSessions)
      .catch(() => { /* silently fail — list is non-critical */ })
      .finally(() => setSessionsLoading(false));
  }, [studySetId]);

  function requestDelete(session: FeynmanSession, e: React.MouseEvent) {
    // The row is wrapped in a clickable nav button — stop propagation so the
    // trash click doesn't also navigate to the session.
    e.stopPropagation();
    e.preventDefault();
    setDeleteError(null);
    setPendingDelete(session);
  }

  async function confirmDelete() {
    const session = pendingDelete;
    if (!session) return;
    setDeletingId(session._id);
    setPendingDelete(null);
    // Optimistic remove; restore on failure.
    const snapshot = sessions;
    setSessions(prev => prev.filter(s => s._id !== session._id));
    try {
      await deleteFeynmanSession(session._id);
    } catch {
      setSessions(snapshot);
      setDeleteError('Could not delete the session. Try again in a moment.');
    } finally {
      setDeletingId(null);
    }
  }

  const readyDocs = documents.filter(d => d.ingestionStatus === 'ready');
  const sourceOptions: SourceOption[] = [
    ...readyDocs.map<SourceOption>(d => ({ id: d._id, label: d.title, kind: 'pdf' })),
    ...notes.map<SourceOption>(n => ({ id: n._id, label: n.title || 'Untitled', kind: 'note' })),
  ];
  const hasSource = sourceOptions.length > 0;
  const displayedSessions = showAll ? sessions : sessions.slice(0, 3);

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/feynman/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studySetId, topic: topic.trim(), documentId: docId || undefined, difficulty }),
      });

      if (!res.ok) throw new Error('Failed to start session');

      const session = await res.json() as {
        _id?: string;
        question?: string;
        suggestedSets?: Array<{ studySetId: string; studySetName: string }>;
      };
      if (!session._id || !/^[a-f0-9]{24}$/i.test(session._id)) {
        setError('Could not start session. Please try again.');
        setLoading(false);
        return;
      }
      // Stash the cross-set candidates so the session screen can show a
      // chooser. Keyed by sessionId so it disappears on dismiss or stale
      // revisits. Skipped entirely when there are no other matching sets.
      if (session.suggestedSets && session.suggestedSets.length > 0 && typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(
            `feynman:suggested-sets:${session._id}`,
            JSON.stringify(session.suggestedSets),
          );
        } catch { /* quota / disabled — non-fatal */ }
      }
      router.push(`/sets/${studySetId}/feynman?sessionId=${session._id}`);
    } catch {
      setError('Could not start session. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="px-content-x py-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <Brain className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-h1 text-foreground">Feynman Technique</h1>
          <p className="text-sm text-foreground-muted">{studySetName}</p>
        </div>
      </div>

      {/* No source warning */}
      {!hasSource && (
        <EmptyState
          icon={<BookX className="h-6 w-6" aria-hidden="true" />}
          headline="Add source material first."
          subline="Upload a PDF or write a note."
          action={
            <Button variant="outline" size="sm" onClick={() => router.push(`/sets/${studySetId}`)}>
              Upload PDF
            </Button>
          }
          className="mb-8 rounded-lg border border-border bg-surface-2"
        />
      )}

      {/* Dumb mode notice */}
      {aiUnavailable && (
        <div className="mb-6 rounded-lg border border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning-soft))] px-4 py-3 text-sm text-[hsl(var(--warning))]">
          Session writable but not gradeable until AI returns.
        </div>
      )}

      {/* New session form */}
      <form onSubmit={handleStart} aria-label="Start a new Feynman session">
        <fieldset className="space-y-5" disabled={loading}>
          <div className="text-center">
            <label
              htmlFor="feynman-topic"
              className="block text-xs font-medium text-foreground-muted uppercase tracking-wider mb-4"
            >
              Topic or concept
            </label>
            <input
              id="feynman-topic"
              type="text"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="What will you teach today?"
              required
              className="w-full border-0 border-b-2 border-border bg-transparent text-h1 text-foreground placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:border-primary pb-2 transition-colors text-center"
            />
          </div>

          {hasSource && (
            <div className="space-y-1.5">
              <label htmlFor="feynman-doc" className="text-xs font-medium text-foreground-muted uppercase tracking-wider">
                Source material <span className="normal-case font-normal">(optional)</span>
              </label>
              <select
                id="feynman-doc"
                value={docId}
                onChange={e => setDocId(e.target.value)}
                className={cn(
                  'w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground',
                  'outline-none focus:ring-2 focus:ring-focus-ring transition-shadow cursor-pointer'
                )}
              >
                <option value="">No source (free recall)</option>
                {sourceOptions.map(opt => (
                  <option key={`${opt.kind}:${opt.id}`} value={opt.id}>
                    [{opt.kind === 'pdf' ? 'PDF' : 'Note'}] {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Difficulty — locks rubric strictness for this session's life.
              Easy is lenient (good for first attempts), Hard demands
              near-textbook completeness for a "covered" verdict. */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground-muted uppercase tracking-wider">
              Difficulty
            </label>
            <div
              role="radiogroup"
              aria-label="Session difficulty"
              className="grid grid-cols-3 gap-1.5"
            >
              {([
                { value: 'easy',   label: 'Easy',   desc: 'Lenient grading'   },
                { value: 'medium', label: 'Medium', desc: 'Standard rubric'   },
                { value: 'hard',   label: 'Hard',   desc: 'Demands depth'     },
              ] as const).map(opt => {
                const active = difficulty === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setDifficulty(opt.value)}
                    className={cn(
                      'rounded-md border px-2 py-1.5 text-left transition-colors cursor-pointer',
                      active
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-surface-2 text-foreground-muted hover:bg-surface-3 hover:text-foreground',
                    )}
                  >
                    <div className="text-[13px] font-medium">{opt.label}</div>
                    <div className="text-[10px] text-foreground-subtle mt-0.5">{opt.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <p role="alert" className="text-xs text-danger text-center">{error}</p>
          )}

          <div className="flex justify-center">
            <Button type="submit" className="gap-2 px-8" disabled={!topic.trim() || loading || aiUnavailable}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {loading ? 'Starting…' : aiUnavailable ? 'AI unavailable' : 'Start session'}
            </Button>
          </div>
        </fieldset>
      </form>

      {/* Past sessions */}
      <section className="mt-10" aria-labelledby="past-sessions-heading">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2
              id="past-sessions-heading"
              className="text-xs font-medium uppercase tracking-wider text-foreground-subtle"
            >
              Past sessions
            </h2>
            {!sessionsLoading && sessions.length > 0 && (
              <span className="text-[11px] font-mono text-foreground-muted bg-surface-2 px-1.5 py-0.5 rounded">
                {sessions.length}
              </span>
            )}
          </div>
          {!sessionsLoading && sessions.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAll(v => !v)}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
              aria-expanded={showAll}
            >
              {showAll
                ? <><ChevronUp className="h-3 w-3" aria-hidden="true" /> Show less</>
                : <>See all <ChevronDown className="h-3 w-3" aria-hidden="true" /></>
              }
            </button>
          )}
        </div>

        <div className="border-b border-border mb-1" role="separator" />

        {/* Skeleton */}
        {sessionsLoading && (
          <div className="flex flex-col gap-0.5">
            <SessionRowSkeleton />
            <SessionRowSkeleton />
            <SessionRowSkeleton />
          </div>
        )}

        {/* Empty state */}
        {!sessionsLoading && sessions.length === 0 && (
          <EmptyState
            icon={<Brain className="h-6 w-6" aria-hidden="true" />}
            headline="No Feynman sessions yet."
            subline="Pick a topic and start explaining."
            action={
              <Button
                variant="outline"
                onClick={() => {
                  const el = document.getElementById('feynman-topic');
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    (el as HTMLInputElement).focus();
                  }
                }}
              >
                <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
                Start a session
              </Button>
            }
          />
        )}

        {/* Session rows */}
        {!sessionsLoading && sessions.length > 0 && (
          <div className="flex flex-col gap-0.5" role="list">
            {displayedSessions.map(session => {
              const isComplete = session.status === 'complete';
              const cta        = isComplete ? 'View report' : '▶ Resume';
              const verb       = isComplete ? 'View report for' : 'Resume';
              const isDeleting = deletingId === session._id;
              return (
                <div
                  key={session._id}
                  role="listitem"
                  className={cn(
                    'group flex items-center gap-3 px-3 rounded-md hover:bg-surface transition-colors',
                    isDeleting && 'opacity-50 pointer-events-none',
                  )}
                  style={{ height: '36px' }}
                >
                  <button
                    type="button"
                    onClick={() => router.push(`/sets/${studySetId}/feynman?sessionId=${session._id}`)}
                    className="flex-1 flex items-center gap-3 text-left h-full"
                    aria-label={`${verb} session: ${session.topic}`}
                  >
                    <span className="flex-1 text-[13px] text-foreground truncate">{session.topic}</span>
                    <span className="text-[11px] font-mono text-foreground-muted shrink-0">
                      {formatRelative(session.updatedAt)}
                    </span>
                    <ClarityRing clarity={session.clarityScore ?? 0} size={40} />
                    <span className={cn(
                      'text-[13px] shrink-0',
                      isComplete ? 'text-foreground-muted' : 'text-primary',
                    )}>
                      {cta}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => requestDelete(session, e)}
                    disabled={isDeleting}
                    aria-label={`Delete session: ${session.topic}`}
                    title="Delete session"
                    className={cn(
                      'rounded p-1 transition-all shrink-0',
                      'text-foreground-subtle hover:text-danger hover:bg-danger-soft',
                      // Hidden until the row is hovered/focused so the dashboard
                      // stays clean. Always visible while a delete is in flight.
                      'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                      isDeleting && 'opacity-100',
                    )}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Delete confirm — styled AlertDialog instead of the native
          window.confirm so it fits the dark theme and stays cancellable. */}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this session?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? <>You&apos;ll lose the session <span className="font-medium text-foreground">&quot;{pendingDelete.topic}&quot;</span> from this dashboard. This can&apos;t be undone here.</>
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void confirmDelete(); }}
              className="bg-danger text-white hover:bg-danger/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Inline error if the delete round-trip fails. Dismissible by clicking
          anywhere in it. Toast-system not required for one infrequent path. */}
      {deleteError && (
        <button
          type="button"
          role="alert"
          onClick={() => setDeleteError(null)}
          className="fixed bottom-6 right-6 rounded-md border border-danger/40 bg-danger-soft px-4 py-2 text-sm text-danger shadow-lg hover:bg-danger-soft/80 transition-colors"
        >
          {deleteError} <span className="ml-2 opacity-60 text-xs">(click to dismiss)</span>
        </button>
      )}
    </div>
  );
}
