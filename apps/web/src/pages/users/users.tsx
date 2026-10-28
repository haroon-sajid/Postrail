import { ChevronLeft, ChevronRight, Plus, Search, Users as UsersIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import type { AuthUser } from '@/api/types';
import { useOrg } from '@/app/org-context';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, PageEmptyState, TableSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AddUserDialog } from './add-user-dialog';
import { useAuthUsers, useCreateAuthUser, useDeleteAuthUser, useRevokeUserSessions } from './hooks';
import { UsersTable } from './users-table';

export function UsersPage() {
  const { org, canManage } = useOrg();
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState('');
  // Cursor pagination only goes forward; remember where we came from for "Previous".
  const [history, setHistory] = useState<string[]>([]);
  const users = useAuthUsers(org.id, { q, cursor });
  const signOut = useRevokeUserSessions(org.id);
  const remove = useDeleteAuthUser(org.id);
  const [signingOut, setSigningOut] = useState<AuthUser | null>(null);
  const [deleting, setDeleting] = useState<AuthUser | null>(null);

  const create = useCreateAuthUser(org.id);
  const [adding, setAdding] = useState(false);

  const rows = users.data?.data ?? [];
  // Nobody has signed in yet, as opposed to a search or a later page that came back empty.
  const noUsersAtAll = users.data?.data.length === 0 && !q && !cursor;

  const search = (value: string) => {
    setQ(value.trim());
    setCursor('');
    setHistory([]);
  };

  const addButton = canManage ? (
    <Button variant="primary" onClick={() => setAdding(true)}>
      <Plus /> Add user
    </Button>
  ) : null;

  return (
    <>
      <PageHeader
        title="Users"
        description="The people who have signed in to your app through Postrail."
        actions={addButton}
      />
      {noUsersAtAll ? (
        <PageEmptyState
          icon={UsersIcon}
          title="No users yet"
          description="They appear here the first time someone signs in to your app with Google, GitHub, an emailed link or an emailed code."
          action={
            <Button asChild variant={canManage ? 'secondary' : 'primary'}>
              <Link to="/sign-in">Set up sign-in</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <form
            role="search"
            className="border-b border-border bg-bg-subtle/40 px-5 py-4"
            onSubmit={(e) => {
              e.preventDefault();
              search(draft);
            }}
          >
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-fg-muted" />
              <Input
                type="search"
                aria-label="Search users"
                placeholder="Search by email or name, then press Enter"
                className="pl-9"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  // Clearing the box should not need a second keypress to show everyone again.
                  if (e.target.value === '' && q) search('');
                }}
              />
            </div>
          </form>

          {users.isPending ? (
            <TableSkeleton rows={6} cols={4} />
          ) : users.isError ? (
            <ErrorState error={users.error} onRetry={() => void users.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState title="No matches" description={`No user matches "${q}".`} />
          ) : (
            <UsersTable
              users={rows}
              canManage={canManage}
              onSignOut={setSigningOut}
              onDelete={setDeleting}
              className={users.isPlaceholderData ? 'opacity-60' : undefined}
            />
          )}

          <div className="flex items-center justify-between border-t border-border bg-bg-subtle/40 px-5 py-3 text-xs text-fg-muted">
            <span>{rows.length > 0 ? `${rows.length} on this page` : ''}</span>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                disabled={history.length === 0}
                onClick={() => {
                  setCursor(history.at(-1) ?? '');
                  setHistory((h) => h.slice(0, -1));
                }}
              >
                <ChevronLeft /> Previous
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!users.data?.next_cursor}
                onClick={() => {
                  setHistory((h) => [...h, cursor]);
                  setCursor(users.data?.next_cursor ?? '');
                }}
              >
                Next <ChevronRight />
              </Button>
            </div>
          </div>
        </Card>
      )}

      <AddUserDialog
        open={adding}
        onOpenChange={setAdding}
        add={(body) => create.mutateAsync(body)}
      />
      <ConfirmDialog
        open={!!signingOut}
        onOpenChange={(o) => !o && setSigningOut(null)}
        title={`Sign ${signingOut?.email ?? ''} out everywhere?`}
        description="Every session they hold stops verifying. They can sign in again straight away."
        confirmLabel="Sign out"
        pending={signOut.isPending}
        onConfirm={async () => {
          if (!signingOut) return;
          try {
            const { revoked } = await signOut.mutateAsync(signingOut.id);
            toast.success(`Ended ${revoked} ${revoked === 1 ? 'session' : 'sessions'}`);
            setSigningOut(null);
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.email ?? ''}?`}
        description="Removes the user, their linked Google account and every session. If they sign in again they come back as a new user with a new id."
        confirmLabel="Delete user"
        destructive
        pending={remove.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove.mutateAsync(deleting.id);
            toast.success(`Deleted ${deleting.email}`);
            setDeleting(null);
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      />
    </>
  );
}
