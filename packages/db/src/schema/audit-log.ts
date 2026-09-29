import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { orgScoped, tenantPolicy } from './tenancy';

/** Append-only. Never store tokens or email bodies in `meta`. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgScoped,
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    target: text('target'),
    meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_org_id_idx').on(t.orgId),
    index('audit_log_org_created_idx').on(t.orgId, t.createdAt.desc()),
    tenantPolicy('audit_log'),
  ],
).enableRLS();
