import { Link } from 'react-router-dom';
import type { Overview } from '@/api/types';
import { orgPath, useOrg } from '@/app/org-context';
import { EmptyState } from '@/components/states';
import { StatusPill } from '@/components/status-pill';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { formatNumber, percent } from '@/lib/format';

type Usage = Overview['mailbox_usage'][number];

function tone(pct: number): 'primary' | 'warning' | 'danger' {
  if (pct >= 95) return 'danger';
  if (pct >= 80) return 'warning';
  return 'primary';
}

/** sent_today over daily_limit per mailbox, most used first. */
export function MailboxUsage({ usage }: { usage: Usage[] }) {
  const { org } = useOrg();
  if (usage.length === 0) {
    return (
      <EmptyState
        title="No mailboxes yet"
        description="Connect a Gmail account to start sending."
        action={
          <Button asChild variant="primary" size="sm">
            <Link to={orgPath(org.id, '/mailboxes')}>Connect mailbox</Link>
          </Button>
        }
      />
    );
  }
  return (
    <ul className="divide-y divide-border">
      {usage.map((m) => {
        const pct = percent(m.sent_today, m.daily_limit);
        return (
          <li key={m.id} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-medium">{m.email}</span>
              <span className="flex shrink-0 items-center gap-2">
                <StatusPill status={m.status} />
                <span className="tabular text-xs text-fg-muted">
                  {formatNumber(m.sent_today)} / {formatNumber(m.daily_limit)}
                </span>
              </span>
            </div>
            <Progress
              value={pct}
              tone={tone(pct)}
              className="mt-2"
              aria-label={`${m.email}: ${pct}% of today's limit used`}
            />
          </li>
        );
      })}
    </ul>
  );
}
