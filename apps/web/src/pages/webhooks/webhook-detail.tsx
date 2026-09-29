import { ArrowLeft, KeyRound, Pencil, RotateCcw, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import type { WebhookCreated } from '@/api/types';
import { orgPath, useOrg } from '@/app/org-context';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Copyable } from '@/components/copy-button';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states';
import { SecretReveal } from '@/components/secret-reveal';
import { StatusPill } from '@/components/status-pill';
import { RelativeTime } from '@/components/time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useCreateWebhook,
  useDeleteWebhook,
  useDeliveries,
  useRetryDelivery,
  useRotateSecret,
  useTestWebhook,
  useUpdateWebhook,
  useWebhook,
} from './hooks';
import { WebhookDialog } from './webhook-dialog';

export function WebhookDetailPage() {
  const { org, canManage } = useOrg();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const webhook = useWebhook(org.id, id);
  const deliveries = useDeliveries(org.id, id);
  const create = useCreateWebhook(org.id);
  const update = useUpdateWebhook(org.id);
  const remove = useDeleteWebhook(org.id);
  const retry = useRetryDelivery(org.id, id);
  const test = useTestWebhook(org.id, id);
  const rotate = useRotateSecret(org.id, id);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<'delete' | 'rotate' | null>(null);
  const [rotated, setRotated] = useState<WebhookCreated | null>(null);

  if (webhook.isPending) {
    return (
      <div className="space-y-4" aria-busy>
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (webhook.isError)
    return <ErrorState error={webhook.error} onRetry={() => void webhook.refetch()} />;
  const w = webhook.data;

  return (
    <>
      <PageHeader
        title={w.url}
        description="Deliveries are retried with backoff up to 8 times; retry one by hand from the table."
        actions={
          <>
            <Button asChild variant="ghost">
              <Link to={orgPath(org.id, '/webhooks')}>
                <ArrowLeft /> Back
              </Link>
            </Button>
            <Button
              variant="secondary"
              loading={test.isPending}
              onClick={async () => {
                try {
                  await test.mutateAsync();
                  toast.success('Test event queued');
                } catch (error) {
                  toast.error(errorMessage(error));
                }
              }}
            >
              <Send /> Test webhook
            </Button>
            {canManage ? (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Pencil /> Edit
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <div>
              <CardTitle>Endpoint</CardTitle>
              <CardDescription>
                Created <RelativeTime value={w.created_at} />
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">Id</p>
              <Copyable value={w.id} className="mt-1" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">Events</p>
              <p className="mt-1 flex flex-wrap gap-1">
                {w.events.map((e) => (
                  <Badge key={e} tone="outline">
                    {e}
                  </Badge>
                ))}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">
                Signing secret
              </p>
              {rotated ? (
                <div className="mt-2">
                  <SecretReveal
                    value={rotated.secret}
                    label="New secret"
                    warning="The previous secret stopped working the moment you rotated."
                  />
                </div>
              ) : (
                <p className="mt-1 text-fg-muted">
                  Stored encrypted and never shown again. Rotate if it may have leaked.
                </p>
              )}
              {canManage ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  onClick={() => setConfirm('rotate')}
                >
                  <KeyRound /> Rotate secret
                </Button>
              ) : null}
            </div>
            {canManage ? (
              <div className="border-t border-border pt-4">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger-fg"
                  onClick={() => setConfirm('delete')}
                >
                  <Trash2 /> Delete webhook
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Deliveries</CardTitle>
              <CardDescription>Newest first. Refreshes every 15 seconds.</CardDescription>
            </div>
          </CardHeader>
          {deliveries.isPending ? (
            <TableSkeleton rows={5} cols={5} />
          ) : deliveries.isError ? (
            <ErrorState error={deliveries.error} onRetry={() => void deliveries.refetch()} />
          ) : deliveries.data.length === 0 ? (
            <EmptyState
              title="No deliveries yet"
              description="Send a test event or wait for the first real one."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead className="text-right">Attempts</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.data.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <code className="text-xs">{d.event}</code>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <StatusPill status={d.status} />
                        {d.error ? (
                          <span className="max-w-48 truncate text-xs text-fg-muted" title={d.error}>
                            {d.error}
                          </span>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="tabular">{d.response_code ?? '—'}</TableCell>
                    <TableCell className="tabular text-right">{d.attempts}</TableCell>
                    <TableCell>
                      <RelativeTime value={d.created_at} className="text-fg-muted" />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Retry delivery ${d.id}`}
                        disabled={d.status === 'sending' || retry.isPending}
                        onClick={async () => {
                          try {
                            await retry.mutateAsync(d.id);
                            toast.success('Delivery queued again');
                          } catch (error) {
                            toast.error(errorMessage(error));
                          }
                        }}
                      >
                        <RotateCcw /> Retry
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <WebhookDialog
        key={editing ? 'edit' : 'closed'}
        open={editing}
        onOpenChange={setEditing}
        existing={w}
        onCreate={(body) => create.mutateAsync(body)}
        onUpdate={(wid, body) => update.mutateAsync({ id: wid, body })}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete this webhook?"
        description="Pending deliveries are dropped and no further events are sent to this URL."
        confirmLabel="Delete webhook"
        destructive
        pending={remove.isPending}
        onConfirm={async () => {
          try {
            await remove.mutateAsync(w.id);
            toast.success('Webhook deleted');
            void navigate(orgPath(org.id, '/webhooks'));
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      />
      <ConfirmDialog
        open={confirm === 'rotate'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Rotate the signing secret?"
        description="Your receiver must switch to the new secret; deliveries signed with the old one will fail verification."
        confirmLabel="Rotate"
        destructive
        pending={rotate.isPending}
        onConfirm={async () => {
          try {
            setRotated(await rotate.mutateAsync());
            setConfirm(null);
            toast.success('Secret rotated');
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      />
    </>
  );
}
