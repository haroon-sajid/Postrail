import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';
import type { BodyOf } from '@/api/types';

export const webhooksKey = (orgId: string) => ['org', orgId, 'webhooks'] as const;
export const deliveriesKey = (orgId: string, id: string) =>
  [...webhooksKey(orgId), id, 'deliveries'] as const;

export type CreateWebhookBody = BodyOf<'/app/orgs/{orgId}/webhooks', 'post'>;
export type UpdateWebhookBody = BodyOf<'/app/orgs/{orgId}/webhooks/{id}', 'patch'>;

export function useWebhooks(orgId: string) {
  return useQuery({
    queryKey: webhooksKey(orgId),
    queryFn: () =>
      api
        .GET('/app/orgs/{orgId}/webhooks', { params: { path: { orgId } } })
        .then(unwrap)
        .then((r) => r.data),
  });
}

export function useWebhook(orgId: string, id: string) {
  return useQuery({
    queryKey: [...webhooksKey(orgId), id],
    queryFn: () =>
      api.GET('/app/orgs/{orgId}/webhooks/{id}', { params: { path: { orgId, id } } }).then(unwrap),
  });
}

export function useDeliveries(orgId: string, id: string, limit = 50) {
  return useQuery({
    queryKey: [...deliveriesKey(orgId, id), limit],
    queryFn: () =>
      api
        .GET('/app/orgs/{orgId}/webhooks/{id}/deliveries', {
          params: { path: { orgId, id }, query: { limit } },
        })
        .then(unwrap)
        .then((r) => r.data),
    refetchInterval: 15_000,
  });
}

export function useCreateWebhook(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateWebhookBody) =>
      api.POST('/app/orgs/{orgId}/webhooks', { params: { path: { orgId } }, body }).then(unwrap),
    onSuccess: () => client.invalidateQueries({ queryKey: webhooksKey(orgId) }),
  });
}

export function useUpdateWebhook(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateWebhookBody }) =>
      api
        .PATCH('/app/orgs/{orgId}/webhooks/{id}', { params: { path: { orgId, id } }, body })
        .then(unwrap),
    onSuccess: () => client.invalidateQueries({ queryKey: webhooksKey(orgId) }),
  });
}

export function useDeleteWebhook(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api
        .DELETE('/app/orgs/{orgId}/webhooks/{id}', { params: { path: { orgId, id } } })
        .then(unwrap),
    onSettled: () => client.invalidateQueries({ queryKey: webhooksKey(orgId) }),
  });
}

export function useRetryDelivery(orgId: string, id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (deliveryId: string) =>
      api
        .POST('/app/orgs/{orgId}/webhooks/{id}/deliveries/{deliveryId}/retry', {
          params: { path: { orgId, id, deliveryId } },
        })
        .then(unwrap),
    onSettled: () => client.invalidateQueries({ queryKey: deliveriesKey(orgId, id) }),
  });
}

export function useTestWebhook(orgId: string, id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api
        .POST('/app/orgs/{orgId}/webhooks/{id}/test', { params: { path: { orgId, id } } })
        .then(unwrap),
    onSettled: () => client.invalidateQueries({ queryKey: deliveriesKey(orgId, id) }),
  });
}

export function useRotateSecret(orgId: string, id: string) {
  return useMutation({
    mutationFn: () =>
      api
        .POST('/app/orgs/{orgId}/webhooks/{id}/rotate-secret', { params: { path: { orgId, id } } })
        .then(unwrap),
  });
}
