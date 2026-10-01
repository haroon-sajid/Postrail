import { Inbox } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Overview } from '@/api/types';
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
  if (usage.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No mailboxes yet"
        description="Connect a Gmail account to start sending."
        action={
          <Button asChild variant="primary" size="sm">
            <Link to="/mailboxes">Connect mailbox</Link>
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
          <li key={m.id} className="px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-medium text-fg">{m.email}</span>
              <StatusPill status={m.status} />
            </div>
            <div className="mt-2.5 flex items-center gap-3">
              <Progress
                value={pct}
                tone={tone(pct)}
                aria-label={`${m.email}: ${pct}% of today's limit used`}
              />
              <span className="tabular shrink-0 text-xs text-fg-muted">
                {formatNumber(m.sent_today)} / {formatNumber(m.daily_limit)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
