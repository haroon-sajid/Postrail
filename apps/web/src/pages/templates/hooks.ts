import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';
import type { BodyOf } from '@/api/types';

export const templatesKey = (orgId: string) => ['org', orgId, 'templates'] as const;

export function useTemplates(orgId: string) {
  return useQuery({
    queryKey: templatesKey(orgId),
    queryFn: () =>
      api
        .GET('/app/orgs/{orgId}/templates', { params: { path: { orgId } } })
        .then(unwrap)
        .then((r) => r.data),
  });
}

export function useTemplate(orgId: string, id: string | undefined) {
  return useQuery({
    queryKey: [...templatesKey(orgId), id],
    queryFn: () =>
      api
        .GET('/app/orgs/{orgId}/templates/{id}', { params: { path: { orgId, id: id ?? '' } } })
        .then(unwrap),
    enabled: !!id,
  });
}

type CreateBody = BodyOf<'/app/orgs/{orgId}/templates', 'post'>;
type UpdateBody = BodyOf<'/app/orgs/{orgId}/templates/{id}', 'patch'>;
type TestBody = BodyOf<'/app/orgs/{orgId}/templates/{id}/test', 'post'>;

export function useCreateTemplate(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateBody) =>
      api.POST('/app/orgs/{orgId}/templates', { params: { path: { orgId } }, body }).then(unwrap),
    onSuccess: () => client.invalidateQueries({ queryKey: templatesKey(orgId) }),
  });
}

export function useUpdateTemplate(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateBody }) =>
      api
        .PATCH('/app/orgs/{orgId}/templates/{id}', { params: { path: { orgId, id } }, body })
        .then(unwrap),
    onSuccess: () => client.invalidateQueries({ queryKey: templatesKey(orgId) }),
  });
}

export function useDeleteTemplate(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api
        .DELETE('/app/orgs/{orgId}/templates/{id}', { params: { path: { orgId, id } } })
        .then(unwrap),
    onSettled: () => client.invalidateQueries({ queryKey: templatesKey(orgId) }),
  });
}

export function useSendTestTemplate(orgId: string) {
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: TestBody }) =>
      api
        .POST('/app/orgs/{orgId}/templates/{id}/test', { params: { path: { orgId, id } }, body })
        .then(unwrap),
  });
}
