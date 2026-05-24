import { PreferencesSettings, TagsSettings } from '@/components/settings/PreferencesSettings';

export const metadata = { title: 'Preferences — Settings — Synapse' };

export default function PreferencesSettingsPage() {
  return (
    <div className="space-y-10">
      <PreferencesSettings />
      <hr className="border-border" />
      <TagsSettings />
    </div>
  );
}
