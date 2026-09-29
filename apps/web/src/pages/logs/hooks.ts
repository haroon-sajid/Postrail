import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';
import { type LogFilters, toQuery } from './filters';

export const emailsKey = (orgId: string) => ['org', orgId, 'emails'] as const;

export function useEmails(orgId: string, filters: LogFilters) {
  const query = toQuery(filters);
  return useQuery({
    queryKey: [...emailsKey(orgId), 'list', query],
    queryFn: () =>
      api.GET('/app/orgs/{orgId}/emails', { params: { path: { orgId }, query } }).then(unwrap),
    // Keep the previous page on screen while the next one loads: no layout shift.
    placeholderData: keepPreviousData,
  });
}

export function useEmail(orgId: string, id: string | null) {
  return useQuery({
    queryKey: [...emailsKey(orgId), 'detail', id],
    queryFn: () =>
      api
        .GET('/app/orgs/{orgId}/emails/{id}', { params: { path: { orgId, id: id ?? '' } } })
        .then(unwrap),
    enabled: !!id,
  });
}

export function useEmailBody(orgId: string, id: string | null) {
  return useQuery({
    queryKey: [...emailsKey(orgId), 'body', id],
    queryFn: () =>
      api
        .GET('/app/orgs/{orgId}/emails/{id}/body', { params: { path: { orgId, id: id ?? '' } } })
        .then(unwrap),
    enabled: !!id,
    staleTime: Infinity,
  });
}

export function useResend(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api
        .POST('/app/orgs/{orgId}/emails/{id}/resend', { params: { path: { orgId, id } } })
        .then(unwrap),
    onSuccess: () => client.invalidateQueries({ queryKey: emailsKey(orgId) }),
  });
}
