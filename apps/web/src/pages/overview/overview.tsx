import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';
import { useOrg } from '@/app/org-context';
import { PageHeader } from '@/components/page-header';
import { CardSkeleton, ErrorState, TableSkeleton } from '@/components/states';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useOverview } from './hooks';
import { MailboxUsage } from './mailbox-usage';
import { OnboardingCard } from './onboarding';
import { RecentFailures } from './recent-failures';
import { SendsChart, SendsLegend } from './sends-chart';
import { StatCard, StatCardSkeleton } from './stat-card';

export function useOnboardingStatus(orgId: string) {
  return useQuery({
    queryKey: ['org', orgId, 'onboarding'],
    queryFn: async () => {
      const [mailboxes, keys, emails] = await Promise.all([
        api.GET('/app/orgs/{orgId}/mailboxes', { params: { path: { orgId } } }).then(unwrap),
        api.GET('/app/orgs/{orgId}/api-keys', { params: { path: { orgId } } }).then(unwrap),
        api
          .GET('/app/orgs/{orgId}/emails', { params: { path: { orgId }, query: { limit: 1 } } })
          .then(unwrap),
      ]);
      return {
        hasMailbox: mailboxes.data.length > 0,
        hasApiKey: keys.data.some((k) => !k.revoked_at),
        hasSent: emails.data.length > 0,
      };
    },
  });
}

export function OverviewPage() {
  const { org } = useOrg();
  const onboarding = useOnboardingStatus(org.id);
  const overview = useOverview(org.id);
  const allDone =
    onboarding.data &&
    onboarding.data.hasMailbox &&
    onboarding.data.hasApiKey &&
    onboarding.data.hasSent;

  return (
    <>
      <PageHeader
        title="Overview"
        description="What went out, what failed, and how much room is left today."
      />
      <div className="space-y-6">
        {onboarding.isPending ? (
          <Card>
            <CardSkeleton lines={4} />
          </Card>
        ) : onboarding.isError ? (
          <Card>
            <ErrorState error={onboarding.error} onRetry={() => void onboarding.refetch()} />
          </Card>
        ) : !allDone ? (
          <OnboardingCard status={onboarding.data} />
        ) : null}

        <section aria-label="Key numbers" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {overview.isPending ? (
            Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
          ) : overview.isError ? (
            <Card className="sm:col-span-2 lg:col-span-4">
              <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
            </Card>
          ) : (
            <>
              <StatCard
                label="Sent today"
                value={overview.data.stats.sent_today}
                previous={overview.data.stats.sent_yesterday}
                hint="vs yesterday"
              />
              <StatCard
                label="Sent 7 days"
                value={overview.data.stats.sent_7d}
                previous={overview.data.stats.sent_prev_7d}
                hint="vs previous 7 days"
              />
              <StatCard
                label="Failed 7 days"
                value={overview.data.stats.failed_7d}
                previous={overview.data.stats.failed_prev_7d}
                invert
                hint="vs previous 7 days"
              />
              <StatCard
                label="Active mailboxes"
                value={overview.data.stats.active_mailboxes}
                hint={`${overview.data.stats.total_mailboxes} connected`}
              />
            </>
          )}
        </section>

        <Card>
          <CardHeader className="items-center">
            <div>
              <CardTitle>Sends, last 30 days</CardTitle>
              <CardDescription>Sent and failed per day, in UTC.</CardDescription>
            </div>
            <SendsLegend />
          </CardHeader>
          <CardContent>
            {overview.isPending ? (
              <Skeleton className="h-64 w-full" />
            ) : overview.isError ? (
              <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
            ) : (
              <SendsChart series={overview.data.series} />
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>Mailbox usage</CardTitle>
                <CardDescription>Sent today against each daily limit.</CardDescription>
              </div>
            </CardHeader>
            {overview.isPending ? (
              <CardSkeleton lines={4} />
            ) : overview.isError ? (
              <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
            ) : (
              <MailboxUsage usage={overview.data.mailbox_usage} />
            )}
          </Card>
          <Card className="lg:col-span-3">
            <CardHeader>
              <div>
                <CardTitle>Recent failures</CardTitle>
                <CardDescription>Click a row to open it in the logs.</CardDescription>
              </div>
            </CardHeader>
            {overview.isPending ? (
              <TableSkeleton rows={4} cols={4} />
            ) : overview.isError ? (
              <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
            ) : (
              <RecentFailures failures={overview.data.recent_failures} />
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
