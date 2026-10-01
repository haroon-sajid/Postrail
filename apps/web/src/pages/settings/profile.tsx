import { useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { authClient } from '@/api/auth';
import { meKey } from '@/api/me';
import { useOrg } from '@/app/org-context';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { initials } from '@/lib/utils';
import {
  ReadonlyField,
  SETTINGS_DESCRIPTION,
  SettingsLayout,
  SettingsSection,
  SettingsTabs,
} from './layout';
import { notAvailableYet } from './not-available';

/** The signed-in person, as opposed to the workspace they are working in. */
export function ProfileSettingsPage() {
  const { user, orgs } = useOrg();
  const client = useQueryClient();
  const navigate = useNavigate();

  const signOut = async () => {
    await authClient.signOut();
    client.setQueryData(meKey, null);
    await client.invalidateQueries();
    void navigate('/login');
  };

  return (
    <>
      <PageHeader title="Settings" description={SETTINGS_DESCRIPTION} />
      <SettingsLayout>
        <SettingsTabs />
        <SettingsSection
          title="Your account"
          description="The same across every workspace. Your name and email come from the account you sign in with."
        >
          <div className="flex items-center gap-4">
            {user.image ? (
              <img
                src={user.image}
                alt=""
                className="size-14 shrink-0 rounded-full"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-emerald text-lg font-semibold text-navy">
                {initials(user.name || user.email)}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-fg">{user.name || user.email}</p>
              <p className="truncate text-sm text-fg-muted">
                Member of {orgs.length} {orgs.length === 1 ? 'workspace' : 'workspaces'}
              </p>
            </div>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <p className="mb-1.5 text-sm font-medium text-fg">Name</p>
              <ReadonlyField>{user.name || '—'}</ReadonlyField>
            </div>
            <div>
              <p className="mb-1.5 text-sm font-medium text-fg">Email</p>
              <ReadonlyField>{user.email}</ReadonlyField>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Session"
          description="Signing out ends this browser's session. Your API keys keep working."
        >
          <Button onClick={() => void signOut()}>
            <LogOut /> Log out
          </Button>
        </SettingsSection>

        <SettingsSection
          danger
          title="Delete account"
          description="Permanently removes your sign-in and your membership of every workspace."
        >
          <Button
            variant="danger"
            onClick={() =>
              notAvailableYet(
                'Deleting your account',
                'For now you can leave each workspace from its Members page.',
              )
            }
          >
            Delete account
          </Button>
        </SettingsSection>
      </SettingsLayout>
    </>
  );
}
