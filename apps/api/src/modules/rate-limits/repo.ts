import { type Db, rateLimits, withSystem } from '@postrail/db';
import { inArray, lt, sql } from 'drizzle-orm';

export interface RateLimitStore {
  /**
   * GCRA in one statement (ADR 0015): spends one request for `key` when it is within
   * budget. `aheadMs` is how far the key's theoretical arrival time is ahead of the
   * database clock afterwards, which is all the caller needs to work out what is left.
   */
  take: (
    key: string,
    emissionMs: number,
    toleranceMs: number,
  ) => Promise<{ allowed: boolean; aheadMs: number }>;
  /** Rows whose budget has been full since before `before`, i.e. keys that stopped calling. */
  deleteIdle: (before: Date, limit: number) => Promise<number>;
}

export function createRateLimitStore(db: Db): RateLimitStore {
  return {
    // withSystem: rate-limit state is keyed by API key or user, not by org, and holds no tenant data.
    take: (key, emissionMs, toleranceMs) =>
      withSystem(db, async (tx) => {
        const emission = sql`(${emissionMs}::float8 * interval '1 millisecond')`;
        const tolerance = sql`(${toleranceMs}::float8 * interval '1 millisecond')`;
        // The database clock, so every API instance measures against the same time.
        const spent = await tx.execute<{ ahead_ms: string }>(sql`
          insert into ${rateLimits} as r (key, tat) values (${key}, now() + ${emission})
          on conflict (key) do update
            set tat = greatest(r.tat, now()) + ${emission}
            where greatest(r.tat, now()) - now() <= ${tolerance}
          returning extract(epoch from (r.tat - now())) * 1000 as ahead_ms
        `);
        const [row] = spent;
        if (row) return { allowed: true, aheadMs: Number(row.ahead_ms) };
        // Over budget: nothing was written, so read how far ahead the key already is.
        const [current] = await tx.execute<{ ahead_ms: string }>(sql`
          select extract(epoch from (tat - now())) * 1000 as ahead_ms
          from ${rateLimits} where key = ${key}
        `);
        return { allowed: false, aheadMs: Number(current?.ahead_ms ?? 0) };
      }),

    // withSystem: retention across every key; idle rows mean a full budget, same as no row.
    deleteIdle: (before, limit) =>
      withSystem(db, async (tx) => {
        const idle = tx
          .select({ key: rateLimits.key })
          .from(rateLimits)
          .where(lt(rateLimits.tat, before))
          .limit(limit);
        const deleted = await tx
          .delete(rateLimits)
          .where(inArray(rateLimits.key, idle))
          .returning({ key: rateLimits.key });
        return deleted.length;
      }),
  };
}
