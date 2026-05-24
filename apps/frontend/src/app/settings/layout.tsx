import { AppShell } from '@/components/shell/AppShell';
import { SettingsNav } from '@/components/settings/SettingsNav';
import { getStudySets } from '@/lib/api/study-sets';

export const metadata = { title: 'Settings — Synapse' };

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const studySets = await getStudySets({ includeArchived: true }).catch(() => []);

  return (
    <AppShell breadcrumb={['Settings']} hideSidePanel studySets={studySets}>
      <div className="px-content-x py-8 max-w-3xl mx-auto">
        <h1 className="text-h1 text-foreground mb-6">Settings</h1>
        <SettingsNav />
        {children}
      </div>
    </AppShell>
  );
}
