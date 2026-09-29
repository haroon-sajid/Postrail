import { CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Email } from '@/api/types';
import { orgPath, useOrg } from '@/app/org-context';
import { EmptyState } from '@/components/states';
import { RelativeTime } from '@/components/time';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/** The last few failed messages, each linking to its log entry. */
export function RecentFailures({ failures }: { failures: Email[] }) {
  const { org } = useOrg();
  if (failures.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="No recent failures"
        description="Everything in the last few hundred sends went through."
      />
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>To</TableHead>
          <TableHead>Subject</TableHead>
          <TableHead>Error</TableHead>
          <TableHead className="text-right">When</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {failures.map((f) => (
          <TableRow key={f.id}>
            <TableCell className="max-w-48 truncate font-medium">
              <Link
                to={orgPath(org.id, `/logs?m=${f.id}`)}
                className="text-fg underline-offset-4 hover:underline"
              >
                {f.to}
              </Link>
            </TableCell>
            <TableCell className="max-w-56 truncate text-fg-muted">{f.subject}</TableCell>
            <TableCell className="max-w-72 truncate text-danger-fg" title={f.error ?? ''}>
              {f.error ?? '—'}
            </TableCell>
            <TableCell className="whitespace-nowrap text-right text-fg-muted">
              <RelativeTime value={f.created_at} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
