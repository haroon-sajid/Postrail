import { Plus, Send } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '@/app/org-context';
import { PageHeader } from '@/components/page-header';
import { ErrorState, PageEmptyState, TableSkeleton } from '@/components/states';
import { StatusPill } from '@/components/status-pill';
import { RelativeTime } from '@/components/time';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatNumber } from '@/lib/format';
import { useContactLists } from '@/pages/contacts/hooks';
import { useTemplates } from '@/pages/templates/hooks';
import { progressOf, useBroadcasts, useCreateBroadcast } from './hooks';
import { NewBroadcastDialog } from './new-broadcast-dialog';

export function BroadcastsPage() {
  const { org } = useOrg();
  const navigate = useNavigate();
  const broadcasts = useBroadcasts(org.id);
  const templates = useTemplates(org.id);
  const lists = useContactLists(org.id);
  const create = useCreateBroadcast(org.id);
  const [creating, setCreating] = useState(false);

  const newButton = (
    <Button variant="primary" onClick={() => setCreating(true)}>
      <Plus /> New broadcast
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Broadcasts"
        description="One message to a whole list, paced across your mailboxes."
        actions={newButton}
      />
      {broadcasts.data?.length === 0 ? (
        <PageEmptyState
          icon={Send}
          title="No broadcasts yet"
          description="Pick a template and a contact list. Postrail sends it as fast as your mailboxes allow and keeps going over the following days if it has to."
          action={newButton}
        />
      ) : (
        <Card>
          {broadcasts.isPending ? (
            <TableSkeleton rows={4} cols={5} />
          ) : broadcasts.isError ? (
            <ErrorState error={broadcasts.error} onRetry={() => void broadcasts.refetch()} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>List</TableHead>
                  <TableHead className="w-56">Progress</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {broadcasts.data.map((b) => (
                  <TableRow
                    key={b.id}
                    data-clickable
                    onClick={() => void navigate(`/broadcasts/${b.id}`)}
                  >
                    <TableCell className="max-w-72 truncate font-medium">{b.name}</TableCell>
                    <TableCell>
                      <StatusPill status={b.status} />
                    </TableCell>
                    <TableCell className="text-fg-muted">{b.template?.slug ?? 'Deleted'}</TableCell>
                    <TableCell className="text-fg-muted">{b.list?.name ?? 'Deleted'}</TableCell>
                    <TableCell>
                      {b.status === 'draft' ? (
                        <span className="tabular text-xs text-fg-muted">
                          {formatNumber(b.stats.total)}{' '}
                          {b.stats.total === 1 ? 'contact' : 'contacts'}
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <Progress
                            value={progressOf(b.stats)}
                            aria-label={`${progressOf(b.stats)}% done`}
                          />
                          <span className="tabular shrink-0 text-xs text-fg-muted">
                            {formatNumber(b.stats.sent)} / {formatNumber(b.stats.total)}
                          </span>
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <RelativeTime value={b.created_at} className="text-fg-muted" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      )}

      <NewBroadcastDialog
        open={creating}
        onOpenChange={setCreating}
        templates={templates.data ?? []}
        lists={lists.data ?? []}
        create={(body) => create.mutateAsync(body)}
        onCreated={(broadcast) => void navigate(`/broadcasts/${broadcast.id}`)}
      />
    </>
  );
}
