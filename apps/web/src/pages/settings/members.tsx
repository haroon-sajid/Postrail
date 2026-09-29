import { zodResolver } from '@hookform/resolvers/zod';
import { createInviteRequestSchema, MEMBER_ROLES } from '@postrail/shared';
import { Mail, Trash2, UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { errorMessage } from '@/api/client';
import type { Invite, Member } from '@/api/types';
import { useOrg } from '@/app/org-context';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states';
import { RelativeTime } from '@/components/time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldError, FieldHint, Input, Label } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { initials } from '@/lib/utils';
import {
  useCreateInvite,
  useInvites,
  useMembers,
  useRemoveMember,
  useRevokeInvite,
  useUpdateMemberRole,
  type CreateInviteBody,
  type MemberRole,
} from './hooks';

const ROLE_LABEL: Record<MemberRole, string> = { owner: 'Owner', admin: 'Admin', member: 'Member' };
const ROLE_HELP: Record<MemberRole, string> = {
  owner: 'Everything, including deleting the org and managing owners.',
  admin: 'Manage mailboxes, keys, webhooks and members.',
  member: 'View everything, edit templates and suppressions.',
};

function RoleSelect({
  value,
  onChange,
  canGrantOwner,
  disabled,
  id,
  ariaLabel,
}: {
  value: MemberRole;
  onChange: (role: MemberRole) => void;
  canGrantOwner: boolean;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as MemberRole)}
      disabled={disabled ?? false}
    >
      <SelectTrigger id={id} aria-label={ariaLabel} className="h-7 w-28 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {MEMBER_ROLES.map((r) => (
          <SelectItem key={r} value={r} disabled={r === 'owner' && !canGrantOwner}>
            {ROLE_LABEL[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function MembersSettingsPage() {
  const { org, user, canManage, isOwner } = useOrg();
  const members = useMembers(org.id);
  const invites = useInvites(org.id);
  const updateRole = useUpdateMemberRole(org.id);
  const removeMember = useRemoveMember(org.id);
  const revokeInvite = useRevokeInvite(org.id);
  const createInvite = useCreateInvite(org.id);
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [revoking, setRevoking] = useState<Invite | null>(null);

  const ownerCount = members.data?.filter((m) => m.role === 'owner').length ?? 0;

  const inviteButton = canManage ? (
    <Button variant="primary" onClick={() => setInviting(true)}>
      <UserPlus /> Invite
    </Button>
  ) : null;

  return (
    <>
      <PageHeader
        title="Members"
        description="Who can sign in to this organisation and what they can change."
        actions={inviteButton}
      />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Members</CardTitle>
              <CardDescription>
                {members.data
                  ? `${members.data.length} ${members.data.length === 1 ? 'person' : 'people'}`
                  : 'Loading'}
              </CardDescription>
            </div>
          </CardHeader>
          {members.isPending ? (
            <TableSkeleton rows={3} cols={4} />
          ) : members.isError ? (
            <ErrorState error={members.error} onRetry={() => void members.refetch()} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.data.map((m) => {
                  const self = m.user_id === user.id;
                  const lastOwner = m.role === 'owner' && ownerCount <= 1;
                  // Owners can change anyone; admins can change non-owners; nobody edits the last owner.
                  const canEdit = (isOwner || (canManage && m.role !== 'owner')) && !lastOwner;
                  const canRemove = canEdit || (self && !lastOwner);
                  return (
                    <TableRow key={m.user_id}>
                      <TableCell>
                        <span className="flex items-center gap-3">
                          <span
                            aria-hidden
                            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                          >
                            {initials(m.name || m.email)}
                          </span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-2 font-medium">
                              <span className="truncate">{m.name || m.email}</span>
                              {self ? <Badge tone="outline">You</Badge> : null}
                            </span>
                            <span className="block truncate text-xs text-fg-muted">{m.email}</span>
                          </span>
                        </span>
                      </TableCell>
                      <TableCell>
                        {canEdit ? (
                          <RoleSelect
                            value={m.role}
                            canGrantOwner={isOwner}
                            ariaLabel={`Role for ${m.email}`}
                            disabled={updateRole.isPending}
                            onChange={async (role) => {
                              if (role === m.role) return;
                              try {
                                await updateRole.mutateAsync({ userId: m.user_id, role });
                                toast.success(`${m.name || m.email} is now ${ROLE_LABEL[role]}`);
                              } catch (error) {
                                toast.error(errorMessage(error));
                              }
                            }}
                          />
                        ) : (
                          <Badge tone={m.role === 'owner' ? 'info' : 'neutral'}>
                            {ROLE_LABEL[m.role]}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <RelativeTime value={m.joined_at} className="text-fg-muted" />
                      </TableCell>
                      <TableCell>
                        {canRemove ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={self ? 'Leave organisation' : `Remove ${m.email}`}
                            className="text-fg-muted hover:text-danger-fg"
                            onClick={() => setRemoving(m)}
                          >
                            <Trash2 />
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Pending invites</CardTitle>
              <CardDescription>
                Links expire after 7 days. Re-invite to send a new one.
              </CardDescription>
            </div>
          </CardHeader>
          {invites.isPending ? (
            <TableSkeleton rows={2} cols={4} />
          ) : invites.isError ? (
            <ErrorState error={invites.error} onRetry={() => void invites.refetch()} />
          ) : invites.data.length === 0 ? (
            <EmptyState
              icon={Mail}
              title="No pending invites"
              description="Invited people show here until they accept."
              action={inviteButton}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.data.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.email}</TableCell>
                    <TableCell>
                      <Badge tone="neutral">{ROLE_LABEL[i.role]}</Badge>
                    </TableCell>
                    <TableCell>
                      <RelativeTime value={i.expires_at} className="text-fg-muted" />
                    </TableCell>
                    <TableCell>
                      {canManage ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Revoke invite for ${i.email}`}
                          className="text-fg-muted hover:text-danger-fg"
                          onClick={() => setRevoking(i)}
                        >
                          <X />
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <InviteDialog
        open={inviting}
        onOpenChange={setInviting}
        canGrantOwner={isOwner}
        invite={(body) => createInvite.mutateAsync(body)}
      />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={
          removing?.user_id === user.id
            ? `Leave ${org.name}?`
            : `Remove ${removing?.name || removing?.email || ''}?`
        }
        description={
          removing?.user_id === user.id
            ? 'You lose access immediately. An owner or admin can invite you back.'
            : 'They lose access immediately. Their API keys keep working until revoked.'
        }
        confirmLabel={removing?.user_id === user.id ? 'Leave' : 'Remove'}
        destructive
        pending={removeMember.isPending}
        onConfirm={async () => {
          if (!removing) return;
          const self = removing.user_id === user.id;
          try {
            await removeMember.mutateAsync(removing.user_id);
            toast.success(self ? `You left ${org.name}` : `Removed ${removing.email}`);
            setRemoving(null);
            if (self) window.location.assign('/');
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      />
      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(o) => !o && setRevoking(null)}
        title={`Revoke invite for ${revoking?.email ?? ''}?`}
        description="The link in their email stops working."
        confirmLabel="Revoke"
        destructive
        pending={revokeInvite.isPending}
        onConfirm={async () => {
          if (!revoking) return;
          try {
            await revokeInvite.mutateAsync(revoking.id);
            toast.success(`Revoked invite for ${revoking.email}`);
            setRevoking(null);
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      />
    </>
  );
}

type InviteInput = z.input<typeof createInviteRequestSchema>;
type InviteValues = z.output<typeof createInviteRequestSchema>;

function InviteDialog({
  open,
  onOpenChange,
  canGrantOwner,
  invite,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canGrantOwner: boolean;
  invite: (body: CreateInviteBody) => Promise<Invite>;
}) {
  const form = useForm<InviteInput, unknown, InviteValues>({
    resolver: zodResolver(createInviteRequestSchema),
    defaultValues: { email: '', role: 'member' },
  });
  const role = form.watch('role') ?? 'member';
  const close = (next: boolean) => {
    if (!next) form.reset();
    onOpenChange(next);
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size="sm">
        <form
          noValidate
          onSubmit={form.handleSubmit(async (values) => {
            try {
              await invite(values);
              toast.success(`Invite sent to ${values.email}`);
              close(false);
            } catch (error) {
              toast.error(errorMessage(error));
            }
          })}
        >
          <DialogHeader>
            <DialogTitle>Invite someone</DialogTitle>
            <DialogDescription>
              They get an email with a link that works for 7 days and only for that address.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div>
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                autoFocus
                placeholder="colleague@company.com"
                aria-invalid={!!form.formState.errors.email}
                {...form.register('email')}
              />
              <FieldError message={form.formState.errors.email?.message} />
            </div>
            <div>
              <Label htmlFor="invite-role">Role</Label>
              <Controller
                control={form.control}
                name="role"
                render={({ field }) => (
                  <Select value={field.value ?? 'member'} onValueChange={field.onChange}>
                    <SelectTrigger id="invite-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MEMBER_ROLES.map((r) => (
                        <SelectItem key={r} value={r} disabled={r === 'owner' && !canGrantOwner}>
                          {ROLE_LABEL[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldHint>{ROLE_HELP[role]}</FieldHint>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>
              Send invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
