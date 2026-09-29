import { index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { messageStatus } from './enums';
import { mailboxes } from './mailboxes';
import { orgScoped, tenantPolicy } from './tenancy';
import { timestamps } from './timestamps';

/** One send request. Bodies are not stored here; only what is needed to track delivery. */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgScoped,
    // Nullable with set-null so delivery history survives a mailbox being removed.
    mailboxId: uuid('mailbox_id').references(() => mailboxes.id, { onDelete: 'set null' }),
    idempotencyKey: text('idempotency_key'),
    toEmail: text('to_email').notNull(),
    fromEmail: text('from_email').notNull(),
    subject: text('subject').notNull(),
    status: messageStatus('status').notNull().default('queued'),
    providerMessageId: text('provider_message_id'),
    error: text('error'),
    attempts: integer('attempts').notNull().default(0),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    ...timestamps,
    // Millisecond precision on purpose: the list cursor is (created_at, id) and JS Dates
    // only carry milliseconds. With microseconds in the database the keyset equality
    // branch never matches and rows sharing a millisecond get skipped.
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (t) => [
    index('messages_org_id_idx').on(t.orgId),
    index('messages_org_created_idx').on(t.orgId, t.createdAt.desc()),
    index('messages_status_created_idx').on(t.status, t.createdAt),
    unique('messages_org_idempotency_uq').on(t.orgId, t.idempotencyKey),
    tenantPolicy('messages'),
  ],
).enableRLS();
