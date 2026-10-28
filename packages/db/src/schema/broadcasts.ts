import { index, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { contactLists, contacts } from './contacts';
import { broadcastRecipientState, broadcastStatus } from './enums';
import { messages } from './messages';
import { templates } from './templates';
import { orgScoped, tenantPolicy } from './tenancy';
import { timestamps } from './timestamps';

/** One template sent to one list, paced over as many days as the mailboxes need (ADR 0013). */
export const broadcasts = pgTable(
  'broadcasts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgScoped,
    name: text('name').notNull(),
    status: broadcastStatus('status').notNull().default('draft'),
    // Set-null so a broadcast's history survives its template or list being deleted.
    templateId: uuid('template_id').references(() => templates.id, { onDelete: 'set null' }),
    listId: uuid('list_id').references(() => contactLists.id, { onDelete: 'set null' }),
    /**
     * The template as it was when sending started. A broadcast can run for days; editing
     * the template meanwhile must not change what later recipients get.
     */
    subject: text('subject'),
    html: text('html'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('broadcasts_org_created_idx').on(t.orgId, t.createdAt.desc()),
    // The daily reset looks for broadcasts still sending, across all tenants.
    index('broadcasts_status_idx').on(t.status),
    tenantPolicy('broadcasts'),
  ],
).enableRLS();

/** The list as it was when sending started, one row per address, each with its own outcome. */
export const broadcastRecipients = pgTable(
  'broadcast_recipients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgScoped,
    broadcastId: uuid('broadcast_id')
      .notNull()
      .references(() => broadcasts.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    email: text('email').notNull(),
    properties: jsonb('properties').$type<Record<string, string>>().notNull().default({}),
    state: broadcastRecipientState('state').notNull().default('pending'),
    /** The message in Logs once this recipient was handed to delivery. */
    messageId: uuid('message_id').references(() => messages.id, { onDelete: 'set null' }),
    /** Why it was skipped or failed. */
    error: text('error'),
    ...timestamps,
  },
  (t) => [
    index('broadcast_recipients_org_broadcast_state_idx').on(t.orgId, t.broadcastId, t.state),
    // Also the order recipients are listed in, so the email is the list cursor.
    unique('broadcast_recipients_broadcast_email_uq').on(t.broadcastId, t.email),
    tenantPolicy('broadcast_recipients'),
  ],
).enableRLS();
