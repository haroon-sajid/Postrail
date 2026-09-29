import { pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { orgScoped, tenantPolicy } from './tenancy';

/** Addresses a tenant must not send to (bounces, complaints, unsubscribes). */
export const suppressions = pgTable(
  'suppressions',
  {
    ...orgScoped,
    email: text('email').notNull(),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // The primary key leads with org_id, so it doubles as the org index.
  (t) => [primaryKey({ columns: [t.orgId, t.email] }), tenantPolicy('suppressions')],
).enableRLS();
