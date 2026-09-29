import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';
import { meKey } from '@/api/me';
import type { BodyOf } from '@/api/types';

export const membersKey = (orgId: string) => ['org', orgId, 'members'] as const;
export const invitesKey = (orgId: string) => ['org', orgId, 'invites'] as const;

export type MemberRole = BodyOf<'/app/orgs/{orgId}/members/{userId}', 'patch'>['role'];
export type CreateInviteBody = BodyOf<'/app/orgs/{orgId}/invites', 'post'>;

export function useUpdateOrg(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api.PATCH('/app/orgs/{orgId}', { params: { path: { orgId } }, body: { name } }).then(unwrap),
    onSuccess: () => client.invalidateQueries({ queryKey: meKey }),
  });
}

export function useDeleteOrg(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (confirmName: string) =>
      api
        .POST('/app/orgs/{orgId}/delete', {
          params: { path: { orgId } },
          body: { confirm_name: confirmName },
        })
        .then(unwrap),
    onSuccess: () => client.invalidateQueries({ queryKey: meKey }),
  });
}

export function useMembers(orgId: string) {
  return useQuery({
    queryKey: membersKey(orgId),
    queryFn: () =>
      api
        .GET('/app/orgs/{orgId}/members', { params: { path: { orgId } } })
        .then(unwrap)
        .then((r) => r.data),
  });
}

export function useUpdateMemberRole(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: MemberRole }) =>
      api
        .PATCH('/app/orgs/{orgId}/members/{userId}', {
          params: { path: { orgId, userId } },
          body: { role },
        })
        .then(unwrap),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: membersKey(orgId) }),
        client.invalidateQueries({ queryKey: meKey }),
      ]),
  });
}

export function useRemoveMember(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api
        .DELETE('/app/orgs/{orgId}/members/{userId}', { params: { path: { orgId, userId } } })
        .then(unwrap),
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: membersKey(orgId) }),
        client.invalidateQueries({ queryKey: meKey }),
      ]),
  });
}

export function useInvites(orgId: string) {
  return useQuery({
    queryKey: invitesKey(orgId),
    queryFn: () =>
      api
        .GET('/app/orgs/{orgId}/invites', { params: { path: { orgId } } })
        .then(unwrap)
        .then((r) => r.data),
  });
}

export function useCreateInvite(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateInviteBody) =>
      api.POST('/app/orgs/{orgId}/invites', { params: { path: { orgId } }, body }).then(unwrap),
    onSuccess: () => client.invalidateQueries({ queryKey: invitesKey(orgId) }),
  });
}

export function useRevokeInvite(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api
        .DELETE('/app/orgs/{orgId}/invites/{id}', { params: { path: { orgId, id } } })
        .then(unwrap),
    onSettled: () => client.invalidateQueries({ queryKey: invitesKey(orgId) }),
  });
}
