import {
  AUTH_ACCESS_TOKEN_TTL_MINUTES,
  AUTH_MAGIC_LINK_TTL_MINUTES,
  AUTH_OTP_TTL_MINUTES,
} from '@postrail/shared/browser';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import type { AuthSettings } from '@/api/types';
import { useOrg } from '@/app/org-context';
import { CodeBlock } from '@/components/code-block';
import { CopyButton } from '@/components/copy-button';
import { PageHeader } from '@/components/page-header';
import { CardSkeleton, ErrorState } from '@/components/states';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/checkbox';
import { ReadonlyField, SettingsLayout, SettingsSection } from '@/pages/settings/layout';
import { useTemplates } from '@/pages/templates/hooks';
import { EmailsSection } from './emails-section';
import { type UpdateAuthSettingsBody, useAuthSettings, useUpdateAuthSettings } from './hooks';
import { OAuthClientSection } from './oauth-client-section';
import { RedirectUrlsEditor } from './redirect-urls';
import { signInSnippet, verifySnippet } from './snippet';

type MethodKey = keyof AuthSettings['methods'];

const METHODS: { key: MethodKey; title: string; body: string }[] = [
  {
    key: 'google',
    title: 'Google',
    body: 'A "Continue with Google" redirect. People pick an account and come back signed in.',
  },
  {
    key: 'github',
    title: 'GitHub',
    body: 'A "Continue with GitHub" redirect, through your own GitHub OAuth app.',
  },
  {
    key: 'magic_link',
    title: 'Magic link',
    body: `Emails a one-time link from your connected mailbox. It works for ${AUTH_MAGIC_LINK_TTL_MINUTES} minutes.`,
  },
  {
    key: 'email_otp',
    title: 'Email code',
    body: `Emails a six-digit code from your connected mailbox. It works for ${AUTH_OTP_TTL_MINUTES} minutes.`,
  },
];

/** Saves one change and reports it. Resolves true on success so forms know to reset. */
type Save = (body: UpdateAuthSettingsBody, done: string) => Promise<boolean>;

export function SignInMethodsPage() {
  const { org, canManage } = useOrg();
  const settings = useAuthSettings(org.id);
  const templates = useTemplates(org.id);
  const update = useUpdateAuthSettings(org.id);

  const save: Save = async (body, done) => {
    try {
      await update.mutateAsync(body);
      toast.success(done);
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    }
  };

  return (
    <>
      <PageHeader
        title="Sign-in methods"
        description="How people sign in to your app, and where Postrail may send them back to."
      />
      {settings.isPending ? (
        <Card>
          <CardSkeleton lines={5} />
        </Card>
      ) : settings.isError ? (
        <Card>
          <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
        </Card>
      ) : (
        <SettingsLayout>
          {!canManage ? (
            <Alert tone="info">Only owners and admins can change sign-in settings.</Alert>
          ) : null}

          <SettingsSection
            title="Methods"
            description="Turn a method off and new sign-ins with it are refused. People already signed in stay signed in."
            flush
          >
            <ul className="divide-y divide-border">
              {METHODS.map((method) => {
                // GitHub has no client of Postrail's to fall back on.
                const needsClient = method.key === 'github' && !settings.data.github.client_id;
                return (
                  <SwitchRow
                    key={method.key}
                    title={method.title}
                    body={
                      needsClient ? `${method.body} Add the OAuth app below first.` : method.body
                    }
                    label={`${method.title} sign-in`}
                    checked={settings.data.methods[method.key]}
                    disabled={!canManage || update.isPending || needsClient}
                    onChange={(on) => {
                      const methods: Partial<AuthSettings['methods']> = {};
                      methods[method.key] = on;
                      void save({ methods }, `${method.title} sign-in turned ${on ? 'on' : 'off'}`);
                    }}
                  />
                );
              })}
            </ul>
          </SettingsSection>

          <SettingsSection
            title="Who can sign in"
            description="Close sign-ups to make your app invite-only."
            flush
          >
            <ul>
              <SwitchRow
                title="Allow new sign-ups"
                body={
                  <>
                    When off, only people already on the{' '}
                    <Link to="/users" className="text-primary underline">
                      Users
                    </Link>{' '}
                    page can sign in. Add someone there to let them in.
                  </>
                }
                label="Allow new sign-ups"
                checked={settings.data.signups_enabled}
                disabled={!canManage || update.isPending}
                onChange={(on) =>
                  void save({ signups_enabled: on }, on ? 'Sign-ups opened' : 'Sign-ups closed')
                }
              />
            </ul>
          </SettingsSection>

          <SettingsSection
            title="Redirect URLs"
            description="After Google, GitHub or a magic link, Postrail only sends people to a URL on this list."
          >
            <RedirectUrlsEditor
              // Remount with the saved list so the draft never drifts from the server.
              key={settings.data.redirect_urls.join('\n')}
              urls={settings.data.redirect_urls}
              canManage={canManage}
              onSave={(redirect_urls) => save({ redirect_urls }, 'Redirect URLs saved')}
            />
          </SettingsSection>

          <OAuthClientSection
            provider="Google"
            description="Whose name Google shows on its consent screen."
            clientId={settings.data.google.client_id}
            callbackUrl={settings.data.google.callback_url}
            badge={
              settings.data.google.mode === 'custom'
                ? { label: 'Your own', tone: 'success' }
                : { label: 'Shared', tone: 'warning' }
            }
            notice={
              settings.data.google.mode === 'shared' ? (
                <Alert tone="warning" title="Using Postrail's shared Google client">
                  Sign-in works right now, and Google&apos;s consent screen says Postrail. Add your
                  own client before you launch so it shows your app&apos;s name.
                </Alert>
              ) : null
            }
            callbackHint="In Google Cloud Console, create an OAuth client of type Web application and add this as an authorised redirect URI."
            clientIdPlaceholder="1234567890-abc.apps.googleusercontent.com"
            canManage={canManage}
            onSave={(google) => save({ google }, 'Google client saved')}
            remove={{
              label: 'Use the shared client',
              title: 'Go back to the shared Google client?',
              description:
                "Your client ID and secret are deleted and Google's consent screen will say Postrail again. Your users keep their accounts.",
              onConfirm: () => save({ google: null }, 'Now using the shared Google client'),
            }}
          />

          <OAuthClientSection
            provider="GitHub"
            description="GitHub sign-in runs through an OAuth app you own."
            clientId={settings.data.github.client_id}
            callbackUrl={settings.data.github.callback_url}
            badge={
              settings.data.github.client_id
                ? { label: 'Connected', tone: 'success' }
                : { label: 'Not set up', tone: 'outline' }
            }
            callbackHint="In GitHub, open Settings, Developer settings, OAuth Apps, create an app and set this as its authorization callback URL."
            clientIdPlaceholder="Ov23li..."
            canManage={canManage}
            onSave={(github) => save({ github }, 'GitHub client saved')}
            remove={{
              label: 'Remove the GitHub app',
              title: 'Remove the GitHub OAuth app?',
              description:
                'Its client ID and secret are deleted and GitHub sign-in is turned off. Your users keep their accounts and can still use the other methods.',
              onConfirm: () => save({ github: null }, 'GitHub client removed'),
            }}
          />

          <EmailsSection
            key={settings.data.app_name ?? ''}
            settings={settings.data}
            templates={templates.data ?? []}
            canManage={canManage}
            save={save}
          />

          <SettingsSection
            title="Add it to your app"
            description="A few calls from your server, with the same API key that sends your email."
          >
            <CodeBlock code={signInSnippet(settings.data.redirect_urls[0])} title="node" />
          </SettingsSection>

          <SettingsSection
            title="Verify without calling Postrail"
            description={`The access token is a signed JWT that lasts ${AUTH_ACCESS_TOKEN_TTL_MINUTES} minutes. Check it against these public keys on every request; no API call, and no rate limit.`}
          >
            <div className="grid gap-5 lg:grid-cols-3">
              {(
                [
                  ['Issuer', settings.data.tokens.issuer],
                  ['Audience', settings.data.tokens.audience],
                  ['Key set (JWKS) URL', settings.data.tokens.jwks_url],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <p className="mb-1.5 text-sm font-medium text-fg">{label}</p>
                  <ReadonlyField action={<CopyButton value={value} label={label} />}>
                    <code className="text-xs">{value}</code>
                  </ReadonlyField>
                </div>
              ))}
            </div>
            <CodeBlock code={verifySnippet(settings.data.tokens)} title="node" />
          </SettingsSection>
        </SettingsLayout>
      )}
    </>
  );
}

/** A setting that is either on or off, with what it does beside the switch. */
function SwitchRow(props: {
  title: string;
  body: React.ReactNode;
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <li className="flex items-center gap-4 px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-fg">{props.title}</p>
        <p className="mt-0.5 text-sm text-fg-muted">{props.body}</p>
      </div>
      <Switch
        aria-label={props.label}
        checked={props.checked}
        disabled={props.disabled}
        onCheckedChange={props.onChange}
      />
    </li>
  );
}
