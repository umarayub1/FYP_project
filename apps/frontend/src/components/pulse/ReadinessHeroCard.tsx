'use client';

import { type NowBriefItem } from '@/lib/api/now-brief';
import { type StudySet } from '@/lib/api/study-sets';

interface ReadinessHeroCardProps {
  score: number | null;
  dueCount: number;
  overdueCount: number;
  items: NowBriefItem[];
  studySets: StudySet[];
  examMode?: boolean;
  daysRemaining?: number;
  examSetName?: string;
}

const CIRCUMFERENCE = 138.2; // 2π × r=22 ≈ 138.2

function healthColorVar(score: number | null): string {
  if (score === null) return '--foreground-subtle';
  if (score >= 85) return '--success';
  if (score >= 60) return '--warning';
  return '--danger';
}

function statusHeadline(score: number | null): string {
  if (score === null) return 'Computing readiness…';
  if (score >= 85) return "You're well prepared.";
  if (score >= 60) return 'Keep the momentum going.';
  return 'Focus time needed.';
}

export function ReadinessHeroCard({ score, dueCount, overdueCount, items, studySets, examMode, daysRemaining = 0, examSetName }: ReadinessHeroCardProps) {
  const offset = score !== null ? CIRCUMFERENCE * (1 - score / 100) : CIRCUMFERENCE;
  const cv = healthColorVar(score);
  const color = `hsl(var(${cv}))`;

  const examColorVar = daysRemaining <= 1 ? '--danger' : '--warning';
  const examColor = `hsl(var(${examColorVar}))`;

  const colorMap = new Map(studySets.map(s => [s._id, s.color]));
  const totalDue = items.reduce((s, i) => s + i.dueCount, 0);
  const strips = items
    .filter(i => i.dueCount > 0)
    .map(i => ({
      pct: totalDue > 0 ? (i.dueCount / totalDue) * 100 : 0,
      bg: colorMap.get(i.studySetId) ?? i.studySetColor,
    }));

  return (
    <div
      className="flex items-center gap-4 rounded-[8px] mb-6"
      style={{
        background: 'hsl(var(--surface))',
        border: examMode
          ? `1.5px solid ${examColor}`
          : '0.5px solid hsl(var(--border))',
        padding: '14px 16px',
      }}
    >
      <svg
        width="56" height="56" viewBox="0 0 56 56"
        aria-label={examMode ? `Exam in ${daysRemaining} days` : `Readiness: ${score !== null ? `${score}%` : 'unavailable'}`}
        className="shrink-0"
      >
        <circle cx="28" cy="28" r="22" fill="none" stroke="hsl(var(--border))" strokeWidth="4" />
        <circle
          cx="28" cy="28" r="22" fill="none"
          stroke={examMode ? examColor : color}
          strokeWidth="4"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={examMode ? 0 : offset}
          strokeLinecap="round"
          transform="rotate(-90 28 28)"
          style={{ transition: 'stroke-dashoffset 400ms ease-out' }}
        />
        <text
          x="28" y="28"
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fontFamily: 'var(--font-mono)', fontSize: examMode ? '9px' : '14px', fontWeight: 500, fill: examMode ? examColor : color }}
        >
          {examMode ? 'EXAM' : (score !== null ? score : '—')}
        </text>
        {examMode && (
          <text
            x="28" y="38"
            textAnchor="middle"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', fontWeight: 500, fill: examColor }}
          >
            {daysRemaining}d
          </text>
        )}
      </svg>

      <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
        {examMode ? (
          <>
            <p className="text-[13px] font-mono font-medium leading-tight" style={{ color: examColor }}>
              EXAM IN {daysRemaining} DAY{daysRemaining !== 1 ? 'S' : ''}
            </p>
            {examSetName && (
              <p className="text-[12px] leading-tight" style={{ color: 'hsl(var(--foreground-muted))' }}>
                {examSetName}
              </p>
            )}
          </>
        ) : (
          <p className="text-[13px] font-medium leading-tight" style={{ color }}>
            {statusHeadline(score)}
          </p>
        )}
        <p className="text-[12px] leading-tight" style={{ color: 'hsl(var(--foreground-muted))' }}>
          <span className="font-mono">{dueCount}</span> cards due
          {overdueCount > 0 && (
            <> · <span className="font-mono">{overdueCount}</span> overdue</>
          )}
        </p>
        <div
          className="mt-[5px] h-[4px] flex overflow-hidden"
          style={{ borderRadius: 'var(--radius-full)' }}
        >
          {strips.length > 0 ? (
            strips.map((s, i) => (
              <div key={i} style={{ width: `${s.pct}%`, backgroundColor: s.bg }} />
            ))
          ) : (
            <div className="w-full" style={{ backgroundColor: 'hsl(var(--surface-3))' }} />
          )}
        </div>
      </div>
    </div>
  );
}
