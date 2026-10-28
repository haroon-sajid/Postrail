import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';
import type { BodyOf } from '@/api/types';

export const authUsersKey = (orgId: string) => ['org', orgId, 'auth-users'] as const;

export interface UserFilters {
  /** Substring of the email or name. Empty for everyone. */
  q: string;
  /** Opaque keyset cursor. Empty for the first page. */
  cursor: string;
}

export function useAuthUsers(orgId: string, filters: UserFilters) {
  const query = {
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.cursor ? { cursor: filters.cursor } : {}),
  };
  return useQuery({
    queryKey: [...authUsersKey(orgId), 'list', query],
    queryFn: () =>
      api.GET('/app/orgs/{orgId}/auth/users', { params: { path: { orgId }, query } }).then(unwrap),
    // Keep the previous page on screen while the next one loads: no layout shift.
    placeholderData: keepPreviousData,
  });
}

export type CreateAuthUserBody = BodyOf<'/app/orgs/{orgId}/auth/users', 'post'>;

export function useCreateAuthUser(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAuthUserBody) =>
      api.POST('/app/orgs/{orgId}/auth/users', { params: { path: { orgId } }, body }).then(unwrap),
    onSuccess: () => client.invalidateQueries({ queryKey: authUsersKey(orgId) }),
  });
}

export function useRevokeUserSessions(orgId: string) {
  return useMutation({
    mutationFn: (id: string) =>
      api
        .POST('/app/orgs/{orgId}/auth/users/{id}/revoke-sessions', {
          params: { path: { orgId, id } },
        })
        .then(unwrap),
  });
}

export function useDeleteAuthUser(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api
        .DELETE('/app/orgs/{orgId}/auth/users/{id}', { params: { path: { orgId, id } } })
        .then(unwrap),
    onSettled: () => client.invalidateQueries({ queryKey: authUsersKey(orgId) }),
  });
}
