import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { messages } from './messages';
import { orgScoped, tenantPolicy } from './tenancy';

/**
 * Content of a message. Written with the message, read by the worker, and kept afterwards
 * for preview and resend (ADR 0007). A `sensitive` body is the exception: it holds a
 * sign-in link or code, is never shown, and is deleted once delivery ends (ADR 0011).
 */
export const messageBodies = pgTable(
  'message_bodies',
  {
    messageId: uuid('message_id')
      .primaryKey()
      .references(() => messages.id, { onDelete: 'cascade' }),
    ...orgScoped,
    html: text('html'),
    text: text('text'),
    replyTo: text('reply_to'),
    headers: jsonb('headers').$type<Record<string, string>>(),
    sensitive: boolean('sensitive').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('message_bodies_org_id_idx').on(t.orgId), tenantPolicy('message_bodies')],
).enableRLS();
