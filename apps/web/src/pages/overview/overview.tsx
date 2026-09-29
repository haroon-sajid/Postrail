import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';
import { useOrg } from '@/app/org-context';
import { PageHeader } from '@/components/page-header';
import { CardSkeleton, ErrorState } from '@/components/states';
import { Card } from '@/components/ui/card';
import { OnboardingCard } from './onboarding';

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
      </div>
    </>
  );
}
