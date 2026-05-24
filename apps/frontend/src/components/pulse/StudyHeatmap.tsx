'use client';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';

interface StudyHeatmapProps {
  studyActivityDays: { date: string; minutesStudied: number }[];
}

function intensityClass(min: number): string {
  if (min <= 30) return 'bg-[hsl(var(--success-soft))]';
  if (min <= 60) return 'bg-[hsl(var(--success)/0.4)]';
  if (min <= 90) return 'bg-[hsl(var(--success)/0.7)]';
  return 'bg-[hsl(var(--success))]';
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString([], {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

export function StudyHeatmap({ studyActivityDays }: StudyHeatmapProps) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (13 - i));
    const date = d.toISOString().split('T')[0];
    const match = studyActivityDays.find(a => a.date === date);
    return { date, minutesStudied: match?.minutesStudied ?? 0 };
  });

  const startLabel = fmtDate(days[0].date);
  const endLabel = fmtDate(days[13].date);

  return (
    <div className="mt-6" aria-label={`Study activity for ${startLabel} to ${endLabel}`}>
      <TooltipProvider delayDuration={150}>
        <div className="flex items-end gap-[3px]">
          {days.map(day => {
            const empty = day.minutesStudied === 0;
            return (
              <Tooltip key={day.date}>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      'w-[14px] h-[14px] rounded-[2px] shrink-0 cursor-default',
                      empty ? 'bg-surface-2' : intensityClass(day.minutesStudied),
                    )}
                    style={empty ? { border: '0.5px solid hsl(var(--border))' } : undefined}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  {fmtDate(day.date)} · {day.minutesStudied > 0 ? `${day.minutesStudied}m studied` : 'No study'}
                </TooltipContent>
              </Tooltip>
            );
          })}
          <span className="ml-1 text-[10px] font-mono leading-[14px]" style={{ color: 'hsl(var(--foreground-subtle))' }}>
            today
          </span>
        </div>
      </TooltipProvider>
    </div>
  );
}
