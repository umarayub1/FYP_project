import { AppShell } from '@/components/shell/AppShell';
import { AnalyticsDashboard } from '@/components/analytics/AnalyticsDashboard';
import { getStudySets } from '@/lib/api/study-sets';

export const metadata = { title: 'Analytics — Synapse' };

export default async function AnalyticsPage({ params }: { params: Promise<{ setId: string }> }) {
  const { setId } = await params;

  const studySets = await getStudySets({ includeArchived: true }).catch(() => []);
  const set = studySets.find(s => s._id === setId);

  return (
    <AppShell
      breadcrumb={[{ label: set?.name ?? setId, href: `/sets/${setId}` }, { label: 'Analytics' }]}
      studySetName={set?.name}
      studySets={studySets}
    >
      <div className="px-content-x py-8 max-w-4xl mx-auto">
        <h1 className="text-h1 text-foreground mb-section-y">Analytics</h1>
        <AnalyticsDashboard setId={setId} />
      </div>
    </AppShell>
  );
}
