'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  ReactNode,
} from 'react';

// ── Staged item shapes ─────────────────────────────────────────────────────

export interface StagedCard {
  id:           string;
  front:        string;
  back:         string;
  studySetId:   string;
  sourceTitle?: string;
  sourcePage?:  number;
}

export interface StagedCornellRow {
  id:           string;
  text:         string;
  studySetId:   string;
  sourceTitle?: string;
  sourcePage?:  number;
}

export interface StagedCoachQuery {
  id:           string;
  text:         string;
  studySetId:   string;
  sourceTitle?: string;
  sourcePage?:  number;
}

export type StageKind = 'card' | 'cornell-row' | 'coach-query';

export interface StagePayload {
  text:         string;
  studySetId:   string;
  sourceTitle?: string;
  sourcePage?:  number;
  // For 'card' staging — the universal menu hands us a single text; the
  // commit modal lets the user split front/back, but the staged item is just
  // raw text until then.
}

interface StagingContextValue {
  // Modern multi-collection state (Plan E).
  stagedCards:        StagedCard[];
  stagedCornellRows:  StagedCornellRow[];
  stagedCoachQueries: StagedCoachQuery[];
  stage:              (kind: StageKind, payload: StagePayload) => void;
  removeStagedCard:   (id: string) => void;
  removeStagedRow:    (id: string) => void;
  removeStagedQuery:  (id: string) => void;
  clearStagedCards:   () => void;
  clearStagedRows:    () => void;
  clearStagedQueries: () => void;
  /** Auto-switches the SidePanel to the right tab after a stage event. */
  onStageHint:        ((mode: 'cards' | 'cornell' | 'coach') => void) | null;
  setOnStageHint:     (fn: ((mode: 'cards' | 'cornell' | 'coach') => void) | null) => void;
  /** "Ask Smart Coach" pipes the selection straight into the coach textarea.
   *  CoachChat reads this on change and clears it once consumed. */
  pendingCoachInput:    { text: string; nonce: number } | null;
  pushCoachInput:       (text: string) => void;
  clearPendingCoachInput: () => void;

  // Legacy Cornell staging API (kept for CornellLayout integration — the
  // Cornell editor stages blocks into its own staged-blocks bucket and uses
  // these hooks; see CornellLayout.tsx and CornellStagingPanel.tsx).
  stagedCount:    number;
  setStagedCount: (n: number) => void;
  onCommit:       (() => Promise<void>) | null;
  setOnCommit:    (fn: (() => Promise<void>) | null) => void;
  onDiscard:      (() => void) | null;
  setOnDiscard:   (fn: (() => void) | null) => void;
}

const StagingContext = createContext<StagingContextValue>({
  stagedCards: [],
  stagedCornellRows: [],
  stagedCoachQueries: [],
  stage: () => {},
  removeStagedCard: () => {},
  removeStagedRow: () => {},
  removeStagedQuery: () => {},
  clearStagedCards: () => {},
  clearStagedRows: () => {},
  clearStagedQueries: () => {},
  onStageHint: null,
  setOnStageHint: () => {},
  pendingCoachInput: null,
  pushCoachInput: () => {},
  clearPendingCoachInput: () => {},

  stagedCount: 0,
  setStagedCount: () => {},
  onCommit: null,
  setOnCommit: () => {},
  onDiscard: null,
  setOnDiscard: () => {},
});

function rid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function StagingProvider({ children }: { children: ReactNode }) {
  const [stagedCards,        setStagedCards]        = useState<StagedCard[]>([]);
  const [stagedCornellRows,  setStagedCornellRows]  = useState<StagedCornellRow[]>([]);
  const [stagedCoachQueries, setStagedCoachQueries] = useState<StagedCoachQuery[]>([]);
  const [onStageHint, setOnStageHintState] =
    useState<((mode: 'cards' | 'cornell' | 'coach') => void) | null>(null);
  const [pendingCoachInput, setPendingCoachInput] =
    useState<{ text: string; nonce: number } | null>(null);

  // Legacy Cornell badge plumbing.
  const [stagedCount, setStagedCount]   = useState(0);
  const [onCommit, setOnCommitState]    = useState<(() => Promise<void>) | null>(null);
  const [onDiscard, setOnDiscardState]  = useState<(() => void) | null>(null);

  const setOnCommit = useCallback(
    (fn: (() => Promise<void>) | null) => setOnCommitState(() => fn),
    [],
  );
  const setOnDiscard = useCallback(
    (fn: (() => void) | null) => setOnDiscardState(() => fn),
    [],
  );
  const setOnStageHint = useCallback(
    (fn: ((mode: 'cards' | 'cornell' | 'coach') => void) | null) =>
      setOnStageHintState(() => fn),
    [],
  );
  const pushCoachInput = useCallback((text: string) => {
    const t = text.trim();
    if (!t) return;
    setPendingCoachInput({ text: t, nonce: Date.now() });
  }, []);
  const clearPendingCoachInput = useCallback(() => setPendingCoachInput(null), []);

  const stage = useCallback(
    (kind: StageKind, payload: StagePayload) => {
      const text = payload.text.trim();
      if (!text) return;
      const id = rid();
      if (kind === 'card') {
        // Default to "front = first sentence, back = remainder" — the commit
        // modal is where the user actually picks front/back.
        const split = text.split(/[.?!]\s+/, 2);
        const front = split[0] ?? text;
        const back  = text.length > front.length ? text.slice(front.length).trim() : text;
        setStagedCards(prev => [
          ...prev,
          {
            id, front, back,
            studySetId:  payload.studySetId,
            sourceTitle: payload.sourceTitle,
            sourcePage:  payload.sourcePage,
          },
        ]);
        onStageHint?.('cards');
      } else if (kind === 'cornell-row') {
        setStagedCornellRows(prev => [
          ...prev,
          { id, text, studySetId: payload.studySetId, sourceTitle: payload.sourceTitle, sourcePage: payload.sourcePage },
        ]);
        onStageHint?.('cornell');
      } else {
        setStagedCoachQueries(prev => [
          ...prev,
          { id, text, studySetId: payload.studySetId, sourceTitle: payload.sourceTitle, sourcePage: payload.sourcePage },
        ]);
        onStageHint?.('coach');
      }
    },
    [onStageHint],
  );

  const value = useMemo<StagingContextValue>(() => ({
    stagedCards,
    stagedCornellRows,
    stagedCoachQueries,
    stage,
    removeStagedCard:  (id) => setStagedCards(prev => prev.filter(c => c.id !== id)),
    removeStagedRow:   (id) => setStagedCornellRows(prev => prev.filter(r => r.id !== id)),
    removeStagedQuery: (id) => setStagedCoachQueries(prev => prev.filter(q => q.id !== id)),
    clearStagedCards:   () => setStagedCards([]),
    clearStagedRows:    () => setStagedCornellRows([]),
    clearStagedQueries: () => setStagedCoachQueries([]),
    onStageHint,
    setOnStageHint,
    pendingCoachInput,
    pushCoachInput,
    clearPendingCoachInput,
    stagedCount,
    setStagedCount,
    onCommit,
    setOnCommit,
    onDiscard,
    setOnDiscard,
  }), [
    stagedCards, stagedCornellRows, stagedCoachQueries, stage,
    onStageHint, setOnStageHint,
    pendingCoachInput, pushCoachInput, clearPendingCoachInput,
    stagedCount, onCommit, setOnCommit, onDiscard, setOnDiscard,
  ]);

  return (
    <StagingContext.Provider value={value}>
      {children}
    </StagingContext.Provider>
  );
}

export const useStagingContext = () => useContext(StagingContext);
