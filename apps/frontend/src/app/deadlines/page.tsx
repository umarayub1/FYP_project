import { AppShell } from '@/components/shell/AppShell';
import { DeadlinesClient } from './DeadlinesClient';
import { getStudySets } from '@/lib/api/study-sets';
import { listDeadlines } from '@/lib/api/deadlines';

export const metadata = { title: 'Deadlines — Synapse' };

export default async function DeadlinesPage() {
  const [studySetsRes, deadlinesRes] = await Promise.allSettled([
    getStudySets({ includeArchived: true }),
    listDeadlines({ filter: 'all' }),
  ]);

  const sets = studySetsRes.status === 'fulfilled' ? studySetsRes.value : [];
  const initialDeadlines = deadlinesRes.status === 'fulfilled' ? deadlinesRes.value : [];

  return (
    <AppShell breadcrumb={[{ label: 'Deadlines' }]} studySets={sets}>
      <div className="px-content-x py-8 max-w-4xl mx-auto">
        <h1 className="text-h1 text-foreground mb-section-y">Deadlines</h1>
        <DeadlinesClient initialDeadlines={initialDeadlines} studySets={sets} />
      </div>
    </AppShell>
  );
}
