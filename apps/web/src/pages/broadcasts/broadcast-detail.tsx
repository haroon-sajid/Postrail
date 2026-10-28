import { BROADCAST_CAPACITY_SHARE } from '@postrail/shared/browser';
import { ArrowLeft, Ban, ChevronLeft, ChevronRight, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import type { Broadcast } from '@/api/types';
import { useOrg } from '@/app/org-context';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states';
import { StatusPill } from '@/components/status-pill';
import { AbsoluteTime } from '@/components/time';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatNumber } from '@/lib/format';
import {
  progressOf,
  useBroadcast,
  useBroadcastRecipients,
  useCancelBroadcast,
  useDeleteBroadcast,
  useSendBroadcast,
} from './hooks';

const SHARE = `${Math.round(BROADCAST_CAPACITY_SHARE * 100)}%`;

export function BroadcastDetailPage() {
  const { org, canManage } = useOrg();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const broadcast = useBroadcast(org.id, id);
  const send = useSendBroadcast(org.id);
  const cancel = useCancelBroadcast(org.id);
  const remove = useDeleteBroadcast(org.id);
  const [confirm, setConfirm] = useState<'send' | 'cancel' | 'delete' | null>(null);

  if (broadcast.isPending) {
    return (
      <div className="space-y-4" aria-busy>
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (broadcast.isError) {
    return <ErrorState error={broadcast.error} onRetry={() => void broadcast.refetch()} />;
  }
  const b = broadcast.data;
  const sendable = b.status === 'draft' && b.template && b.list && b.stats.total > 0;

  /** Runs one of the three actions and reports it; the dialog closes only on success. */
  const run = async (action: () => Promise<unknown>, done: string, after?: () => void) => {
    try {
      await action();
      toast.success(done);
      setConfirm(null);
      after?.();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <>
      <PageHeader
        title={b.name}
        description={`${b.template?.slug ?? 'Deleted template'} to ${b.list?.name ?? 'a deleted list'}`}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link to="/broadcasts">
                <ArrowLeft /> Back
              </Link>
            </Button>
            {canManage && b.status !== 'sending' ? (
              <Button variant="secondary" onClick={() => setConfirm('delete')}>
                <Trash2 /> Delete
              </Button>
            ) : null}
            {canManage && b.status === 'sending' ? (
              <Button variant="secondary" onClick={() => setConfirm('cancel')}>
                <Ban /> Cancel sending
              </Button>
            ) : null}
            {canManage && b.status === 'draft' ? (
              <Button variant="primary" disabled={!sendable} onClick={() => setConfirm('send')}>
                <Send /> Send
              </Button>
            ) : null}
          </>
        }
      />

      <div className="space-y-5">
        <Notice broadcast={b} canManage={canManage} />

        <Card>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-border px-5 py-4">
            <StatusPill status={b.status} />
            {b.status !== 'draft' ? (
              <span className="flex min-w-48 flex-1 items-center gap-3">
                <Progress value={progressOf(b.stats)} aria-label={`${progressOf(b.stats)}% done`} />
                <span className="tabular shrink-0 text-xs text-fg-muted">
                  {progressOf(b.stats)}%
                </span>
              </span>
            ) : null}
            <span className="text-xs text-fg-muted">
              {b.started_at ? (
                <>
                  Started <AbsoluteTime value={b.started_at} />
                </>
              ) : (
                <>
                  Created <AbsoluteTime value={b.created_at} />
                </>
              )}
              {b.completed_at ? (
                <>
                  {' · '}
                  {b.status === 'canceled' ? 'Canceled' : 'Finished'}{' '}
                  <AbsoluteTime value={b.completed_at} />
                </>
              ) : null}
            </span>
          </div>
          <dl className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
            <Stat label="Recipients" value={b.stats.total} />
            <Stat label="Waiting" value={b.stats.pending} hint="For mailbox room" />
            <Stat label="On their way" value={b.stats.queued} />
            <Stat label="Sent" value={b.stats.sent} />
            <Stat label="Failed" value={b.stats.failed} />
            <Stat label="Skipped" value={b.stats.skipped} hint="Suppressed or canceled" />
          </dl>
        </Card>

        {b.status === 'draft' ? null : <Recipients broadcast={b} />}
      </div>

      <ConfirmDialog
        open={confirm === 'send'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Send to ${formatNumber(b.stats.total)} ${b.stats.total === 1 ? 'contact' : 'contacts'}?`}
        description={`"${b.template?.slug ?? ''}" goes to everyone on ${b.list?.name ?? 'the list'} as it is right now. Suppressed addresses are skipped and every email gets an unsubscribe link. This cannot be undone, only stopped.`}
        confirmLabel="Send broadcast"
        pending={send.isPending}
        onConfirm={() => run(() => send.mutateAsync(b.id), 'Broadcast started')}
      />
      <ConfirmDialog
        open={confirm === 'cancel'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Stop this broadcast?"
        description={`${formatNumber(b.stats.pending)} waiting ${b.stats.pending === 1 ? 'recipient is' : 'recipients are'} skipped. Messages already on their way still go out.`}
        confirmLabel="Cancel sending"
        destructive
        pending={cancel.isPending}
        onConfirm={() => run(() => cancel.mutateAsync(b.id), 'Broadcast canceled')}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Delete "${b.name}"?`}
        description="The broadcast and its recipient list are removed. Messages it sent stay in Logs."
        confirmLabel="Delete broadcast"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          run(
            () => remove.mutateAsync(b.id),
            `Deleted "${b.name}"`,
            () => void navigate('/broadcasts', { replace: true }),
          )
        }
      />
    </>
  );
}

/** What the reader should know about the state the broadcast is in. */
function Notice({ broadcast: b, canManage }: { broadcast: Broadcast; canManage: boolean }) {
  if (b.status === 'draft') {
    if (!b.template || !b.list) {
      return (
        <Alert tone="danger" title="This draft cannot be sent">
          Its {b.template ? 'contact list' : 'template'} was deleted. Delete the draft and create a
          new one.
        </Alert>
      );
    }
    if (b.stats.total === 0) {
      return (
        <Alert tone="warning" title="The list is empty">
          Add contacts to {b.list.name} on the{' '}
          <Link to="/contacts" className="underline">
            Contacts
          </Link>{' '}
          page, then come back to send.
        </Alert>
      );
    }
    return (
      <Alert tone="info" title="Draft: nothing has been sent">
        Sending uses up to {SHARE} of each mailbox&apos;s daily limit, so application email keeps
        flowing. A list bigger than that carries on after the daily reset at 00:00 UTC.
        {canManage ? '' : ' Only owners and admins can send.'}
      </Alert>
    );
  }
  if (b.status === 'sending' && b.stats.pending > 0) {
    return (
      <Alert tone="info" title="Sending as fast as your mailboxes allow">
        Up to {SHARE} of each mailbox&apos;s daily limit goes to broadcasts. Whoever is still
        waiting is sent to after the daily reset at 00:00 UTC.
      </Alert>
    );
  }
  return null;
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="px-5 py-4">
      <dt className="text-xs font-medium text-fg-muted">{label}</dt>
      <dd className="tabular mt-1 text-2xl font-semibold leading-8 text-fg">
        {formatNumber(value)}
      </dd>
      {hint ? <p className="text-xs text-fg-faint">{hint}</p> : null}
    </div>
  );
}

function Recipients({ broadcast }: { broadcast: Broadcast }) {
  const { org } = useOrg();
  const [cursor, setCursor] = useState('');
  // Cursor pagination only goes forward; remember where we came from for "Previous".
  const [history, setHistory] = useState<string[]>([]);
  const recipients = useBroadcastRecipients(org.id, broadcast, cursor);
  const rows = recipients.data?.data ?? [];

  return (
    <Card>
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-base font-semibold leading-6 text-fg">Recipients</h2>
        <p className="mt-0.5 text-sm text-fg-muted">
          The list as it was when sending started, by address.
        </p>
      </div>
      {recipients.isPending ? (
        <TableSkeleton rows={5} cols={3} />
      ) : recipients.isError ? (
        <ErrorState error={recipients.error} onRetry={() => void recipients.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="No recipients" description="The list was empty when sending started." />
      ) : (
        <Table className={recipients.isPlaceholderData ? 'opacity-60' : undefined}>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="max-w-72 truncate font-medium">{r.email}</TableCell>
                <TableCell>
                  <StatusPill status={r.status} />
                </TableCell>
                <TableCell className="max-w-96 truncate text-fg-muted">
                  {r.error ??
                    (r.message_id ? (
                      <Link to={`/logs?m=${r.message_id}`} className="text-primary underline">
                        View in Logs
                      </Link>
                    ) : (
                      '—'
                    ))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
            disabled={!recipients.data?.next_cursor}
            onClick={() => {
              setHistory((h) => [...h, cursor]);
              setCursor(recipients.data?.next_cursor ?? '');
            }}
          >
            Next <ChevronRight />
          </Button>
        </div>
      </div>
    </Card>
  );
}
