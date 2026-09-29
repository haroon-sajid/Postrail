import { Plus, Search, ShieldBan, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import type { Suppression } from '@/api/types';
import { useOrg } from '@/app/org-context';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Copyable } from '@/components/copy-button';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states';
import { RelativeTime } from '@/components/time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AddSuppressionDialog, ImportSuppressionsDialog, REASON_LABEL } from './dialogs';
import {
  useAddSuppression,
  useImportSuppressions,
  useRemoveSuppression,
  useSuppressions,
} from './hooks';

function reasonLabel(reason: string): string {
  return (REASON_LABEL as Record<string, string>)[reason] ?? reason;
}

export function SuppressionsPage() {
  const { org } = useOrg();
  const suppressions = useSuppressions(org.id);
  const add = useAddSuppression(org.id);
  const importEmails = useImportSuppressions(org.id);
  const remove = useRemoveSuppression(org.id);
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<'add' | 'import' | null>(null);
  const [removing, setRemoving] = useState<Suppression | null>(null);

  const q = query.trim().toLowerCase();
  const rows = (suppressions.data ?? []).filter((s) => !q || s.email.includes(q));

  const actions = (
    <>
      <Button variant="secondary" onClick={() => setDialog('import')}>
        <Upload /> Import
      </Button>
      <Button variant="primary" onClick={() => setDialog('add')}>
        <Plus /> Add address
      </Button>
    </>
  );

  return (
    <>
      <PageHeader
        title="Suppressions"
        description="Addresses that are never sent to. Invalid recipients are added here automatically."
        actions={actions}
      />
      <Card>
        <div className="flex items-center gap-2 border-b border-border p-3">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-fg-muted" />
            <Input
              type="search"
              aria-label="Search suppressions"
              placeholder="Search by email"
              className="pl-8"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {suppressions.data ? (
            <span className="tabular text-xs text-fg-muted">
              {q ? `${rows.length} of ${suppressions.data.length}` : suppressions.data.length}{' '}
              {suppressions.data.length === 1 ? 'address' : 'addresses'}
            </span>
          ) : null}
        </div>
        {suppressions.isPending ? (
          <TableSkeleton rows={5} cols={4} />
        ) : suppressions.isError ? (
          <ErrorState error={suppressions.error} onRetry={() => void suppressions.refetch()} />
        ) : suppressions.data.length === 0 ? (
          <EmptyState
            icon={ShieldBan}
            title="No suppressed addresses"
            description="Add one by hand, paste a list, or let failed sends add invalid recipients for you."
            action={
              <Button variant="primary" onClick={() => setDialog('add')}>
                <Plus /> Add address
              </Button>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState title="No matches" description={`Nothing contains "${query.trim()}".`} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.email}>
                  <TableCell>
                    <Copyable value={s.email} />
                  </TableCell>
                  <TableCell>
                    <Badge tone={s.reason === 'manual' ? 'outline' : 'warning'}>
                      {reasonLabel(s.reason)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <RelativeTime value={s.created_at} className="text-fg-muted" />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${s.email}`}
                      className="text-fg-muted hover:text-danger-fg"
                      onClick={() => setRemoving(s)}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <AddSuppressionDialog
        open={dialog === 'add'}
        onOpenChange={(o) => setDialog(o ? 'add' : null)}
        add={(body) => add.mutateAsync(body)}
      />
      <ImportSuppressionsDialog
        open={dialog === 'import'}
        onOpenChange={(o) => setDialog(o ? 'import' : null)}
        importEmails={(body) => importEmails.mutateAsync(body)}
      />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.email ?? ''}?`}
        description="Sends to this address are allowed again. It comes back automatically if a send bounces."
        confirmLabel="Remove"
        destructive
        pending={remove.isPending}
        onConfirm={async () => {
          if (!removing) return;
          try {
            await remove.mutateAsync(removing.email);
            toast.success(`Removed ${removing.email}`);
            setRemoving(null);
          } catch (error) {
            toast.error(errorMessage(error));
          }
        }}
      />
    </>
  );
}
