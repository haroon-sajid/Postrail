import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';
import type { BodyOf, Broadcast } from '@/api/types';

export const broadcastsKey = (orgId: string) => ['org', orgId, 'broadcasts'] as const;

export type CreateBroadcastBody = BodyOf<'/app/orgs/{orgId}/broadcasts', 'post'>;

/** A broadcast that is sending changes on its own, so the page keeps looking. */
const POLL_MS = 10_000;

export function useBroadcasts(orgId: string) {
  return useQuery({
    queryKey: broadcastsKey(orgId),
    queryFn: () =>
      api
        .GET('/app/orgs/{orgId}/broadcasts', { params: { path: { orgId } } })
        .then(unwrap)
        .then((r) => r.data),
    refetchInterval: (query) =>
      query.state.data?.some((b) => b.status === 'sending') ? POLL_MS : false,
  });
}

export function useBroadcast(orgId: string, id: string) {
  return useQuery({
    queryKey: [...broadcastsKey(orgId), id],
    queryFn: () =>
      api
        .GET('/app/orgs/{orgId}/broadcasts/{id}', { params: { path: { orgId, id } } })
        .then(unwrap),
    refetchInterval: (query) => (query.state.data?.status === 'sending' ? POLL_MS : false),
  });
}

export function useBroadcastRecipients(orgId: string, broadcast: Broadcast, cursor: string) {
  const query = cursor ? { cursor } : {};
  return useQuery({
    // The stats are in the key so the table refreshes whenever the counts move.
    queryKey: [...broadcastsKey(orgId), broadcast.id, 'recipients', query, broadcast.stats],
    queryFn: () =>
      api
        .GET('/app/orgs/{orgId}/broadcasts/{id}/recipients', {
          params: { path: { orgId, id: broadcast.id }, query },
        })
        .then(unwrap),
    enabled: broadcast.status !== 'draft',
    placeholderData: keepPreviousData,
  });
}

export function useCreateBroadcast(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateBroadcastBody) =>
      api.POST('/app/orgs/{orgId}/broadcasts', { params: { path: { orgId } }, body }).then(unwrap),
    onSuccess: () => client.invalidateQueries({ queryKey: broadcastsKey(orgId) }),
  });
}

export function useSendBroadcast(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api
        .POST('/app/orgs/{orgId}/broadcasts/{id}/send', { params: { path: { orgId, id } } })
        .then(unwrap),
    onSettled: () => client.invalidateQueries({ queryKey: broadcastsKey(orgId) }),
  });
}

export function useCancelBroadcast(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api
        .POST('/app/orgs/{orgId}/broadcasts/{id}/cancel', { params: { path: { orgId, id } } })
        .then(unwrap),
    onSettled: () => client.invalidateQueries({ queryKey: broadcastsKey(orgId) }),
  });
}

export function useDeleteBroadcast(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api
        .DELETE('/app/orgs/{orgId}/broadcasts/{id}', { params: { path: { orgId, id } } })
        .then(unwrap),
    onSuccess: () => client.invalidateQueries({ queryKey: broadcastsKey(orgId), exact: true }),
  });
}

/** How far along a broadcast is, 0 to 100: everyone who is no longer waiting or in flight. */
export function progressOf(stats: Broadcast['stats']): number {
  if (stats.total === 0) return 0;
  return Math.round(((stats.sent + stats.failed + stats.skipped) / stats.total) * 100);
}
