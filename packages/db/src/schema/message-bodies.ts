import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { messages } from './messages';
import { orgScoped, tenantPolicy } from './tenancy';

/**
 * Content of a message while it is in flight. Written with the message, read by the
 * worker, deleted once the message is sent or failed, so bodies are never stored longer
 * than delivery takes (ADR 0005).
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('message_bodies_org_id_idx').on(t.orgId), tenantPolicy('message_bodies')],
).enableRLS();
