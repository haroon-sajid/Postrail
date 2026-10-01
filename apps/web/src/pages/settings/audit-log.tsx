import { ScrollText } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { AUDIT_LOG } from '@/pages/upcoming/upcoming';
import { UpcomingBody } from '@/pages/upcoming/upcoming-page';
import { SETTINGS_DESCRIPTION, SettingsLayout, SettingsTabs } from './layout';

/** Planned: the tab is here so the section is complete, and says what it will hold. */
export function AuditLogSettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description={SETTINGS_DESCRIPTION} />
      <SettingsLayout>
        <SettingsTabs />
      </SettingsLayout>
      <UpcomingBody feature={AUDIT_LOG} icon={ScrollText} />
    </>
  );
}
