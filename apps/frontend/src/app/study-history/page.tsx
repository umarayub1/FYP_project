import { AppShell } from '@/components/shell/AppShell';
import { gatewayGet } from '@/lib/api/gateway';
import { getStudySets } from '@/lib/api/study-sets';
import { StudyHistoryClient, type StudySessionRecord } from './StudyHistoryClient';

export const metadata = { title: 'Study History — Synapse' };

export default async function StudyHistoryPage() {
  const [sessionsRes, studySetsRes] = await Promise.allSettled([
    gatewayGet<{ sessions: StudySessionRecord[] }>('/user/study-sessions?limit=500'),
    getStudySets({ includeArchived: true }),
  ]);

  const sessions   = sessionsRes.status   === 'fulfilled' ? (sessionsRes.value.sessions ?? []) : [];
  const studySets  = studySetsRes.status  === 'fulfilled' ? studySetsRes.value : [];

  return (
    <AppShell
      breadcrumb={[{ label: 'Study history' }]}
      studySets={studySets}
    >
      <main id="main-content" className="max-w-4xl mx-auto px-[var(--space-content-x,1.5rem)] py-[var(--space-section-y,2rem)]">
        <h1 className="text-2xl font-medium mb-8">Study history</h1>
        <StudyHistoryClient sessions={sessions} studySets={studySets} />
      </main>
    </AppShell>
  );
}
