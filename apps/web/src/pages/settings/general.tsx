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
import { Copyable } from '@/components/copy-button';
import { PageHeader } from '@/components/page-header';
import { AbsoluteTime } from '@/components/time';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { FieldError, FieldHint, Input, Label } from '@/components/ui/input';
import { useDeleteOrg, useUpdateOrg } from './hooks';

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
      <PageHeader title="General" description="Name and identity of this organisation." />
      <div className="max-w-2xl space-y-6">
        <Card>
          <form
            noValidate
            onSubmit={form.handleSubmit(async (values) => {
              try {
                const updated = await update.mutateAsync(values.name);
                form.reset({ name: updated.name });
                toast.success('Organisation renamed');
              } catch (error) {
                toast.error(errorMessage(error));
              }
            })}
          >
            <CardHeader>
              <div>
                <CardTitle>Organisation</CardTitle>
                <CardDescription>Shown in the sidebar and in invite emails.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="org-name">Name</Label>
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
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[auto_1fr] sm:items-center">
                <dt className="font-medium text-fg">Organisation id</dt>
                <dd className="min-w-0">
                  <Copyable value={org.id} className="max-w-full [&_code]:whitespace-nowrap" />
                </dd>
                <dt className="font-medium text-fg">Created</dt>
                <dd>
                  <AbsoluteTime value={org.created_at} className="text-fg-muted" />
                </dd>
              </dl>
            </CardContent>
            {canManage ? (
              <CardFooter>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!form.formState.isDirty}
                  loading={form.formState.isSubmitting}
                >
                  Save
                </Button>
              </CardFooter>
            ) : null}
          </form>
        </Card>

        {isOwner ? (
          <Card className="border-danger/40">
            <CardHeader>
              <div>
                <CardTitle>Danger zone</CardTitle>
                <CardDescription>
                  Deleting removes mailboxes, keys, logs, templates, webhooks and members. There is
                  no undo.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <Button variant="danger" onClick={() => setDeleting(true)}>
                Delete organisation
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${org.name}?`}
        description="Connected Gmail tokens are revoked from our side and every API key stops working immediately."
        confirmLabel="Delete organisation"
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
