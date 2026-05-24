import { AppShell } from '@/components/shell/AppShell';
import { SetsPageClient } from './SetsPageClient';
import { getStudySets } from '@/lib/api/study-sets';

export const metadata = { title: 'Study Sets — Synapse' };

export default async function SetsPage() {
  const sets = await getStudySets({ includeArchived: true }).catch(() => []);

  return (
    <AppShell breadcrumb={[{ label: 'Study Sets' }]} studySets={sets}>
      <SetsPageClient initialSets={sets} />
    </AppShell>
  );
}
