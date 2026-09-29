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
