import { Plus, Webhook as WebhookIcon } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '@/app/org-context';
import { PageHeader } from '@/components/page-header';
import { ErrorState, PageEmptyState, TableSkeleton } from '@/components/states';
import { StatusPill } from '@/components/status-pill';
import { RelativeTime } from '@/components/time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCreateWebhook, useDeliveries, useUpdateWebhook, useWebhooks } from './hooks';
import { WebhookDialog } from './webhook-dialog';

export function WebhooksPage() {
  const { org, canManage } = useOrg();
  const navigate = useNavigate();
  const webhooks = useWebhooks(org.id);
  const create = useCreateWebhook(org.id);
  const update = useUpdateWebhook(org.id);
  const [creating, setCreating] = useState(false);

  const newButton = canManage ? (
    <Button variant="primary" onClick={() => setCreating(true)}>
      <Plus /> New webhook
    </Button>
  ) : null;

  return (
    <>
      <PageHeader
        title="Webhooks"
        description="Signed HTTP notifications when a message is sent or fails, or a mailbox disconnects."
        actions={newButton}
      />
      {webhooks.data?.length === 0 ? (
        <PageEmptyState
          icon={WebhookIcon}
          title="No webhooks yet"
          description="Add an endpoint to be told about deliveries instead of polling the logs."
          action={newButton}
        />
      ) : (
        <Card>
          {webhooks.isPending ? (
            <TableSkeleton rows={3} cols={4} />
          ) : webhooks.isError ? (
            <ErrorState error={webhooks.error} onRetry={() => void webhooks.refetch()} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>URL</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead>Last delivery</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {webhooks.data.map((w) => (
                  <TableRow
                    key={w.id}
                    data-clickable
                    onClick={() => void navigate(`/webhooks/${w.id}`)}
                  >
                    <TableCell className="max-w-80 truncate font-medium">{w.url}</TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-1">
                        {w.events.map((e) => (
                          <Badge key={e} tone="outline">
                            {e}
                          </Badge>
                        ))}
                      </span>
                    </TableCell>
                    <TableCell>
                      <LastDelivery webhookId={w.id} />
                    </TableCell>
                    <TableCell>
                      <RelativeTime value={w.created_at} className="text-fg-muted" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      )}

      <WebhookDialog
        open={creating}
        onOpenChange={setCreating}
        onCreate={(body) => create.mutateAsync(body)}
        onUpdate={(id, body) => update.mutateAsync({ id, body })}
      />
    </>
  );
}

function LastDelivery({ webhookId }: { webhookId: string }) {
  const { org } = useOrg();
  const deliveries = useDeliveries(org.id, webhookId, 1);
  if (deliveries.isPending) return <Skeleton className="h-4 w-24" />;
  const last = deliveries.data?.[0];
  if (!last) return <span className="text-xs text-fg-muted">No deliveries yet</span>;
  return (
    <span className="flex items-center gap-2">
      <StatusPill status={last.status} />
      <span className="tabular text-xs text-fg-muted">
        {last.response_code ?? '—'} · <RelativeTime value={last.created_at} />
      </span>
    </span>
  );
}
