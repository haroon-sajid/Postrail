import { zodResolver } from '@hookform/resolvers/zod';
import { type OAuthClientInput, oauthClientSchema } from '@postrail/shared/browser';
import { type ReactNode, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CopyButton } from '@/components/copy-button';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FieldError, FieldHint, Input, Label } from '@/components/ui/input';
import { ReadonlyField, SettingsSection } from '@/pages/settings/layout';

export interface OAuthClientSectionProps {
  /** Used in ids and labels, e.g. "Google". */
  provider: string;
  description: string;
  /** The saved client id, or null when the workspace has none of its own. */
  clientId: string | null;
  callbackUrl: string;
  badge: { label: string; tone: BadgeTone };
  /** Shown above the fields, e.g. the notice about the shared Google client. */
  notice?: ReactNode;
  /** Where to create the client and what to paste the callback URL into. */
  callbackHint: string;
  clientIdPlaceholder: string;
  canManage: boolean;
  /** Resolves true when saved, so the form knows to forget the secret. */
  onSave: (client: OAuthClientInput) => Promise<boolean>;
  remove: { label: string; title: string; description: string; onConfirm: () => Promise<boolean> };
}

/** One provider's OAuth client: the callback URL to register, and the id and secret to save. */
export function OAuthClientSection(props: OAuthClientSectionProps) {
  const { provider, clientId, canManage, remove } = props;
  const [removing, setRemoving] = useState(false);
  const id = provider.toLowerCase();
  const form = useForm<OAuthClientInput>({
    resolver: zodResolver(oauthClientSchema),
    defaultValues: { client_id: clientId ?? '', client_secret: '' },
  });

  return (
    <>
      <form
        noValidate
        onSubmit={form.handleSubmit(async (values) => {
          if (await props.onSave(values)) {
            // The secret is write-only: never keep it in the form once it is stored.
            form.reset({ client_id: values.client_id, client_secret: '' });
          }
        })}
      >
        <SettingsSection
          title={
            <span className="flex items-center gap-2">
              {provider} client
              <Badge tone={props.badge.tone}>{props.badge.label}</Badge>
            </span>
          }
          description={props.description}
          footer={
            canManage ? (
              <>
                {clientId ? (
                  <Button type="button" variant="ghost" onClick={() => setRemoving(true)}>
                    {remove.label}
                  </Button>
                ) : null}
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!form.formState.isDirty}
                  loading={form.formState.isSubmitting}
                >
                  Save {provider} client
                </Button>
              </>
            ) : null
          }
        >
          {props.notice}
          <div>
            <p className="mb-1.5 text-sm font-medium text-fg">Callback URL</p>
            <ReadonlyField
              action={<CopyButton value={props.callbackUrl} label={`${provider} callback URL`} />}
            >
              <code className="text-xs">{props.callbackUrl}</code>
            </ReadonlyField>
            <FieldHint>{props.callbackHint}</FieldHint>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <Label htmlFor={`${id}-client-id`}>{provider} client ID</Label>
              <Input
                id={`${id}-client-id`}
                autoComplete="off"
                placeholder={props.clientIdPlaceholder}
                disabled={!canManage}
                aria-invalid={!!form.formState.errors.client_id}
                {...form.register('client_id')}
              />
              <FieldError message={form.formState.errors.client_id?.message} />
            </div>
            <div>
              <Label htmlFor={`${id}-client-secret`}>{provider} client secret</Label>
              <Input
                id={`${id}-client-secret`}
                type="password"
                autoComplete="off"
                placeholder={clientId ? 'Saved. Type a new one to replace it' : ''}
                disabled={!canManage}
                aria-invalid={!!form.formState.errors.client_secret}
                {...form.register('client_secret')}
              />
              <FieldError message={form.formState.errors.client_secret?.message} />
              <FieldHint>Stored encrypted and never shown again.</FieldHint>
            </div>
          </div>
        </SettingsSection>
      </form>

      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={remove.title}
        description={remove.description}
        confirmLabel={remove.label}
        destructive
        onConfirm={async () => {
          if (await remove.onConfirm()) {
            form.reset({ client_id: '', client_secret: '' });
            setRemoving(false);
          }
        }}
      />
    </>
  );
}
