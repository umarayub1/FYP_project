'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Bold, Italic, Sigma, Mic, MicOff, Pause, Play, LogOut, HelpCircle, Eye, Columns, Pencil, MessageCircleQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CoverageMap } from './CoverageMap';
import { SkepticModal } from './SkepticModal';
import { FeynmanReport } from './FeynmanReport';
import { type FeynmanSession as Session, type CoverageChunk, type EvaluateResult, type FeynmanGradingSource } from '@/lib/api/feynman';
import { toast } from 'sonner';
import { usePlatform } from '@/hooks/usePlatform';
import { useStudySession } from '@/contexts/StudySessionContext';
import { cn } from '@/lib/cn';
import { useFirstTimeHint } from '@/hooks/useFirstTimeHint';
import { FirstTimeHint } from '@/components/patterns/FirstTimeHint';
import { renderMarkdownWithMath } from '@/lib/markdown/render';
import { TextareaSlashMenu } from '@/components/editor/TextareaSlashMenu';
import { useTextareaSlashMenu } from '@/hooks/useTextareaSlashMenu';
import { SocraticChatPanel } from './SocraticChatPanel';
import 'katex/dist/katex.min.css';

interface FeynmanSessionProps {
  session: Session;
  setId:   string;
}

interface SessionReport {
  clarityScore:  number;
  accuracyScore: number;
  coverage:      CoverageChunk[];
}

const DEBOUNCE_MS = 1500;

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}


export function FeynmanSession({ session, setId }: FeynmanSessionProps) {
  const platform = usePlatform();
  const modKey   = platform === 'mac' ? '⌘' : 'Ctrl';
  const { startSession, endSession } = useStudySession();
  const { shouldShow: showRingHint } = useFirstTimeHint('hint:feynman-ring');

  useEffect(() => {
    startSession('feynman', setId);
    return () => { endSession(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [explanation, setExplanation]   = useState(session.explanation ?? '');
  const [coverage, setCoverage]         = useState<CoverageChunk[]>(session.coverage ?? []);
  // Mongo stores clarityScore / accuracyScore on 0..100. Live evaluate
  // responses are 0..1; the call sites below normalise to 0..100 before
  // landing in state, so every consumer below sees the same scale.
  // Restored unconditionally on resume — an active/paused session that's
  // been evaluated at least once should show its last grade, not 0.
  const [clarityScore, setClarityScore] = useState(
    session.clarityScore != null ? Math.round(session.clarityScore) : 0
  );
  const [paused, setPaused]             = useState(session.status === 'paused');
  const [done, setDone]                 = useState(session.status === 'complete');
  const [report, setReport]             = useState<SessionReport | null>(
    session.status === 'complete'
      ? { clarityScore: session.clarityScore ?? 0, accuracyScore: session.accuracyScore ?? 0, coverage: session.coverage }
      : null
  );
  const [skepticQ, setSkepticQ]         = useState<string | null>(null);
  const [skepticModalOpen, setSkepticModalOpen] = useState(false);
  const [skepticBusy, setSkepticBusy]   = useState(false);

  // Grading source — 'study_set' (default, grounded in user chunks),
  // 'generic' (LLM-only fallback, no source matched the topic), or 'none'
  // (too-short input). Ref tracks first-time transition so we only fire the
  // generic-mode toast once per session, not on every evaluate.
  const [gradingSource, setGradingSource] = useState<FeynmanGradingSource | undefined>(undefined);
  const genericToastFiredRef = useRef(false);

  // Cross-set chooser — populated from sessionStorage stashed by the
  // start screen. We read on mount and clear after dismissal or navigation
  // so the hint doesn't reappear when the user resumes this session later.
  // When the topic matches multiple sets, all are surfaced; the user picks.
  const [suggestedSets, setSuggestedSets] = useState<Array<{
    studySetId:   string;
    studySetName: string;
  }>>([]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = `feynman:suggested-sets:${session._id}`;
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Array<{
        studySetId?:   string;
        studySetName?: string;
      }>;
      if (!Array.isArray(parsed)) return;
      const cleaned = parsed
        .filter((s): s is { studySetId: string; studySetName: string } =>
          typeof s?.studySetId === 'string' && typeof s?.studySetName === 'string')
        .map(s => ({ studySetId: s.studySetId, studySetName: s.studySetName }));
      if (cleaned.length > 0) setSuggestedSets(cleaned);
    } catch { /* invalid JSON / disabled — non-fatal */ }
  }, [session._id]);

  function dismissSuggestion() {
    setSuggestedSets([]);
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.removeItem(`feynman:suggested-sets:${session._id}`);
    } catch { /* non-fatal */ }
  }

  const handleGradingSource = useCallback((s: FeynmanGradingSource | undefined) => {
    if (!s) return;
    setGradingSource(s);
    if (s === 'generic' && !genericToastFiredRef.current) {
      genericToastFiredRef.current = true;
      toast.info(
        'No source material found — grading against general knowledge for this topic.',
        { duration: 6000 },
      );
    }
  }, []);

  // Timer
  const [elapsedSec, setElapsedSec] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (paused || done) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => setElapsedSec(s => s + 1), 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [paused, done]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // View mode: write | split | preview. Default to split so the markdown
  // syntax is rendered live next to what the user is typing.
  const [viewMode, setViewMode] = useState<'write' | 'split' | 'preview'>('split');
  const [socraticOpen, setSocraticOpen] = useState(false);
  const renderedHtml = useMemo(() => renderMarkdownWithMath(explanation), [explanation]);

  // ── Slash menu (snippet helper for non-markdown users) ──────────────────────
  // Reused across the canvas + Socratic chat composer via the shared hook;
  // math-context awareness, key handling, anchor positioning all live there.
  const slashMenu = useTextareaSlashMenu({
    value: explanation,
    setValue: setExplanation,
    textareaRef,
    onAfterInsert: (next) => scheduleEvaluate(next),
  });

  // Speech recognition (Web Speech API — hide silently if unavailable).
  // Detect on mount so SSR and first client render agree (both start false);
  // computing this in render reads `window` and breaks hydration.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const [recording, setRecording] = useState(false);
  const [hasSpeech, setHasSpeech] = useState(false);
  useEffect(() => {
    setHasSpeech(
      'SpeechRecognition' in window || 'webkitSpeechRecognition' in window,
    );
  }, []);

  function toggleMic() {
    if (!hasSpeech) return;
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return;
    const sr = new SR();
    sr.continuous = true;
    sr.interimResults = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sr.onresult = (e: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const text = Array.from(e.results as any[]).map((r: any) => r[0].transcript).join('');
      setExplanation(prev => {
        const next = prev + (prev.endsWith(' ') ? '' : ' ') + text;
        scheduleEvaluate(next);
        return next;
      });
    };
    sr.onend = () => setRecording(false);
    sr.start();
    recognitionRef.current = sr;
    setRecording(true);
  }

  function wrapSelection(before: string, after: string = before) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end   = el.selectionEnd;
    const sel   = explanation.slice(start, end);
    const next  = explanation.slice(0, start) + before + sel + after + explanation.slice(end);
    setExplanation(next);
    scheduleEvaluate(next);
    requestAnimationFrame(() => {
      el.selectionStart = start + before.length;
      el.selectionEnd   = end   + before.length;
      el.focus();
    });
  }

  // Debounced evaluate (1.5 s after last keystroke)
  const scheduleEvaluate = useCallback((text: string) => {
    if (paused || done) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/feynman/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session._id, explanation: text }),
        });
        if (!res.ok) return;
        const data: EvaluateResult = await res.json();
        setCoverage(data.coverage);
        if (data.clarityScore != null) setClarityScore(Math.round(data.clarityScore * 100));
        if (data.skepticQuestion) setSkepticQ(data.skepticQuestion);
        handleGradingSource(data.source);
      } catch { /* non-fatal */ }
    }, DEBOUNCE_MS);
  }, [paused, done, session._id, handleGradingSource]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setExplanation(v);
    scheduleEvaluate(v);
    slashMenu.onTextChange(v, e.target.selectionStart);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Slash menu intercepts arrows / Enter / Esc when open. Falls through
    // when the key isn't relevant, so normal typing keeps working.
    slashMenu.onKeyDown(e);
  }

  async function handleEnd() {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    try {
      const res = await fetch('/api/feynman/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session._id, explanation, endSession: true }),
      });
      if (res.ok) {
        const data: EvaluateResult & { clarityScore: number; accuracyScore: number } = await res.json();
        // Live evaluate returns 0..1; normalise to 0..100 to match Mongo.
        setReport({
          clarityScore:  Math.round((data.clarityScore  ?? 0) * 100),
          accuracyScore: Math.round((data.accuracyScore ?? 0) * 100),
          coverage:      data.coverage,
        });
        handleGradingSource(data.source);
        setDone(true);
        return;
      }
    } catch { /* show report with current data */ }

    setReport(r => r ?? { clarityScore, accuracyScore: 0, coverage });
    setDone(true);
  }

  async function handleSkepticAnswer(answer: string) {
    setSkepticBusy(true);
    try {
      const res = await fetch('/api/feynman/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session._id, explanation: explanation + '\n\n' + answer }),
      });
      if (res.ok) {
        const data: EvaluateResult = await res.json();
        setCoverage(data.coverage);
        if (data.clarityScore != null) setClarityScore(Math.round(data.clarityScore * 100));
        handleGradingSource(data.source);
        setExplanation(prev => prev + '\n\n' + answer);
      }
    } catch { /* non-fatal */ }
    setSkepticBusy(false);
    setSkepticModalOpen(false);
  }

  // ⌘E = end session
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = platform === 'mac' ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        if (!done) handleEnd();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, explanation, coverage, platform]);

  if (done && report) {
    return (
      <FeynmanReport
        session={session}
        clarityScore={report.clarityScore}
        accuracyScore={report.accuracyScore}
        coverage={report.coverage}
        setId={setId}
        elapsedSec={elapsedSec}
      />
    );
  }

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Cross-set chooser. Lives above the editor so the user notices it
            before committing to typing in the wrong set. One match → single
            "Switch to X" link; multiple matches → chip row so the user picks
            which set fits. Dismiss removes the sessionStorage key so it
            won't return on resume. */}
        {suggestedSets.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-primary/5 px-4 py-2 shrink-0"
            role="note"
            aria-label="Other study sets that match this topic"
          >
            <p className="text-xs text-foreground-muted">
              {suggestedSets.length === 1
                ? <>This topic looks like a closer match for your <span className="font-medium text-foreground">{suggestedSets[0].studySetName}</span> set.</>
                : <>This topic also appears in {suggestedSets.length} of your other sets.</>}
              {' '}Switch to:
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {suggestedSets.map(s => (
                <a
                  key={s.studySetId}
                  href={`/sets/${s.studySetId}/feynman?topic=${encodeURIComponent(session.topic)}`}
                  onClick={dismissSuggestion}
                  className="inline-flex items-center rounded-md border border-border bg-background px-2 py-0.5 text-xs font-medium text-foreground hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  {s.studySetName}
                </a>
              ))}
            </div>
            <button
              type="button"
              onClick={dismissSuggestion}
              className="ml-auto text-xs text-foreground-subtle hover:text-foreground transition-colors px-1 cursor-pointer"
              aria-label="Dismiss suggestion"
            >
              ×
            </button>
          </div>
        )}

        {/* Split area */}
        <div className="flex flex-1 overflow-hidden">
          {/* ── Editor column (60%) — swaps to Socratic chat when open ─── */}
          <div className="flex flex-col w-3/5 min-w-0">
            {socraticOpen ? (
              // Socratic panel takes the editor's slot so the coverage column
              // stays visible — the user can watch the grade move as they chat.
              <SocraticChatPanel
                open
                onClose={() => setSocraticOpen(false)}
                sessionId={session._id}
                topic={session.topic}
                coverage={coverage}
                onUserTurn={(text) => {
                  setExplanation(prev => {
                    const next = prev + (prev.trim().length > 0 ? '\n\n' : '') + text;
                    scheduleEvaluate(next);
                    return next;
                  });
                }}
              />
            ) : (<>
            {/* Toolbar */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-background shrink-0">
              {/* Format buttons */}
              <div className="flex items-center gap-0.5" role="toolbar" aria-label="Formatting">
                <button
                  type="button"
                  onClick={() => wrapSelection('**')}
                  className="rounded p-1.5 hover:bg-surface-2 text-foreground-muted hover:text-foreground transition-colors cursor-pointer"
                  aria-label="Bold"
                  title="Bold (**text**)"
                >
                  <Bold className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => wrapSelection('_')}
                  className="rounded p-1.5 hover:bg-surface-2 text-foreground-muted hover:text-foreground transition-colors cursor-pointer"
                  aria-label="Italic"
                  title="Italic (_text_)"
                >
                  <Italic className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => wrapSelection('$$', '$$')}
                  className="rounded p-1.5 hover:bg-surface-2 text-foreground-muted hover:text-foreground transition-colors cursor-pointer"
                  aria-label="Math block"
                  title="Math ($$...$$)"
                >
                  <Sigma className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                {hasSpeech && (
                  <button
                    type="button"
                    onClick={toggleMic}
                    className={cn(
                      'rounded p-1.5 transition-colors cursor-pointer',
                      recording
                        ? 'bg-danger-soft text-danger hover:bg-danger-soft'
                        : 'hover:bg-surface-2 text-foreground-muted hover:text-foreground'
                    )}
                    aria-label={recording ? 'Stop recording' : 'Start voice input'}
                    aria-pressed={recording}
                    title="Voice input"
                  >
                    {recording
                      ? <MicOff className="h-3.5 w-3.5" aria-hidden="true" />
                      : <Mic    className="h-3.5 w-3.5" aria-hidden="true" />
                    }
                  </button>
                )}
              </div>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Socratic Skeptic — opens a dedicated chat modal that probes
                  the student's understanding. Chat content is folded into
                  the explanation so the rubric grades it too. */}
              <button
                type="button"
                onClick={() => setSocraticOpen(true)}
                className="rounded p-1.5 hover:bg-surface-2 text-foreground-muted hover:text-foreground transition-colors cursor-pointer mr-1"
                aria-label="Open Socratic Skeptic chat"
                title="Socratic Skeptic — back-and-forth questions"
              >
                <MessageCircleQuestion className="h-3.5 w-3.5" aria-hidden="true" />
              </button>

              {/* View-mode toggle: Write | Split | Preview */}
              <div className="flex items-center gap-0.5 mr-3" role="radiogroup" aria-label="View mode">
                {([
                  { mode: 'write',   icon: Pencil,  label: 'Write only'   },
                  { mode: 'split',   icon: Columns, label: 'Split view'   },
                  { mode: 'preview', icon: Eye,     label: 'Preview only' },
                ] as const).map(({ mode, icon: Icon, label }) => {
                  const active = viewMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      aria-label={label}
                      title={label}
                      onClick={() => setViewMode(mode)}
                      className={cn(
                        'rounded p-1.5 transition-colors cursor-pointer',
                        active
                          ? 'bg-surface-2 text-foreground'
                          : 'hover:bg-surface-2 text-foreground-muted hover:text-foreground',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  );
                })}
              </div>

              {/* Timer + session indicator */}
              <div className="flex items-center gap-2 text-foreground-muted" aria-live="off">
                <span className="font-mono text-[12px]" aria-label={`Elapsed time: ${formatTime(elapsedSec)}`}>
                  {formatTime(elapsedSec)}
                </span>
              </div>
            </div>

            {/* Editor + Preview pane */}
            <div className="flex-1 relative overflow-hidden flex">
              {paused && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                  <div className="text-center">
                    <Pause className="mx-auto h-8 w-8 text-foreground-subtle mb-2" aria-hidden="true" />
                    <p className="text-sm text-foreground-muted">Session paused</p>
                    <Button className="mt-4" onClick={() => setPaused(false)}>Resume</Button>
                  </div>
                </div>
              )}
              {viewMode !== 'preview' && (
                <textarea
                  ref={textareaRef}
                  value={explanation}
                  onChange={handleChange}
                  onKeyDown={handleKeyDown}
                  onBlur={() => slashMenu.closeMenu()}
                  disabled={paused}
                  placeholder="Explain the concept in your own words, as if teaching someone who has never seen it before… (press / for snippets)"
                  className={cn(
                    'h-full resize-none bg-background px-8 py-6',
                    'font-serif text-base text-foreground placeholder:text-foreground-subtle leading-relaxed',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--focus-ring))] focus-visible:ring-offset-2',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    viewMode === 'split' ? 'w-1/2 border-r border-border' : 'w-full',
                  )}
                  aria-label="Your explanation"
                  aria-multiline="true"
                  spellCheck
                />
              )}
              {viewMode !== 'write' && (
                <div
                  className={cn(
                    'h-full overflow-y-auto px-8 py-6 bg-background',
                    'font-serif text-base text-foreground leading-relaxed',
                    'prose prose-invert max-w-none',
                    'prose-strong:text-foreground prose-em:text-foreground',
                    'prose-code:text-foreground prose-code:bg-surface-2 prose-code:rounded prose-code:px-1',
                    'prose-headings:text-foreground prose-headings:font-medium',
                    viewMode === 'split' ? 'w-1/2' : 'w-full',
                  )}
                  aria-label="Rendered preview"
                >
                  {explanation.trim()
                    ? <div dangerouslySetInnerHTML={{ __html: renderedHtml }} />
                    : <p className="text-foreground-subtle italic">Preview will render as you type…</p>}
                </div>
              )}
            </div>
            </>)}
          </div>

          {/* ── Coverage column (40%) ───────────────────────────────────── */}
          <div className="flex flex-col w-2/5 overflow-hidden relative">
            <CoverageMap
              chunks={coverage}
              clarityScore={clarityScore}
              topic={session.topic}
              skepticQ={skepticQ}
              onAnswerSkeptic={() => setSkepticModalOpen(true)}
              source={gradingSource}
            />
            {showRingHint && (
              <FirstTimeHint
                hintId="hint:feynman-ring"
                content="This ring shows your coverage — watch it grow"
                position="right"
              />
            )}
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-5 border-t border-border bg-background/95 backdrop-blur shrink-0"
          style={{ height: 40 }}
        >
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-danger border-danger/30 hover:bg-danger-soft h-7 text-xs"
            onClick={handleEnd}
            aria-keyshortcuts={`${modKey}+E`}
          >
            <LogOut className="h-3 w-3" aria-hidden="true" />
            End Session
            <kbd className="ml-0.5 text-[10px] font-mono opacity-60" aria-hidden="true">{modKey}E</kbd>
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 h-7 text-xs text-foreground-muted"
              onClick={() => setPaused(v => !v)}
              aria-label={paused ? 'Resume session' : 'Pause session'}
            >
              {paused
                ? <Play  className="h-3 w-3" aria-hidden="true" />
                : <Pause className="h-3 w-3" aria-hidden="true" />
              }
              {paused ? 'Resume' : 'Pause'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 h-7 text-xs text-foreground-muted"
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts"
            >
              <HelpCircle className="h-3 w-3" aria-hidden="true" />
              <kbd className="text-[10px] font-mono" aria-hidden="true">{modKey}/</kbd>
            </Button>
          </div>
        </div>
      </div>

      {/* Skeptic answer modal */}
      {skepticModalOpen && skepticQ && (
        <SkepticModal
          question={skepticQ}
          onClose={() => setSkepticModalOpen(false)}
          onAnswer={handleSkepticAnswer}
          answering={skepticBusy}
        />
      )}

      {/* Slash-menu snippet picker — anchored under the editor, driven by
          the `/` trigger inside the shared hook. */}
      <TextareaSlashMenu {...slashMenu.menuProps} />
    </>
  );
}
