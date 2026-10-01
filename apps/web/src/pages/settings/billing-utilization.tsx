import {
  DEFAULT_MAILBOX_DAILY_LIMIT,
  INVITE_TTL_DAYS,
  MAX_BATCH_SIZE,
  MAX_BODY_CHARS,
  MAX_WEBHOOK_ATTEMPTS,
} from '@postrail/shared/browser';
import { BarChart3 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { Overview } from '@/api/types';
import { useOrg } from '@/app/org-context';
import { EmptyState, ErrorState } from '@/components/states';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDay, formatNumber, percent } from '@/lib/format';
import { useOverview } from '@/pages/overview/hooks';
import { SendsChart, SendsLegend } from '@/pages/overview/sends-chart';
import { toWeekly } from './usage';

type Bucket = 'daily' | 'weekly';

const LIMITS: { label: string; value: string; unit: string; note: string }[] = [
  {
    label: 'Sends per mailbox per day',
    value: DEFAULT_MAILBOX_DAILY_LIMIT.toLocaleString(),
    unit: 'max',
    note: 'Adjustable per mailbox. Gmail itself caps free accounts around 500.',
  },
  {
    label: 'API requests',
    value: '120',
    unit: 'burst',
    note: 'Then 2 per second, per API key. Over the limit returns RATE_LIMITED with Retry-After.',
  },
  {
    label: 'Messages per batch call',
    value: MAX_BATCH_SIZE.toLocaleString(),
    unit: 'max',
    note: 'POST /v1/emails/batch',
  },
  {
    label: 'Body size',
    value: `${(MAX_BODY_CHARS / 1000).toLocaleString()}k`,
    unit: 'characters',
    note: 'HTML and text combined.',
  },
  {
    label: 'Webhook delivery attempts',
    value: String(MAX_WEBHOOK_ATTEMPTS),
    unit: 'max',
    note: 'With exponential backoff before a delivery is marked failed.',
  },
  {
    label: 'Invite link validity',
    value: String(INVITE_TTL_DAYS),
    unit: 'days',
    note: 'Members, keys, templates and webhooks are otherwise unlimited.',
  },
];

function tone(pct: number): 'primary' | 'warning' | 'danger' {
  if (pct >= 95) return 'danger';
  if (pct >= 80) return 'warning';
  return 'primary';
}

/** What the workspace sent, then how close it is to each limit. */
export function UtilizationTab() {
  const { org } = useOrg();
  const overview = useOverview(org.id);
  const [bucket, setBucket] = useState<Bucket>('daily');

  if (overview.isError) {
    return (
      <Card>
        <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="sends-heading">
        <p className="text-xs text-fg-muted">Emails sent · Current workspace</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h2 id="sends-heading" className="text-base font-semibold text-fg">
            Sends
          </h2>
          <div className="flex items-center gap-2">
            <Tabs value={bucket} onValueChange={(next) => setBucket(next as Bucket)}>
              <TabsList aria-label="Group sends by">
                <TabsTrigger value="daily">Daily</TabsTrigger>
                <TabsTrigger value="weekly">Weekly</TabsTrigger>
              </TabsList>
            </Tabs>
            {/* One period for now: the overview endpoint only returns the last 30 days. */}
            <Select value="30d">
              <SelectTrigger className="w-40" aria-label="Period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {overview.isPending ? (
          <Skeleton className="mt-4 h-80 w-full" />
        ) : (
          <SendsPanel series={overview.data.series} bucket={bucket} />
        )}
      </section>

      <section aria-labelledby="capacity-heading">
        <h2 id="capacity-heading" className="mb-3 text-base font-semibold text-fg">
          Consumption &amp; capacity
        </h2>
        <Capacity usage={overview.data?.mailbox_usage} />
      </section>
    </div>
  );
}

function SendsPanel({ series, bucket }: { series: Overview['series']; bucket: Bucket }) {
  const sent = series.reduce((n, p) => n + p.sent, 0);
  const failed = series.reduce((n, p) => n + p.failed, 0);
  const first = series[0];
  const last = series.at(-1);
  return (
    <>
      <p className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="tabular text-3xl font-semibold leading-9 text-fg">
          {formatNumber(sent)}
        </span>
        {first && last ? (
          <span className="text-sm text-fg-muted">
            {formatDay(first.date)} to {formatDay(last.date)}
          </span>
        ) : null}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-fg-muted">
          Messages accepted by the provider, grouped by {bucket === 'daily' ? 'day' : 'week'} in
          UTC.
        </p>
        <SendsLegend />
      </div>
      <Card className="mt-3">
        {sent + failed === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="No data available"
            description="There's no usage data for this period yet."
          />
        ) : (
          <div className="p-5">
            <SendsChart
              series={bucket === 'daily' ? series : toWeekly(series)}
              label={`Sends per ${bucket === 'daily' ? 'day' : 'week'} for the last 30 days, sent versus failed`}
            />
          </div>
        )}
      </Card>
    </>
  );
}

/** `usage` is undefined while the overview is loading. */
function Capacity({ usage }: { usage: Overview['mailbox_usage'] | undefined }) {
  const mailboxes = usage ?? [];
  const sent = mailboxes.reduce((n, m) => n + m.sent_today, 0);
  const capacity = mailboxes.reduce((n, m) => n + m.daily_limit, 0);
  const pct = percent(sent, capacity);
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <LimitCard
        label="Sends today"
        value={usage ? formatNumber(sent) : null}
        unit={usage ? `/ ${formatNumber(capacity)}` : undefined}
        note={
          mailboxes.length === 0
            ? 'Connect a mailbox to start sending.'
            : `Across ${mailboxes.length} connected ${mailboxes.length === 1 ? 'mailbox' : 'mailboxes'}.`
        }
      >
        <Progress
          value={pct}
          tone={tone(pct)}
          className="mt-3"
          aria-label={`${pct}% of today's sending capacity used`}
        />
      </LimitCard>
      <LimitCard
        label="Connected mailboxes"
        value={usage ? formatNumber(mailboxes.length) : null}
        note="Unlimited on the free preview."
      />
      {LIMITS.map((l) => (
        <LimitCard key={l.label} label={l.label} value={l.value} unit={l.unit} note={l.note} />
      ))}
    </div>
  );
}

/** One figure: what it counts, the number, and the rule behind it. `null` is still loading. */
function LimitCard({
  label,
  value,
  unit,
  note,
  children,
}: {
  label: string;
  value: string | null;
  unit?: string | undefined;
  note: string;
  children?: ReactNode;
}) {
  return (
    <Card className="flex flex-col p-5">
      <p className="text-sm font-medium text-fg">{label}</p>
      {value === null ? (
        <Skeleton className="mt-3 h-8 w-20" />
      ) : (
        <p className="mt-3 flex items-baseline gap-1.5">
          <span className="tabular text-2xl font-semibold leading-8 text-fg">{value}</span>
          {unit ? <span className="text-sm text-fg-muted">{unit}</span> : null}
        </p>
      )}
      {children}
      <p className="mt-auto pt-3 text-xs leading-5 text-fg-muted">{note}</p>
    </Card>
  );
}
