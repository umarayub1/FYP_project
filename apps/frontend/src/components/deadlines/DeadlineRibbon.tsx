'use client';

import { useState } from 'react';
import { AlertCircle, Clock, CheckCircle, Plus, ChevronRight } from 'lucide-react';
import { type Deadline } from '@/lib/api/study-sets';
import { DeadlineEditorPopover } from './DeadlineEditorPopover';
import { DeadlineSheet } from './DeadlineSheet';
import { cn } from '@/lib/cn';

interface DeadlineRibbonProps {
  deadlines: Deadline[];
  studySetId: string;
  studySetName: string;
  defaultSheetOpen?: boolean;
  onDeadlinesChange?: (deadlines: Deadline[]) => void;
}

function dayDiff(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function formatDeadlineText(d: Deadline): string {
  const diff = dayDiff(d.date);
  if (diff < 0) return `${d.label} (passed)`;
  if (diff === 0) return `${d.label} today`;
  if (diff === 1) return `${d.label} tomorrow`;
  return `${d.label} in ${diff} days`;
}

type UrgencyLevel = 'today' | 'critical' | 'soon' | 'upcoming' | 'none';

function getUrgency(deadlines: Deadline[]): UrgencyLevel {
  const today = new Date().toISOString().split('T')[0];
  const active = deadlines.filter(d => !d.passedAt && d.date >= today);
  if (active.length === 0) return 'none';
  const nearest = active.sort((a, b) => a.date.localeCompare(b.date))[0];
  const diff = dayDiff(nearest.date);
  if (diff === 0) return 'today';
  if (diff <= 3) return 'critical';
  if (diff <= 7) return 'soon';
  return 'upcoming';
}

export function DeadlineRibbon({
  deadlines,
  studySetId,
  studySetName,
  defaultSheetOpen = false,
  onDeadlinesChange,
}: DeadlineRibbonProps) {
  const [sheetOpen, setSheetOpen] = useState(defaultSheetOpen);
  const [localDeadlines, setLocalDeadlines] = useState(deadlines);

  function handleDeadlinesChange(updated: Deadline[]) {
    setLocalDeadlines(updated);
    onDeadlinesChange?.(updated);
  }

  const today = new Date().toISOString().split('T')[0];
  const active = localDeadlines.filter(d => !d.passedAt && d.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  const urgency = getUrgency(localDeadlines);

  // No deadlines
  if (urgency === 'none') {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 mb-6">
        <CheckCircle className="h-4 w-4 text-foreground-subtle" aria-hidden="true" />
        <p className="text-sm text-foreground-muted flex-1">No deadline set. Add one so Synapse can help you prioritize.</p>
        <DeadlineEditorPopover
          trigger={
            <button className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded cursor-pointer">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Set deadline
            </button>
          }
          studySetId={studySetId}
          onSaved={saved => handleDeadlinesChange([...localDeadlines, saved])}
        />
      </div>
    );
  }

  const ribbonClass = cn(
    'flex items-center gap-3 rounded-lg border px-4 py-3 mb-6',
    urgency === 'today'    && 'bg-destructive/10 border-destructive/30',
    urgency === 'critical' && 'bg-amber/10 border-amber/30',
    urgency === 'soon'     && 'bg-background border-border',
    urgency === 'upcoming' && 'bg-background border-border',
  );

  const iconProps = urgency === 'today'
    ? { Icon: AlertCircle, color: 'text-destructive', srLabel: 'Critical — deadline today' }
    : urgency === 'critical'
    ? { Icon: AlertCircle, color: 'text-amber',        srLabel: 'Critical — deadline within 3 days' }
    : urgency === 'soon'
    ? { Icon: Clock,        color: 'text-foreground-muted', srLabel: 'Deadline soon' }
    : { Icon: CheckCircle,  color: 'text-foreground-subtle', srLabel: 'Upcoming deadline' };

  const { Icon, color, srLabel } = iconProps;
  const [nearest, ...rest] = active;

  return (
    <>
      <div className={ribbonClass} role="status" aria-live="polite" aria-atomic="true" aria-label={srLabel}>
        <Icon className={cn('h-4 w-4 shrink-0', color)} aria-hidden="true" />
        <span className="sr-only">{srLabel}</span>
        <div className="flex-1 flex items-center gap-2 flex-wrap text-sm">
          <span className={cn('font-medium', urgency === 'today' ? 'text-destructive' : urgency === 'critical' ? 'text-amber' : 'text-foreground')}>
            {formatDeadlineText(nearest)}
          </span>
          {rest.slice(0, 2).map(d => (
            <span key={d.id} className="text-xs text-foreground-muted bg-surface-2 rounded-full px-2 py-0.5">
              {formatDeadlineText(d)}
            </span>
          ))}
        </div>
        <button
          onClick={() => setSheetOpen(true)}
          className="flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded cursor-pointer shrink-0"
          aria-label="Manage deadlines"
        >
          Manage
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <DeadlineSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        studySetId={studySetId}
        studySetName={studySetName}
        deadlines={localDeadlines}
        onDeadlinesChange={handleDeadlinesChange}
      />
    </>
  );
}
