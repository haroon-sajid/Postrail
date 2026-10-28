import {
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { orgScoped, tenantPolicy } from './tenancy';
import { timestamps } from './timestamps';

/** Someone a tenant sends to. Not a login: end users live in `auth_users` (ADR 0012). */
export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgScoped,
    /** Lowercased, so the unique key and suppression lookups are case-insensitive. */
    email: text('email').notNull(),
    /** Values a broadcast can put into a template, e.g. `{ "first_name": "Ada" }`. */
    properties: jsonb('properties').$type<Record<string, string>>().notNull().default({}),
    ...timestamps,
    // Millisecond precision for the same reason as messages: the list cursor is
    // (created_at, id) and passes through a JavaScript Date.
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (t) => [
    index('contacts_org_created_idx').on(t.orgId, t.createdAt.desc()),
    unique('contacts_org_email_uq').on(t.orgId, t.email),
    tenantPolicy('contacts'),
  ],
).enableRLS();

export const contactLists = pgTable(
  'contact_lists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgScoped,
    name: text('name').notNull(),
    ...timestamps,
  },
  (t) => [
    index('contact_lists_org_id_idx').on(t.orgId),
    unique('contact_lists_org_name_uq').on(t.orgId, t.name),
    tenantPolicy('contact_lists'),
  ],
).enableRLS();

/** Which contacts are on which list. A contact can be on many. */
export const contactListMembers = pgTable(
  'contact_list_members',
  {
    ...orgScoped,
    listId: uuid('list_id')
      .notNull()
      .references(() => contactLists.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.orgId, t.listId, t.contactId] }),
    index('contact_list_members_org_contact_idx').on(t.orgId, t.contactId),
    tenantPolicy('contact_list_members'),
  ],
).enableRLS();
