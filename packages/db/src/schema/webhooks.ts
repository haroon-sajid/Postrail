import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { webhookDeliveryStatus } from './enums';
import { messages } from './messages';
import { orgScoped, tenantPolicy } from './tenancy';
import { timestamps } from './timestamps';

export const webhookEndpoints = pgTable(
  'webhook_endpoints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgScoped,
    url: text('url').notNull(),
    /** Signing secret, encrypted at rest with TOKEN_ENCRYPTION_KEY. Shown once on create. */
    secret: text('secret').notNull(),
    events: text('events')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    ...timestamps,
  },
  (t) => [index('webhook_endpoints_org_id_idx').on(t.orgId), tenantPolicy('webhook_endpoints')],
).enableRLS();

export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgScoped,
    endpointId: uuid('endpoint_id')
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id').references(() => messages.id, { onDelete: 'set null' }),
    event: text('event').notNull(),
    /** The exact JSON body sent, so every retry is byte-identical and re-verifiable. */
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    status: webhookDeliveryStatus('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    responseCode: integer('response_code'),
    error: text('error'),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('webhook_deliveries_org_id_idx').on(t.orgId),
    index('webhook_deliveries_endpoint_created_idx').on(t.endpointId, t.createdAt.desc()),
    // The retry worker polls by status and due time across all tenants.
    index('webhook_deliveries_status_retry_idx').on(t.status, t.nextRetryAt),
    tenantPolicy('webhook_deliveries'),
  ],
).enableRLS();
