import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { memberRole } from './enums';
import { orgScoped, tenantPolicy } from './tenancy';
import { users } from './users';

/** A pending invitation. The raw token lives only in the emailed link; we keep its hash. */
export const invites = pgTable(
  'invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgScoped,
    email: text('email').notNull(),
    role: memberRole('role').notNull().default('member'),
    tokenHash: text('token_hash').notNull().unique(),
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('invites_org_id_idx').on(t.orgId), tenantPolicy('invites')],
).enableRLS();
