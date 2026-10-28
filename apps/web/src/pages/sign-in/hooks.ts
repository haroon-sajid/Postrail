import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';
import type { BodyOf } from '@/api/types';

export const authSettingsKey = (orgId: string) => ['org', orgId, 'auth-settings'] as const;

export type UpdateAuthSettingsBody = BodyOf<'/app/orgs/{orgId}/auth/settings', 'patch'>;

export function useAuthSettings(orgId: string) {
  return useQuery({
    queryKey: authSettingsKey(orgId),
    queryFn: () =>
      api.GET('/app/orgs/{orgId}/auth/settings', { params: { path: { orgId } } }).then(unwrap),
  });
}

export function useUpdateAuthSettings(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateAuthSettingsBody) =>
      api
        .PATCH('/app/orgs/{orgId}/auth/settings', { params: { path: { orgId } }, body })
        .then(unwrap),
    // The response is the whole settings object, so there is nothing to refetch.
    onSuccess: (settings) => client.setQueryData(authSettingsKey(orgId), settings),
  });
}
