import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';

export const apiKeysKey = (orgId: string) => ['org', orgId, 'api-keys'] as const;

export function useApiKeys(orgId: string) {
  return useQuery({
    queryKey: apiKeysKey(orgId),
    queryFn: () =>
      api
        .GET('/app/orgs/{orgId}/api-keys', { params: { path: { orgId } } })
        .then(unwrap)
        .then((r) => r.data),
  });
}

export function useCreateApiKey(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api
        .POST('/app/orgs/{orgId}/api-keys', { params: { path: { orgId } }, body: { name } })
        .then(unwrap),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: apiKeysKey(orgId) });
      void client.invalidateQueries({ queryKey: ['org', orgId, 'onboarding'] });
    },
  });
}

export function useRevokeApiKey(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api
        .DELETE('/app/orgs/{orgId}/api-keys/{id}', { params: { path: { orgId, id } } })
        .then(unwrap),
    onSettled: () => client.invalidateQueries({ queryKey: apiKeysKey(orgId) }),
  });
}
