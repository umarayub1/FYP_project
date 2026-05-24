'use client';

import { useState, useEffect } from 'react';
import { MessageCircle, BookOpen, FileText, X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { CoachChat } from '@/components/coach/CoachChat';
import { CornellStagingPanel } from '@/components/cornell/CornellStagingPanel';
import {
  useStagingContext,
  type StagedCard,
  type StagedCornellRow,
} from '@/contexts/StagingContext';
import { useFirstTimeHint } from '@/hooks/useFirstTimeHint';
import { FirstTimeHint } from '@/components/patterns/FirstTimeHint';
import { CommitDialog } from '@/components/sidepanel/CommitDialog';

export type SidePanelMode = 'coach' | 'cards' | 'cornell';

// Re-exported for any legacy importers — the shape now lives in StagingContext.
export type { StagedCard } from '@/contexts/StagingContext';

interface SidePanelProps {
  open:           boolean;
  onClose:        () => void;
  studySetId?:    string;
  studySetName?:  string;
  requestedMode?: SidePanelMode;
}

const MODE_ICONS: Record<SidePanelMode, React.ComponentType<{ className?: string }>> = {
  coach:   MessageCircle,
  cards:   BookOpen,
  cornell: FileText,
};

function SegmentedControl({
  value, onChange, cardsCount, cornellCount,
}: {
  value: SidePanelMode;
  onChange: (mode: SidePanelMode) => void;
  cardsCount: number;
  cornellCount: number;
}) {
  const modes: { key: SidePanelMode; label: string; count?: number }[] = [
    { key: 'coach',   label: 'Coach' },
    { key: 'cards',   label: 'Cards',   count: cardsCount   || undefined },
    { key: 'cornell', label: 'Cornell', count: cornellCount || undefined },
  ];

  return (
    <div role="tablist" aria-label="SidePanel mode" className="flex gap-0.5 rounded-md bg-surface-2 p-0.5">
      {modes.map(({ key, label, count }) => {
        const Icon = MODE_ICONS[key];
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={value === key}
            onClick={() => onChange(key)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer',
              value === key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-foreground-muted hover:text-foreground'
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
            {count !== undefined && (
              <span className="rounded-full bg-primary/15 px-1.5 py-0 text-primary font-medium">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function StagedCardsPanel({
  cards, studySetId, onDiscard, onClearAll, onCommit,
}: {
  cards:       StagedCard[];
  studySetId?: string;
  onDiscard:   (id: string) => void;
  onClearAll:  () => void;
  onCommit:    () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b border-border px-4 py-2 flex items-center justify-between">
        <p className="text-xs text-foreground-muted">
          {cards.length} card{cards.length !== 1 ? 's' : ''} staged
        </p>
        {cards.length > 0 && (
          <div className="flex gap-1">
            <Button type="button" variant="outline" size="sm" className="h-6 text-xs" onClick={onClearAll}>
              Discard all
            </Button>
            <Button type="button" size="sm" className="h-6 text-xs gap-1" onClick={onCommit} disabled={!studySetId}>
              Commit all
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {cards.length === 0 ? (
          <p className="text-sm text-foreground-subtle text-center py-8">
            Highlight text and choose &ldquo;Add to Flashcards&rdquo; to stage cards.
          </p>
        ) : cards.map(card => (
          <div key={card.id} className="rounded-lg border border-border bg-background p-3">
            <div className="flex items-start justify-between gap-2 mb-1">
              <p className="text-xs font-medium text-foreground line-clamp-2">{card.front}</p>
              <button
                type="button"
                onClick={() => onDiscard(card.id)}
                className="shrink-0 rounded p-0.5 hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer"
                aria-label="Remove staged card"
              >
                <Trash2 className="h-3.5 w-3.5 text-foreground-muted" aria-hidden="true" />
              </button>
            </div>
            <p className="text-xs text-foreground-muted line-clamp-2">{card.back}</p>
            {card.sourceTitle && (
              <p className="text-xs text-foreground-subtle mt-1 truncate">
                {card.sourceTitle}{card.sourcePage ? ` · p.${card.sourcePage}` : ''}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StagedCornellRowsPanel({
  rows, onDiscard, onClearAll, onCommit, studySetId,
}: {
  rows:        StagedCornellRow[];
  studySetId?: string;
  onDiscard:   (id: string) => void;
  onClearAll:  () => void;
  onCommit:    () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b border-border px-4 py-2 flex items-center justify-between">
        <p className="text-xs text-foreground-muted">
          {rows.length} block{rows.length !== 1 ? 's' : ''} staged
        </p>
        {rows.length > 0 && (
          <div className="flex gap-1">
            <Button type="button" variant="outline" size="sm" className="h-6 text-xs" onClick={onClearAll}>
              Discard all
            </Button>
            <Button type="button" size="sm" className="h-6 text-xs" onClick={onCommit} disabled={!studySetId}>
              Commit all
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {rows.length === 0 ? (
          <p className="text-sm text-foreground-subtle text-center py-8">
            Highlight text and choose &ldquo;Add to Cornell&rdquo; to stage blocks.
          </p>
        ) : rows.map(row => (
          <div key={row.id} className="rounded-lg border border-border bg-background p-3">
            <div className="flex items-start justify-between gap-2 mb-1">
              <p className="text-xs text-foreground line-clamp-3 flex-1">{row.text}</p>
              <button
                type="button"
                onClick={() => onDiscard(row.id)}
                className="shrink-0 rounded p-0.5 hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring cursor-pointer"
                aria-label="Remove staged row"
              >
                <Trash2 className="h-3.5 w-3.5 text-foreground-muted" aria-hidden="true" />
              </button>
            </div>
            {row.sourceTitle && (
              <p className="text-xs text-foreground-subtle mt-1 truncate">
                {row.sourceTitle}{row.sourcePage ? ` · p.${row.sourcePage}` : ''}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SidePanel({
  open, onClose, studySetId, studySetName, requestedMode,
}: SidePanelProps) {
  const [mode, setMode] = useState<SidePanelMode>('coach');
  const [commitOpen, setCommitOpen] = useState<null | 'cards' | 'cornell-rows'>(null);
  const staging = useStagingContext();
  const { shouldShow: showModesHint } = useFirstTimeHint('hint:sidepanel-modes');

  useEffect(() => {
    if (requestedMode) setMode(requestedMode);
  }, [requestedMode]);

  if (!open) return null;

  return (
    <aside
      role="complementary"
      aria-label="Smart Coach"
      className="flex flex-col h-full bg-surface border-l border-border"
    >
      <CommitDialog
        open={commitOpen === 'cards'}
        kind="cards"
        studySetId={studySetId}
        items={staging.stagedCards}
        onClose={() => setCommitOpen(null)}
        onCommitted={() => staging.clearStagedCards()}
      />
      <CommitDialog
        open={commitOpen === 'cornell-rows'}
        kind="cornell-rows"
        studySetId={studySetId}
        items={staging.stagedCornellRows}
        onClose={() => setCommitOpen(null)}
        onCommitted={() => staging.clearStagedRows()}
      />

      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 border-b border-border/60 px-4 py-2 h-11">
        <div className="flex-1 relative">
          <SegmentedControl
            value={mode}
            onChange={setMode}
            cardsCount={staging.stagedCards.length}
            cornellCount={staging.stagedCornellRows.length + staging.stagedCount}
          />
          {showModesHint && (staging.stagedCards.length > 0 || staging.stagedCornellRows.length > 0) && (
            <FirstTimeHint
              hintId="hint:sidepanel-modes"
              content="Switch between Coach, Cards, and Cornell with ⌘1/2/3"
              position="bottom"
            />
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={onClose}
          aria-label="Close SidePanel"
          aria-keyshortcuts="Ctrl+."
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Mode content */}
      <div className="flex-1 overflow-hidden" role="tabpanel" aria-label={mode}>
        {mode === 'coach' && (
          <CoachChat studySetId={studySetId} studySetName={studySetName} />
        )}
        {mode === 'cards' && (
          <StagedCardsPanel
            cards={staging.stagedCards}
            studySetId={studySetId}
            onDiscard={staging.removeStagedCard}
            onClearAll={staging.clearStagedCards}
            onCommit={() => setCommitOpen('cards')}
          />
        )}
        {mode === 'cornell' && (
          <div className="flex flex-col h-full">
            {/* New Cornell-row stage queue (from selections) */}
            {staging.stagedCornellRows.length > 0 ? (
              <StagedCornellRowsPanel
                rows={staging.stagedCornellRows}
                studySetId={studySetId}
                onDiscard={staging.removeStagedRow}
                onClearAll={staging.clearStagedRows}
                onCommit={() => setCommitOpen('cornell-rows')}
              />
            ) : staging.onCommit && staging.onDiscard ? (
              <CornellStagingPanel
                stagedCount={staging.stagedCount}
                onCommit={staging.onCommit}
                onDiscard={staging.onDiscard}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center p-6">
                <p className="text-sm text-foreground-subtle text-center">
                  Highlight text and choose &ldquo;Add to Cornell&rdquo; to stage blocks.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

