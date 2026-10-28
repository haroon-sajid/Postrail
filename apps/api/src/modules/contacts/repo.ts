import {
  contactListMembers,
  contactLists,
  contacts,
  type Db,
  type OrgDb,
  suppressions,
  withOrg,
} from '@postrail/db';
import {
  and,
  count,
  desc,
  eq,
  getTableColumns,
  ilike,
  inArray,
  lt,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';
import { isUniqueViolation } from '../../lib/db-errors';
import { AppError } from '../../lib/errors';
import { escapeLike, type ListCursor } from '../emails/repo';

export type ContactRow = typeof contacts.$inferSelect;
export type ContactListRow = typeof contactLists.$inferSelect;

/** A contact plus what the dashboard and API show beside it. */
export interface ContactView extends ContactRow {
  listIds: string[];
  /** On the org's suppression list, so nothing is sent to it. */
  suppressed: boolean;
}

export interface ContactListView extends ContactListRow {
  contactCount: number;
}

export interface ContactInput {
  /** Already lowercased by the service. */
  email: string;
  properties: Record<string, string>;
}

export interface ContactFilters {
  q?: string;
  listId?: string;
}

export interface ContactPatch {
  properties?: Record<string, string>;
  listIds?: string[];
}

/** Everything the service needs from the database, so it can be tested with a fake. */
export interface ContactStore {
  /** Inserts, or merges properties into the contact that already has this address. */
  upsert: (
    orgId: string,
    input: ContactInput,
    listIds: string[],
  ) => Promise<{ contact: ContactView; created: boolean }>;
  get: (orgId: string, id: string) => Promise<ContactView | undefined>;
  /** Newest first. Returns up to `limit` rows strictly after `cursor`. */
  list: (
    orgId: string,
    limit: number,
    cursor?: ListCursor,
    filters?: ContactFilters,
  ) => Promise<ContactView[]>;
  /** `properties` and `listIds` each replace what is stored when given. */
  update: (orgId: string, id: string, patch: ContactPatch) => Promise<ContactView | undefined>;
  remove: (orgId: string, id: string) => Promise<boolean>;
  /** Upserts in one statement. `rows` must not repeat an address. */
  importMany: (
    orgId: string,
    rows: ContactInput[],
    listId?: string,
  ) => Promise<{ created: number; updated: number }>;

  listLists: (orgId: string) => Promise<ContactListView[]>;
  getList: (orgId: string, id: string) => Promise<ContactListView | undefined>;
  /** Throws CONFLICT when the name is taken in this org. */
  createList: (orgId: string, name: string) => Promise<ContactListView>;
  /** Throws CONFLICT when the name is taken. Undefined when the list does not exist. */
  renameList: (orgId: string, id: string, name: string) => Promise<ContactListView | undefined>;
  /** Removes the list and its memberships. The contacts themselves stay. */
  removeList: (orgId: string, id: string) => Promise<boolean>;
  /** Returns how many were not on the list before. Ids from another org are ignored. */
  addToList: (orgId: string, listId: string, contactIds: string[]) => Promise<number>;
  removeFromList: (orgId: string, listId: string, contactId: string) => Promise<boolean>;
}

/** List memberships and suppression state for a page of contacts, in two queries. */
async function decorate(tx: OrgDb, orgId: string, rows: ContactRow[]): Promise<ContactView[]> {
  if (rows.length === 0) return [];
  const memberships = await tx
    .select({ contactId: contactListMembers.contactId, listId: contactListMembers.listId })
    .from(contactListMembers)
    .where(
      and(
        eq(contactListMembers.orgId, orgId),
        inArray(
          contactListMembers.contactId,
          rows.map((r) => r.id),
        ),
      ),
    );
  const suppressed = await tx
    .select({ email: suppressions.email })
    .from(suppressions)
    .where(
      and(
        eq(suppressions.orgId, orgId),
        inArray(
          suppressions.email,
          rows.map((r) => r.email),
        ),
      ),
    );
  const blocked = new Set(suppressed.map((s) => s.email));
  return rows.map((row) => ({
    ...row,
    listIds: memberships.filter((m) => m.contactId === row.id).map((m) => m.listId),
    suppressed: blocked.has(row.email),
  }));
}

/**
 * Puts contacts on lists. Both sides are re-read inside the org's transaction first: the
 * foreign keys alone would accept an id that belongs to another tenant.
 */
async function addMemberships(
  tx: OrgDb,
  orgId: string,
  contactIds: string[],
  listIds: string[],
): Promise<number> {
  if (contactIds.length === 0 || listIds.length === 0) return 0;
  const ownContacts = await tx
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), inArray(contacts.id, contactIds)));
  const ownLists = await tx
    .select({ id: contactLists.id })
    .from(contactLists)
    .where(and(eq(contactLists.orgId, orgId), inArray(contactLists.id, listIds)));
  const values = ownLists.flatMap((list) =>
    ownContacts.map((contact) => ({ orgId, listId: list.id, contactId: contact.id })),
  );
  if (values.length === 0) return 0;
  const added = await tx
    .insert(contactListMembers)
    .values(values)
    .onConflictDoNothing()
    .returning({ contactId: contactListMembers.contactId });
  return added.length;
}

const withCount = {
  ...getTableColumns(contactLists),
  contactCount: count(contactListMembers.contactId),
};

/** The org's lists with their sizes, optionally narrowed to one id. */
function listsQuery(tx: OrgDb, orgId: string, id?: string) {
  return tx
    .select(withCount)
    .from(contactLists)
    .leftJoin(
      contactListMembers,
      and(eq(contactListMembers.listId, contactLists.id), eq(contactListMembers.orgId, orgId)),
    )
    .where(and(eq(contactLists.orgId, orgId), id ? eq(contactLists.id, id) : undefined))
    .groupBy(contactLists.id)
    .orderBy(contactLists.name);
}

export function createContactStore(db: Db): ContactStore {
  const contact = (orgId: string, id: string) =>
    and(eq(contacts.orgId, orgId), eq(contacts.id, id));
  const list = (orgId: string, id: string) =>
    and(eq(contactLists.orgId, orgId), eq(contactLists.id, id));

  const getList: ContactStore['getList'] = (orgId, id) =>
    withOrg(db, orgId, async (tx) => {
      const [row] = await listsQuery(tx, orgId, id);
      return row;
    });

  /** Unique-violation on (org, name) becomes the API's CONFLICT. */
  async function nameTaken<T>(name: string, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (isUniqueViolation(error))
        throw AppError.conflict(`a list named "${name}" already exists`);
      throw error;
    }
  }

  return {
    upsert: (orgId, input, listIds) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .insert(contacts)
          .values({ orgId, ...input })
          .onConflictDoUpdate({
            target: [contacts.orgId, contacts.email],
            set: {
              // Merge, so adding one property through the API does not wipe the others.
              properties: sql`${contacts.properties} || ${JSON.stringify(input.properties)}::jsonb`,
              updatedAt: new Date(),
            },
          })
          // xmax is 0 only on a row this statement inserted.
          .returning({ ...getTableColumns(contacts), inserted: sql<boolean>`(xmax = 0)` });
        if (!row) throw new Error('contact upsert returned no row');
        const { inserted, ...saved } = row;
        await addMemberships(tx, orgId, [saved.id], listIds);
        const [view] = await decorate(tx, orgId, [saved]);
        if (!view) throw new Error('contact vanished after upsert');
        return { contact: view, created: inserted };
      }),

    get: (orgId, id) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx.select().from(contacts).where(contact(orgId, id)).limit(1);
        return row ? (await decorate(tx, orgId, [row]))[0] : undefined;
      }),

    list: (orgId, limit, cursor, filters = {}) =>
      withOrg(db, orgId, async (tx) => {
        const rows = await tx
          .select()
          .from(contacts)
          .where(
            and(
              eq(contacts.orgId, orgId),
              // Keyset on (created_at, id) so the org+created index does all the work.
              cursor
                ? or(
                    lt(contacts.createdAt, cursor.createdAt),
                    and(eq(contacts.createdAt, cursor.createdAt), lt(contacts.id, cursor.id)),
                  )
                : undefined,
              filters.q ? ilike(contacts.email, `%${escapeLike(filters.q)}%`) : undefined,
              filters.listId
                ? inArray(
                    contacts.id,
                    tx
                      .select({ id: contactListMembers.contactId })
                      .from(contactListMembers)
                      .where(
                        and(
                          eq(contactListMembers.orgId, orgId),
                          eq(contactListMembers.listId, filters.listId),
                        ),
                      ),
                  )
                : undefined,
            ),
          )
          .orderBy(desc(contacts.createdAt), desc(contacts.id))
          .limit(limit);
        return decorate(tx, orgId, rows);
      }),

    update: (orgId, id, patch) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .update(contacts)
          .set({
            ...(patch.properties ? { properties: patch.properties } : {}),
            updatedAt: new Date(),
          })
          .where(contact(orgId, id))
          .returning();
        if (!row) return undefined;
        if (patch.listIds) {
          await tx
            .delete(contactListMembers)
            .where(
              and(
                eq(contactListMembers.orgId, orgId),
                eq(contactListMembers.contactId, id),
                patch.listIds.length > 0
                  ? notInArray(contactListMembers.listId, patch.listIds)
                  : undefined,
              ),
            );
          await addMemberships(tx, orgId, [id], patch.listIds);
        }
        return (await decorate(tx, orgId, [row]))[0];
      }),

    remove: (orgId, id) =>
      withOrg(db, orgId, async (tx) => {
        const rows = await tx
          .delete(contacts)
          .where(contact(orgId, id))
          .returning({ id: contacts.id });
        return rows.length > 0;
      }),

    importMany: (orgId, rows, listId) =>
      withOrg(db, orgId, async (tx) => {
        const saved = await tx
          .insert(contacts)
          .values(rows.map((row) => ({ orgId, ...row })))
          .onConflictDoUpdate({
            target: [contacts.orgId, contacts.email],
            set: {
              properties: sql`${contacts.properties} || excluded.properties`,
              updatedAt: new Date(),
            },
          })
          .returning({ id: contacts.id, inserted: sql<boolean>`(xmax = 0)` });
        if (listId) {
          await addMemberships(
            tx,
            orgId,
            saved.map((s) => s.id),
            [listId],
          );
        }
        const created = saved.filter((s) => s.inserted).length;
        return { created, updated: saved.length - created };
      }),

    listLists: (orgId) => withOrg(db, orgId, (tx) => listsQuery(tx, orgId)),

    getList,

    createList: (orgId, name) =>
      nameTaken(name, () =>
        withOrg(db, orgId, async (tx) => {
          const [row] = await tx.insert(contactLists).values({ orgId, name }).returning();
          if (!row) throw new Error('contact list insert returned no row');
          return { ...row, contactCount: 0 };
        }),
      ),

    renameList: async (orgId, id, name) => {
      const renamed = await nameTaken(name, () =>
        withOrg(db, orgId, async (tx) => {
          const rows = await tx
            .update(contactLists)
            .set({ name, updatedAt: new Date() })
            .where(list(orgId, id))
            .returning({ id: contactLists.id });
          return rows.length > 0;
        }),
      );
      return renamed ? getList(orgId, id) : undefined;
    },

    removeList: (orgId, id) =>
      withOrg(db, orgId, async (tx) => {
        const rows = await tx
          .delete(contactLists)
          .where(list(orgId, id))
          .returning({ id: contactLists.id });
        return rows.length > 0;
      }),

    addToList: (orgId, listId, contactIds) =>
      withOrg(db, orgId, (tx) => addMemberships(tx, orgId, contactIds, [listId])),

    removeFromList: (orgId, listId, contactId) =>
      withOrg(db, orgId, async (tx) => {
        const rows = await tx
          .delete(contactListMembers)
          .where(
            and(
              eq(contactListMembers.orgId, orgId),
              eq(contactListMembers.listId, listId),
              eq(contactListMembers.contactId, contactId),
            ),
          )
          .returning({ contactId: contactListMembers.contactId });
        return rows.length > 0;
      }),
  };
}
