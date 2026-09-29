import { useQueryClient } from '@tanstack/react-query';
import { Inbox, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import type { Mailbox } from '@/api/types';
import { useOrg } from '@/app/org-context';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState } from '@/components/states';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ConnectDialog } from './connect-dialog';
import {
  mailboxesKey,
  useConnectUrl,
  useMailboxes,
  useRemoveMailbox,
  useUpdateMailbox,
} from './hooks';
import { MailboxCard } from './mailbox-card';

export function MailboxesPage() {
  const { org, canManage } = useOrg();
  const client = useQueryClient();
  const mailboxes = useMailboxes(org.id);
  const update = useUpdateMailbox(org.id);
  const remove = useRemoveMailbox(org.id);
  const connect = useConnectUrl(org.id);
  const [connecting, setConnecting] = useState(false);
  const [removing, setRemoving] = useState<Mailbox | null>(null);

  const patch = async (
    m: Mailbox,
    body: Parameters<typeof update.mutateAsync>[0]['patch'],
    done: string,
  ) => {
    // Optimistic: flip the card immediately, roll back if the API disagrees.
    const key = mailboxesKey(org.id);
    const previous = client.getQueryData<Mailbox[]>(key);
    client.setQueryData<Mailbox[]>(key, (rows) =>
      rows?.map((r) =>
        r.id === m.id
          ? {
              ...r,
              ...(body.daily_limit ? { daily_limit: body.daily_limit } : {}),
              ...(body.status ? { status: body.status } : {}),
            }
          : r,
      ),
    );
    try {
      await update.mutateAsync({ id: m.id, patch: body });
      toast.success(done);
    } catch (error) {
      client.setQueryData(key, previous);
      toast.error(errorMessage(error));
    }
  };

  const reconnect = async () => {
    try {
      window.open(await connect.mutateAsync(), '_blank', 'noopener');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const disconnected = mailboxes.data?.filter((m) => m.status === 'disconnected') ?? [];

  return (
    <>
      <PageHeader
        title="Mailboxes"
        description="The accounts your email goes out from, and how much of today's limit each has used."
        actions={
          canManage ? (
            <Button variant="primary" onClick={() => setConnecting(true)}>
              <Plus /> Connect mailbox
            </Button>
          ) : null
        }
      />

      {disconnected.length > 0 ? (
        <Alert
          tone="warning"
          title={`${disconnected.length === 1 ? 'A mailbox needs' : `${disconnected.length} mailboxes need`} reconnecting`}
          className="mb-4"
        >
          Sends through a disconnected mailbox fail until it is reconnected.
        </Alert>
      ) : null}

      {mailboxes.isPending ? (
        <div className="grid gap-4 md:grid-cols-2" aria-busy>
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="mt-2 h-3 w-32" />
              <Skeleton className="mt-6 h-1.5 w-full" />
            </Card>
          ))}
        </div>
      ) : mailboxes.isError ? (
        <Card>
          <ErrorState error={mailboxes.error} onRetry={() => void mailboxes.refetch()} />
        </Card>
      ) : mailboxes.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Inbox}
            title="No mailboxes connected"
            description="Connect a Gmail account to start sending. Each mailbox gets its own daily limit."
            action={
              canManage ? (
                <Button variant="primary" onClick={() => setConnecting(true)}>
                  <Plus /> Connect mailbox
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {mailboxes.data.map((m) => (
            <MailboxCard
              key={m.id}
              mailbox={m}
              canManage={canManage}
              onLimitChange={(limit) =>
                void patch(m, { daily_limit: limit }, `Daily limit set to ${limit}`)
              }
              onPauseToggle={() =>
                void patch(
                  m,
                  { status: m.status === 'paused' ? 'active' : 'paused' },
                  m.status === 'paused' ? 'Sending resumed' : 'Sending paused',
                )
              }
              onReconnect={() => void reconnect()}
              onDisconnect={() => setRemoving(m)}
            />
          ))}
        </div>
      )}

      <ConnectDialog open={connecting} onOpenChange={setConnecting} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Disconnect ${removing?.email ?? ''}?`}
        description="Its stored tokens are deleted and it stops sending immediately. Message history is kept."
        confirmLabel="Disconnect"
        destructive
        pending={remove.isPending}
        onConfirm={async () => {
          if (!removing) return;
          try {
            await remove.mutateAsync(removing.id);
            toast.success(`Disconnected ${removing.email}`);
            setRemoving(null);
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      />
    </>
  );
}
