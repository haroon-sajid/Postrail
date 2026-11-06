import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Rate-limit state shared by every API instance (ADR 0015). One row per API key or
 * dashboard user holding its GCRA "theoretical arrival time": the instant its budget would
 * be fully spent at the sustained rate. Not tenant data; idle rows are deleted by the
 * scheduler.
 */
export const rateLimits = pgTable(
  'rate_limits',
  {
    key: text('key').primaryKey(),
    tat: timestamp('tat', { withTimezone: true }).notNull(),
  },
  (t) => [index('rate_limits_tat_idx').on(t.tat)],
);
