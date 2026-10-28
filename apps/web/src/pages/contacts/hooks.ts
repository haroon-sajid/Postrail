import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/api/client';
import type { BodyOf } from '@/api/types';

export const contactsKey = (orgId: string) => ['org', orgId, 'contacts'] as const;
export const contactListsKey = (orgId: string) => ['org', orgId, 'contact-lists'] as const;

export type UpsertContactBody = BodyOf<'/app/orgs/{orgId}/contacts', 'post'>;
export type UpdateContactBody = BodyOf<'/app/orgs/{orgId}/contacts/{id}', 'patch'>;
export type ImportContactsBody = BodyOf<'/app/orgs/{orgId}/contacts/import', 'post'>;

export interface ContactFilters {
  /** Substring of the email. Empty for everyone. */
  q: string;
  /** Only this list. Empty for all. */
  listId: string;
  /** Opaque keyset cursor. Empty for the first page. */
  cursor: string;
}

export function useContacts(orgId: string, filters: ContactFilters) {
  const query = {
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.listId ? { list_id: filters.listId } : {}),
    ...(filters.cursor ? { cursor: filters.cursor } : {}),
  };
  return useQuery({
    queryKey: [...contactsKey(orgId), 'list', query],
    queryFn: () =>
      api.GET('/app/orgs/{orgId}/contacts', { params: { path: { orgId }, query } }).then(unwrap),
    // Keep the previous page on screen while the next one loads: no layout shift.
    placeholderData: keepPreviousData,
  });
}

export function useContactLists(orgId: string) {
  return useQuery({
    queryKey: contactListsKey(orgId),
    queryFn: () =>
      api
        .GET('/app/orgs/{orgId}/contact-lists', { params: { path: { orgId } } })
        .then(unwrap)
        .then((r) => r.data),
  });
}

/** A change to contacts moves list sizes, and a change to lists moves memberships. */
function useRefreshBoth(orgId: string) {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: contactsKey(orgId) });
    void client.invalidateQueries({ queryKey: contactListsKey(orgId) });
  };
}

export function useUpsertContact(orgId: string) {
  const refresh = useRefreshBoth(orgId);
  return useMutation({
    mutationFn: (body: UpsertContactBody) =>
      api.POST('/app/orgs/{orgId}/contacts', { params: { path: { orgId } }, body }).then(unwrap),
    onSuccess: refresh,
  });
}

export function useUpdateContact(orgId: string) {
  const refresh = useRefreshBoth(orgId);
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateContactBody }) =>
      api
        .PATCH('/app/orgs/{orgId}/contacts/{id}', { params: { path: { orgId, id } }, body })
        .then(unwrap),
    onSuccess: refresh,
  });
}

export function useDeleteContact(orgId: string) {
  const refresh = useRefreshBoth(orgId);
  return useMutation({
    mutationFn: (id: string) =>
      api
        .DELETE('/app/orgs/{orgId}/contacts/{id}', { params: { path: { orgId, id } } })
        .then(unwrap),
    onSettled: refresh,
  });
}

export function useImportContacts(orgId: string) {
  const refresh = useRefreshBoth(orgId);
  return useMutation({
    mutationFn: (body: ImportContactsBody) =>
      api
        .POST('/app/orgs/{orgId}/contacts/import', { params: { path: { orgId } }, body })
        .then(unwrap),
    onSettled: refresh,
  });
}

export function useCreateContactList(orgId: string) {
  const refresh = useRefreshBoth(orgId);
  return useMutation({
    mutationFn: (name: string) =>
      api
        .POST('/app/orgs/{orgId}/contact-lists', { params: { path: { orgId } }, body: { name } })
        .then(unwrap),
    onSuccess: refresh,
  });
}

export function useRenameContactList(orgId: string) {
  const refresh = useRefreshBoth(orgId);
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api
        .PATCH('/app/orgs/{orgId}/contact-lists/{id}', {
          params: { path: { orgId, id } },
          body: { name },
        })
        .then(unwrap),
    onSuccess: refresh,
  });
}

export function useDeleteContactList(orgId: string) {
  const refresh = useRefreshBoth(orgId);
  return useMutation({
    mutationFn: (id: string) =>
      api
        .DELETE('/app/orgs/{orgId}/contact-lists/{id}', { params: { path: { orgId, id } } })
        .then(unwrap),
    onSettled: refresh,
  });
}
