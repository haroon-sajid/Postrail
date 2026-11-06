import { type Db, scheduledRuns, withSystem } from '@postrail/db';
import { and, eq, isNull, sql } from 'drizzle-orm';

export interface SchedulerStore {
  /**
   * Takes job `name` for `period`. False when that period already ran, or when another
   * caller claimed it less than `leaseMs` ago and has not finished; a claim older than that
   * belongs to a run that died and may be taken over.
   */
  claim: (name: string, period: string, now: Date, leaseMs: number) => Promise<boolean>;
  complete: (name: string, period: string, now: Date) => Promise<void>;
  /** Hands an unfinished claim back after a failure, so the next tick tries again. */
  release: (name: string, period: string) => Promise<void>;
}

export function createSchedulerStore(db: Db): SchedulerStore {
  return {
    // withSystem: job bookkeeping is global, not tenant data.
    claim: (name, period, now, leaseMs) =>
      withSystem(db, async (tx) => {
        // ISO text: inside raw SQL there is no column type to map a Date through.
        const staleBefore = new Date(now.getTime() - leaseMs).toISOString();
        const rows = await tx
          .insert(scheduledRuns)
          .values({ name, period, claimedAt: now })
          .onConflictDoUpdate({
            target: scheduledRuns.name,
            set: { period, claimedAt: now, completedAt: null },
            // Periods are ISO dates, so text order is time order.
            setWhere: sql`${scheduledRuns.period} < ${period} or (${scheduledRuns.period} = ${period} and ${scheduledRuns.completedAt} is null and ${scheduledRuns.claimedAt} < ${staleBefore})`,
          })
          .returning({ name: scheduledRuns.name });
        return rows.length > 0;
      }),

    // withSystem: job bookkeeping is global, not tenant data.
    complete: (name, period, now) =>
      withSystem(db, async (tx) => {
        await tx
          .update(scheduledRuns)
          .set({ completedAt: now })
          .where(and(eq(scheduledRuns.name, name), eq(scheduledRuns.period, period)));
      }),

    // withSystem: job bookkeeping is global, not tenant data.
    release: (name, period) =>
      withSystem(db, async (tx) => {
        // An ancient claim time makes the claim stale at once.
        await tx
          .update(scheduledRuns)
          .set({ claimedAt: new Date(0) })
          .where(
            and(
              eq(scheduledRuns.name, name),
              eq(scheduledRuns.period, period),
              isNull(scheduledRuns.completedAt),
            ),
          );
      }),
  };
}
