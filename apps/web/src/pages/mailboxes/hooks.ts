import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';
import type { BodyOf } from '@/api/types';

export const mailboxesKey = (orgId: string) => ['org', orgId, 'mailboxes'] as const;

export function useMailboxes(orgId: string) {
  return useQuery({
    queryKey: mailboxesKey(orgId),
    queryFn: () =>
      api
        .GET('/app/orgs/{orgId}/mailboxes', { params: { path: { orgId } } })
        .then(unwrap)
        .then((r) => r.data),
  });
}

export function useConnectUrl(orgId: string) {
  return useMutation({
    mutationFn: () =>
      api
        .GET('/app/orgs/{orgId}/mailboxes/google/connect-url', { params: { path: { orgId } } })
        .then(unwrap)
        .then((r) => r.url),
  });
}

type MailboxPatch = BodyOf<'/app/orgs/{orgId}/mailboxes/{id}', 'patch'>;

export function useUpdateMailbox(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: MailboxPatch }) =>
      api
        .PATCH('/app/orgs/{orgId}/mailboxes/{id}', { params: { path: { orgId, id } }, body: patch })
        .then(unwrap),
    onSettled: () => client.invalidateQueries({ queryKey: mailboxesKey(orgId) }),
  });
}

export function useRemoveMailbox(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api
        .DELETE('/app/orgs/{orgId}/mailboxes/{id}', { params: { path: { orgId, id } } })
        .then(unwrap),
    onSettled: () => client.invalidateQueries({ queryKey: mailboxesKey(orgId) }),
  });
}
