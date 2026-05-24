import { AppShell } from '@/components/shell/AppShell';
import { WeakPointsView } from '@/components/weakpoints/WeakPointsView';
import { getStudySets } from '@/lib/api/study-sets';
import { getWeakpoints } from '@/lib/api/weakpoints';

export const metadata = { title: 'Weak Points — Synapse' };

export default async function WeakPointsPage() {
  const [studySets, weakpoints] = await Promise.allSettled([
    getStudySets({ includeArchived: true }),
    getWeakpoints(),
  ]);

  const sets = studySets.status === 'fulfilled' ? studySets.value : [];
  const data = weakpoints.status === 'fulfilled'
    ? weakpoints.value
    : { leechCards: [], weakTopics: [] };

  return (
    <AppShell
      breadcrumb={[{ label: 'Weak Points' }]}
      studySets={sets}
    >
      <div className="px-content-x py-8 max-w-3xl mx-auto">
        <h1 className="text-h1 text-foreground mb-section-y">Weak Points</h1>
        <WeakPointsView initialData={data} />
      </div>
    </AppShell>
  );
}
