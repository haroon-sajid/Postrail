import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * The last run of each scheduled job (ADR 0014). A job meant to run once per period, such
 * as the daily counter reset, claims its period here first, so it runs once however often
 * the tick is called and however many instances answer it. Not tenant data: one row per job.
 */
export const scheduledRuns = pgTable('scheduled_runs', {
  name: text('name').primaryKey(),
  /** The period the last claim was for, e.g. `2026-11-06` for a daily job. */
  period: text('period').notNull(),
  claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull(),
  /** Null while the claimed run is in progress. A stale unfinished claim may be taken again. */
  completedAt: timestamp('completed_at', { withTimezone: true }),
});
