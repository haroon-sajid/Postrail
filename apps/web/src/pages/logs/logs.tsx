import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Email } from '@/api/types';
import { DOCS_URL } from '@/app/nav';
import { useOrg } from '@/app/org-context';
import { CopyButton } from '@/components/copy-button';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states';
import { StatusPill } from '@/components/status-pill';
import { RelativeTime } from '@/components/time';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useMailboxes } from '@/pages/mailboxes/hooks';
import { DetailDrawer } from './detail-drawer';
import { type LogFilters, readFilters, writeFilters } from './filters';
import { FiltersBar } from './filters-bar';
import { useEmails } from './hooks';

const columnHelper = createColumnHelper<Email>();

const columns = [
  columnHelper.accessor('status', {
    header: 'Status',
    cell: (info) => <StatusPill status={info.getValue()} />,
  }),
  columnHelper.accessor('to', {
    header: 'To',
    cell: (info) => (
      <span className="flex items-center gap-0.5">
        <span className="truncate">{info.getValue()}</span>
        <CopyButton value={info.getValue()} label="Recipient" />
      </span>
    ),
  }),
  columnHelper.accessor('from', {
    header: 'From',
    cell: (info) => <span className="truncate text-fg-muted">{info.getValue()}</span>,
  }),
  columnHelper.accessor('subject', {
    header: 'Subject',
    cell: (info) => <span className="truncate">{info.getValue()}</span>,
  }),
  columnHelper.accessor('created_at', {
    header: 'Created',
    cell: (info) => <RelativeTime value={info.getValue()} className="text-fg-muted" />,
  }),
  columnHelper.accessor('attempts', {
    header: () => <span className="block text-right">Attempts</span>,
    cell: (info) => <span className="tabular block text-right">{info.getValue()}</span>,
  }),
];

export function LogsPage() {
  const { org } = useOrg();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => readFilters(params), [params]);
  const selected = params.get('m');
  const emails = useEmails(org.id, filters);
  const mailboxes = useMailboxes(org.id);
  // Cursor pagination only goes forward; remember where we came from for "Previous".
  const [history, setHistory] = useState<string[]>([]);

  const setFilters = (next: LogFilters) => {
    setHistory([]);
    setParams(writeFilters(next, params), { replace: true });
  };
  const goTo = (cursor: string) => {
    setParams(writeFilters({ ...filters, cursor }, params));
  };
  const select = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('m', id);
    else next.delete('m');
    setParams(next, { replace: true });
  };

  const rows = emails.data?.data ?? [];
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <>
      <PageHeader
        title="Logs"
        description="Every message, newest first. Click a row for the full story."
      />
      <Card>
        <div className="border-b border-border bg-bg-subtle/40 px-5 py-4">
          <FiltersBar filters={filters} mailboxes={mailboxes.data ?? []} onChange={setFilters} />
        </div>

        {emails.isPending ? (
          <TableSkeleton rows={8} cols={6} />
        ) : emails.isError ? (
          <ErrorState error={emails.error} onRetry={() => void emails.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No messages match"
            description={
              <>
                Nothing was sent in this range with these filters. Send your first email from the
                API, or read the{' '}
                <a
                  href={DOCS_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline"
                >
                  docs
                </a>
                .
              </>
            }
          />
        ) : (
          <Table className={emails.isPlaceholderData ? 'opacity-60' : undefined}>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((h) => (
                    <TableHead key={h.id}>
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-clickable
                  data-state={row.original.id === selected ? 'selected' : undefined}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open message to ${row.original.to}`}
                  onClick={() => select(row.original.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      select(row.original.id);
                    }
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="max-w-64">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
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
                const prev = history.at(-1) ?? '';
                setHistory((h) => h.slice(0, -1));
                goTo(prev);
              }}
            >
              <ChevronLeft /> Previous
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!emails.data?.next_cursor}
              onClick={() => {
                setHistory((h) => [...h, filters.cursor]);
                goTo(emails.data?.next_cursor ?? '');
              }}
            >
              Next <ChevronRight />
            </Button>
          </div>
        </div>
      </Card>

      <DetailDrawer id={selected} onClose={() => select(null)} />
    </>
  );
}
