import { zodResolver } from '@hookform/resolvers/zod';
import { updateOrgRequestSchema } from '@postrail/shared/browser';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { z } from 'zod';
import { errorMessage } from '@/api/client';
import { useOrg } from '@/app/org-context';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CopyButton } from '@/components/copy-button';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { FieldError, FieldHint, Input, Label } from '@/components/ui/input';
import { formatAbsolute } from '@/lib/format';
import { useDeleteOrg, useUpdateOrg } from './hooks';
import {
  ReadonlyField,
  SETTINGS_DESCRIPTION,
  SettingsLayout,
  SettingsSection,
  SettingsTabs,
} from './layout';

type NameValues = z.infer<typeof updateOrgRequestSchema>;

export function GeneralSettingsPage() {
  const { org, canManage, isOwner } = useOrg();
  const navigate = useNavigate();
  const update = useUpdateOrg(org.id);
  const remove = useDeleteOrg(org.id);
  const [deleting, setDeleting] = useState(false);

  const form = useForm<NameValues>({
    resolver: zodResolver(updateOrgRequestSchema),
    defaultValues: { name: org.name },
  });

  return (
    <>
      <PageHeader title="Settings" description={SETTINGS_DESCRIPTION} />
      <SettingsLayout>
        <SettingsTabs />
        <form
          noValidate
          onSubmit={form.handleSubmit(async (values) => {
            try {
              const updated = await update.mutateAsync(values.name);
              form.reset({ name: updated.name });
              toast.success('Workspace renamed');
            } catch (error) {
              toast.error(errorMessage(error));
            }
          })}
        >
          <SettingsSection
            title="Workspace"
            description="The name is shown in the sidebar and in invite emails."
            footer={
              canManage ? (
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!form.formState.isDirty}
                  loading={form.formState.isSubmitting}
                >
                  Save
                </Button>
              ) : null
            }
          >
            {/* Two columns on a wide panel, so no single field has to span all of it. */}
            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <Label htmlFor="org-name">Workspace name</Label>
                <Input
                  id="org-name"
                  maxLength={80}
                  disabled={!canManage}
                  aria-invalid={!!form.formState.errors.name}
                  {...form.register('name')}
                />
                <FieldError message={form.formState.errors.name?.message} />
                {!canManage ? <FieldHint>Only owners and admins can rename.</FieldHint> : null}
              </div>
              <div>
                <p className="mb-1.5 text-sm font-medium text-fg">Workspace ID</p>
                <ReadonlyField action={<CopyButton value={org.id} label="Workspace ID" />}>
                  <code className="text-xs">{org.id}</code>
                </ReadonlyField>
              </div>
              <div>
                <p className="mb-1.5 text-sm font-medium text-fg">Created</p>
                <ReadonlyField>{formatAbsolute(org.created_at)}</ReadonlyField>
              </div>
              <div>
                <p className="mb-1.5 text-sm font-medium text-fg">Your role</p>
                <ReadonlyField>
                  <span className="capitalize">{org.role}</span>
                </ReadonlyField>
              </div>
            </div>
          </SettingsSection>
        </form>

        {isOwner ? (
          <SettingsSection
            danger
            title="Delete workspace"
            description="Permanently removes its mailboxes, API keys, logs, templates, webhooks and members. This cannot be undone."
          >
            <Button variant="danger" onClick={() => setDeleting(true)}>
              Delete workspace
            </Button>
          </SettingsSection>
        ) : null}
      </SettingsLayout>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${org.name}?`}
        description="Connected Gmail tokens are revoked from our side and every API key stops working immediately."
        confirmLabel="Delete workspace"
        destructive
        typeToConfirm={org.name}
        pending={remove.isPending}
        onConfirm={async () => {
          try {
            await remove.mutateAsync(org.name);
            toast.success(`Deleted ${org.name}`);
            void navigate('/', { replace: true });
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      />
    </>
  );
}
