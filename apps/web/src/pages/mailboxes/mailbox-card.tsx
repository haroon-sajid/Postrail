import { MoreHorizontal, Pause, Play, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Mailbox } from '@/api/types';
import { CopyButton } from '@/components/copy-button';
import { StatusPill } from '@/components/status-pill';
import { RelativeTime } from '@/components/time';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { formatNumber, percent } from '@/lib/format';

export interface MailboxCardProps {
  mailbox: Mailbox;
  /** Admins and owners; members only see. */
  canManage: boolean;
  onLimitChange: (limit: number) => void;
  onPauseToggle: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
}

function ProviderIcon({ provider }: { provider: Mailbox['provider'] }) {
  if (provider === 'google') {
    return (
      <svg viewBox="0 0 24 24" aria-label="Gmail" role="img" className="size-5">
        <path
          fill="#EA4335"
          d="M2 6.5v11A1.5 1.5 0 0 0 3.5 19H6V9.9l6 4.5 6-4.5V19h2.5a1.5 1.5 0 0 0 1.5-1.5v-11c0-1.2-1.4-1.9-2.4-1.2L12 10.3 4.4 5.3C3.4 4.6 2 5.3 2 6.5z"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-label="Outlook" role="img" className="size-5">
      <rect x="3" y="5" width="18" height="14" rx="2" fill="#0078D4" />
      <circle cx="10" cy="12" r="3.5" fill="#fff" />
    </svg>
  );
}

export function MailboxCard({
  mailbox,
  canManage,
  onLimitChange,
  onPauseToggle,
  onReconnect,
  onDisconnect,
}: MailboxCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(mailbox.daily_limit));
  const pct = percent(mailbox.sent_today, mailbox.daily_limit);
  const tone = pct >= 95 ? 'danger' : pct >= 80 ? 'warning' : 'primary';
  const disconnected = mailbox.status === 'disconnected';

  const commitLimit = () => {
    const next = Number(draft);
    setEditing(false);
    if (Number.isInteger(next) && next >= 1 && next <= 10_000 && next !== mailbox.daily_limit) {
      onLimitChange(next);
    } else {
      setDraft(String(mailbox.daily_limit));
    }
  };

  return (
    <Card data-testid="mailbox-card" className={disconnected ? 'border-warning/50' : undefined}>
      <div className="flex items-start gap-3 p-5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-bg-subtle">
          <ProviderIcon provider={mailbox.provider} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{mailbox.email}</span>
            <CopyButton value={mailbox.email} label="Email" />
            <StatusPill status={mailbox.status} />
          </div>
          <p className="mt-0.5 text-xs text-fg-muted">
            Last used <RelativeTime value={mailbox.last_used_at} /> · Connected{' '}
            <RelativeTime value={mailbox.created_at} />
          </p>
        </div>
        {canManage ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`Actions for ${mailbox.email}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!disconnected ? (
                <DropdownMenuItem onSelect={onPauseToggle}>
                  {mailbox.status === 'paused' ? <Play /> : <Pause />}
                  {mailbox.status === 'paused' ? 'Resume sending' : 'Pause sending'}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={() => setEditing(true)}>
                Edit daily limit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={onDisconnect}>
                <Trash2 /> Disconnect
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <div className="border-t border-border px-5 py-4">
        <div className="flex items-center justify-between gap-2 text-xs text-fg-muted">
          <span className="font-medium">Sent today</span>
          <span className="tabular flex items-center gap-1">
            {formatNumber(mailbox.sent_today)} /{' '}
            {editing ? (
              <Input
                aria-label="Daily limit"
                type="number"
                min={1}
                max={10000}
                className="h-6 w-20 px-1.5 text-xs"
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitLimit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitLimit();
                  if (e.key === 'Escape') {
                    setDraft(String(mailbox.daily_limit));
                    setEditing(false);
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="rounded px-1 underline decoration-dotted underline-offset-2 hover:bg-bg-muted disabled:no-underline"
                onClick={() => setEditing(true)}
                disabled={!canManage}
                aria-label={`Daily limit ${mailbox.daily_limit}, click to edit`}
              >
                {formatNumber(mailbox.daily_limit)}
              </button>
            )}
          </span>
        </div>
        <Progress
          value={pct}
          tone={tone}
          className="mt-2"
          aria-label={`${pct}% of today's limit used`}
        />
      </div>

      {disconnected ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-warning/40 bg-warning-bg px-5 py-3 text-sm text-warning-fg">
          <span>This mailbox lost its Google access. Reconnect to resume sending.</span>
          {canManage ? (
            <Button size="sm" variant="primary" onClick={onReconnect}>
              <RefreshCw /> Reconnect
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
