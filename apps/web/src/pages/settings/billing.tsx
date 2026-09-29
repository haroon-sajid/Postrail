import {
  DEFAULT_MAILBOX_DAILY_LIMIT,
  INVITE_TTL_DAYS,
  MAX_BATCH_SIZE,
  MAX_BODY_CHARS,
  MAX_WEBHOOK_ATTEMPTS,
} from '@postrail/shared';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const LIMITS: { label: string; value: string; note: string }[] = [
  {
    label: 'Sends per mailbox per day',
    value: DEFAULT_MAILBOX_DAILY_LIMIT.toLocaleString(),
    note: 'Adjustable per mailbox. Gmail itself caps free accounts around 500.',
  },
  {
    label: 'API requests',
    value: '120 burst, 2 per second',
    note: 'Per API key. Over the limit returns RATE_LIMITED with Retry-After.',
  },
  {
    label: 'Messages per batch call',
    value: MAX_BATCH_SIZE.toLocaleString(),
    note: 'POST /v1/emails/batch',
  },
  {
    label: 'Body size',
    value: `${(MAX_BODY_CHARS / 1000).toLocaleString()}k characters`,
    note: 'HTML and text combined.',
  },
  {
    label: 'Webhook delivery attempts',
    value: String(MAX_WEBHOOK_ATTEMPTS),
    note: 'With exponential backoff before a delivery is marked failed.',
  },
  {
    label: 'Invite link validity',
    value: `${INVITE_TTL_DAYS} days`,
    note: 'Members, mailboxes, keys, templates and webhooks are otherwise unlimited.',
  },
];

export function BillingSettingsPage() {
  return (
    <>
      <PageHeader title="Billing" description="What this organisation can use." />
      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                Free plan <Badge tone="success">Current</Badge>
              </CardTitle>
              <CardDescription>
                Postrail is free while in preview. Paid plans and invoices are not available yet.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <dl className="divide-y divide-border">
              {LIMITS.map((l) => (
                <div
                  key={l.label}
                  className="grid gap-1 px-4 py-3 sm:grid-cols-[1fr_auto] sm:gap-4"
                >
                  <div className="min-w-0">
                    <dt className="text-sm font-medium text-fg">{l.label}</dt>
                    <dd className="text-xs text-fg-muted">{l.note}</dd>
                  </div>
                  <dd className="tabular text-sm text-fg sm:text-right">{l.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
