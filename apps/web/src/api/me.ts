import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, unwrap } from './client';
import type { Me } from './types';

export type { Me, Org } from './types';

export const meKey = ['me'] as const;

export function fetchMe(): Promise<Me> {
  return api.GET('/app/me').then(unwrap);
}

/** The signed-in user and their orgs. A 401 means "not signed in", not an error. */
export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: async (): Promise<Me | null> => {
      try {
        return await fetchMe();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 60_000,
  });
}

export function useCreateOrg() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.POST('/app/orgs', { body: { name } }).then(unwrap),
    onSuccess: () => client.invalidateQueries({ queryKey: meKey }),
  });
}
