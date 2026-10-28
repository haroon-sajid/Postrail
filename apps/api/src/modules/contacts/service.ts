import { type AuthContext } from '../../lib/context';
import { AppError } from '../../lib/errors';
import { decodeCursor, encodeCursor } from '../emails/service';
import { normalize } from '../suppressions/service';
import {
  type ContactInput,
  type ContactListView,
  type ContactStore,
  type ContactView,
} from './repo';
import {
  type Contact,
  type ContactList,
  type ContactsQuery,
  type CreateContactRequest,
  type ImportContactsRequest,
  type ImportContactsResponse,
  type UpdateContactRequest,
} from './schemas';

export interface ContactService {
  /** Adds a contact, or updates the one that already has this address. */
  upsert: (
    auth: AuthContext,
    input: CreateContactRequest,
  ) => Promise<{ contact: Contact; created: boolean }>;
  list: (
    auth: AuthContext,
    query: ContactsQuery,
  ) => Promise<{ data: Contact[]; nextCursor: string | null }>;
  get: (auth: AuthContext, id: string) => Promise<Contact>;
  update: (auth: AuthContext, id: string, patch: UpdateContactRequest) => Promise<Contact>;
  remove: (auth: AuthContext, id: string) => Promise<void>;
  importMany: (auth: AuthContext, input: ImportContactsRequest) => Promise<ImportContactsResponse>;

  listLists: (auth: AuthContext) => Promise<ContactList[]>;
  createList: (auth: AuthContext, name: string) => Promise<ContactList>;
  renameList: (auth: AuthContext, id: string, name: string) => Promise<ContactList>;
  removeList: (auth: AuthContext, id: string) => Promise<void>;
  /** Returns how many of the contacts were not on the list before. */
  addToList: (auth: AuthContext, listId: string, contactIds: string[]) => Promise<number>;
  removeFromList: (auth: AuthContext, listId: string, contactId: string) => Promise<void>;
}

export function createContactService(store: ContactStore): ContactService {
  /** A list id from the request is only usable once it is known to be this org's. */
  async function assertLists(orgId: string, listIds: string[]): Promise<void> {
    if (listIds.length === 0) return;
    const known = new Set((await store.listLists(orgId)).map((l) => l.id));
    const unknown = listIds.find((id) => !known.has(id));
    if (unknown) throw AppError.validation(`list ${unknown} does not exist`);
  }

  async function listOr404(orgId: string, id: string): Promise<ContactListView> {
    const list = await store.getList(orgId, id);
    if (!list) throw AppError.notFound('list');
    return list;
  }

  return {
    async upsert(auth, input) {
      const listIds = input.list_ids ?? [];
      await assertLists(auth.orgId, listIds);
      const { contact, created } = await store.upsert(
        auth.orgId,
        { email: normalize(input.email), properties: input.properties ?? {} },
        listIds,
      );
      return { contact: toContact(contact), created };
    },

    async list(auth, query) {
      const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
      const rows = await store.list(auth.orgId, query.limit + 1, cursor, {
        ...(query.q ? { q: query.q } : {}),
        ...(query.list_id ? { listId: query.list_id } : {}),
      });
      const page = rows.slice(0, query.limit);
      const last = page.at(-1);
      const nextCursor = rows.length > query.limit && last ? encodeCursor(last) : null;
      return { data: page.map(toContact), nextCursor };
    },

    async get(auth, id) {
      const row = await store.get(auth.orgId, id);
      if (!row) throw AppError.notFound('contact');
      return toContact(row);
    },

    async update(auth, id, patch) {
      if (patch.list_ids) await assertLists(auth.orgId, patch.list_ids);
      const row = await store.update(auth.orgId, id, {
        ...(patch.properties ? { properties: patch.properties } : {}),
        ...(patch.list_ids ? { listIds: patch.list_ids } : {}),
      });
      if (!row) throw AppError.notFound('contact');
      return toContact(row);
    },

    async remove(auth, id) {
      if (!(await store.remove(auth.orgId, id))) throw AppError.notFound('contact');
    },

    async importMany(auth, input) {
      if (input.list_id) await listOr404(auth.orgId, input.list_id);
      // One statement upserts them all, and it cannot touch the same address twice, so a
      // file that repeats an address keeps the last row and merges the properties.
      const byEmail = new Map<string, ContactInput>();
      for (const row of input.contacts) {
        const email = normalize(row.email);
        const earlier = byEmail.get(email)?.properties ?? {};
        byEmail.set(email, { email, properties: { ...earlier, ...row.properties } });
      }
      return store.importMany(auth.orgId, [...byEmail.values()], input.list_id);
    },

    async listLists(auth) {
      return (await store.listLists(auth.orgId)).map(toList);
    },

    async createList(auth, name) {
      return toList(await store.createList(auth.orgId, name));
    },

    async renameList(auth, id, name) {
      const list = await store.renameList(auth.orgId, id, name);
      if (!list) throw AppError.notFound('list');
      return toList(list);
    },

    async removeList(auth, id) {
      if (!(await store.removeList(auth.orgId, id))) throw AppError.notFound('list');
    },

    async addToList(auth, listId, contactIds) {
      await listOr404(auth.orgId, listId);
      return store.addToList(auth.orgId, listId, [...new Set(contactIds)]);
    },

    async removeFromList(auth, listId, contactId) {
      if (!(await store.removeFromList(auth.orgId, listId, contactId))) {
        throw AppError.notFound('list member');
      }
    },
  };
}

/** Internal camelCase row to the snake_case wire shape. */
function toContact(row: ContactView): Contact {
  return {
    id: row.id,
    email: row.email,
    properties: row.properties,
    list_ids: row.listIds,
    suppressed: row.suppressed,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function toList(row: ContactListView): ContactList {
  return {
    id: row.id,
    name: row.name,
    contact_count: row.contactCount,
    created_at: row.createdAt.toISOString(),
  };
}
