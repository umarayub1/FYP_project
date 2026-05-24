import { AppShell } from '@/components/shell/AppShell';
import { NowBriefView } from '@/components/pulse/NowBriefView';
import { ExamModeProvider } from '@/contexts/ExamModeContext';
import { getNowBrief, type NowBrief } from '@/lib/api/now-brief';
import { getStudySets, type Deadline } from '@/lib/api/study-sets';
import { gatewayGet } from '@/lib/api/gateway';
import { type DueFeynmanSchedule } from '@/lib/api/feynman';
import { getLeechCount } from '@/lib/api/flashcards';
import { type StudySet } from '@/lib/api/study-sets';
import { listDeadlines } from '@/lib/api/deadlines';

export const metadata = { title: 'Now Brief — Synapse' };

interface StudySessionRaw {
  date: string;
  durationMinutes?: number;
}

function computeStreak(sessions: StudySessionRaw[]): number {
  if (!sessions.length) return 0;
  const dates = [...new Set(sessions.map(s => s.date))].sort().reverse();
  const today = new Date().toISOString().split('T')[0];
  let streak = 0;
  let current = today;
  for (const date of dates) {
    if (date === current) {
      streak++;
      const d = new Date(current);
      d.setDate(d.getDate() - 1);
      current = d.toISOString().split('T')[0];
    } else if (date < current) {
      break;
    }
  }
  return streak;
}

function findUpcomingExam(sets: StudySet[]): (Deadline & { setName: string }) | undefined {
  const now = new Date();
  const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return sets
    .flatMap(s => (s.deadlines ?? []).map(d => ({ ...d, setName: s.name })))
    .filter(d => d.type === 'exam' && new Date(d.date) > now && new Date(d.date) <= thirtyDaysOut)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
}

function computeReadinessScore(brief: NowBrief | null): number | null {
  if (!brief || brief.items.length === 0) return 100;
  const totalCards = brief.items.reduce((s, i) => s + i.dueCount + i.overdueCount, 0);
  if (totalCards === 0) return 100;
  const overdueTotal = brief.items.reduce((s, i) => s + i.overdueCount, 0);
  return Math.max(0, Math.round((1 - overdueTotal / totalCards) * 100));
}

function computeStudyActivityDays(sessions: StudySessionRaw[]): { date: string; minutesStudied: number }[] {
  const map = new Map<string, number>();
  for (const s of sessions) {
    if (!s.date) continue;
    map.set(s.date, (map.get(s.date) ?? 0) + (s.durationMinutes ?? 0));
  }
  return Array.from(map.entries()).map(([date, minutesStudied]) => ({ date, minutesStudied }));
}

export default async function NowBriefPage() {
  const [brief, studySets, dueFeynman, sessionsRes, leechCountRes, deadlinesRes] = await Promise.allSettled([
    getNowBrief(),
    getStudySets({ includeArchived: true }),
    gatewayGet<DueFeynmanSchedule[]>('/feynman/due'),
    gatewayGet<{ sessions: StudySessionRaw[] }>('/user/study-sessions?limit=200'),
    getLeechCount(),
    listDeadlines({ filter: 'week' }),
  ]);

  const briefData      = brief.status       === 'fulfilled' ? brief.value       : null;
  const setsData       = studySets.status   === 'fulfilled' ? studySets.value   : [];
  const dueFeynmanData = dueFeynman.status  === 'fulfilled' ? dueFeynman.value  : [];
  const sessions       = sessionsRes.status === 'fulfilled' ? (sessionsRes.value.sessions ?? []) : [];
  const leechCount     = leechCountRes.status === 'fulfilled' ? leechCountRes.value : 0;
  const upcomingDeadlines = deadlinesRes.status === 'fulfilled' ? deadlinesRes.value : [];

  const streak            = computeStreak(sessions);
  const upcomingExam      = findUpcomingExam(setsData);
  const readinessScore    = computeReadinessScore(briefData);
  const studyActivityDays = computeStudyActivityDays(sessions);

  return (
    <AppShell breadcrumb={[{ label: 'Now Brief' }]} studySets={setsData}>
      <ExamModeProvider>
        <NowBriefView
          brief={briefData}
          studySets={setsData}
          dueFeynmanReviews={dueFeynmanData}
          streak={streak}
          upcomingExam={upcomingExam}
          readinessScore={readinessScore}
          studyActivityDays={studyActivityDays}
          leechCount={leechCount}
          upcomingDeadlines={upcomingDeadlines}
        />
      </ExamModeProvider>
    </AppShell>
  );
}
