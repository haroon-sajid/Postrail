import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';

export const overviewKey = (orgId: string) => ['org', orgId, 'overview'] as const;

export function useOverview(orgId: string) {
  return useQuery({
    queryKey: overviewKey(orgId),
    queryFn: () =>
      api.GET('/app/orgs/{orgId}/overview', { params: { path: { orgId } } }).then(unwrap),
    refetchInterval: 60_000,
  });
}

/** Three flags behind the getting-started card, derived from what the org already has. */
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
