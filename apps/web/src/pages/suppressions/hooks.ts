import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';
import type { BodyOf } from '@/api/types';

export const suppressionsKey = (orgId: string) => ['org', orgId, 'suppressions'] as const;

export type CreateSuppressionBody = BodyOf<'/app/orgs/{orgId}/suppressions', 'post'>;
export type ImportSuppressionsBody = BodyOf<'/app/orgs/{orgId}/suppressions/import', 'post'>;

export function useSuppressions(orgId: string) {
  return useQuery({
    queryKey: suppressionsKey(orgId),
    queryFn: () =>
      api
        .GET('/app/orgs/{orgId}/suppressions', { params: { path: { orgId } } })
        .then(unwrap)
        .then((r) => r.data),
  });
}

export function useAddSuppression(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSuppressionBody) =>
      api
        .POST('/app/orgs/{orgId}/suppressions', { params: { path: { orgId } }, body })
        .then(unwrap),
    onSuccess: () => client.invalidateQueries({ queryKey: suppressionsKey(orgId) }),
  });
}

export function useImportSuppressions(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ImportSuppressionsBody) =>
      api
        .POST('/app/orgs/{orgId}/suppressions/import', { params: { path: { orgId } }, body })
        .then(unwrap),
    onSuccess: () => client.invalidateQueries({ queryKey: suppressionsKey(orgId) }),
  });
}

export function useRemoveSuppression(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (email: string) =>
      api
        .DELETE('/app/orgs/{orgId}/suppressions/{email}', { params: { path: { orgId, email } } })
        .then(unwrap),
    onSettled: () => client.invalidateQueries({ queryKey: suppressionsKey(orgId) }),
  });
}

/** Splits pasted text on newlines, commas, semicolons and whitespace; dedupes, lowercases. */
export function parseEmailList(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.split(/[\s,;]+/)) {
    const email = raw.trim().toLowerCase();
    if (email) seen.add(email);
  }
  return [...seen];
}
