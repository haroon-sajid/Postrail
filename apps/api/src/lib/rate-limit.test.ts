import { describe, expect, it } from 'vitest';
import { type RateLimitStore } from '../modules/rate-limits/repo';
import { silentLogger } from './logger';
import { InMemoryTokenBucket, SharedRateLimiter } from './rate-limit';

describe('InMemoryTokenBucket', () => {
  it('allows a burst up to capacity, then refuses with a retry hint', async () => {
    let now = 0;
    const bucket = new InMemoryTokenBucket({ capacity: 3, refillPerSecond: 1, now: () => now });

    for (let i = 0; i < 3; i++) expect((await bucket.take('k')).allowed).toBe(true);
    const denied = await bucket.take('k');
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.retryAfterMs).toBe(1000);

    now = 1000;
    expect((await bucket.take('k')).allowed).toBe(true);
  });

  it('keeps keys independent and never exceeds capacity after idling', async () => {
    let now = 0;
    const bucket = new InMemoryTokenBucket({ capacity: 2, refillPerSecond: 1, now: () => now });
    await bucket.take('a');
    await bucket.take('a');
    expect((await bucket.take('b')).allowed).toBe(true);
    expect((await bucket.take('a')).allowed).toBe(false);

    now = 60_000;
    expect((await bucket.take('a')).remaining).toBe(1);
  });
});

/** The SQL in modules/rate-limits/repo.ts, step for step, against a clock the test moves. */
function gcraStore(clock: { now: number }): Pick<RateLimitStore, 'take'> {
  const tats = new Map<string, number>();
  return {
    take: (key, emissionMs, toleranceMs) => {
      const tat = Math.max(tats.get(key) ?? clock.now, clock.now);
      if (tat - clock.now > toleranceMs) {
        return Promise.resolve({ allowed: false, aheadMs: tat - clock.now });
      }
      tats.set(key, tat + emissionMs);
      return Promise.resolve({ allowed: true, aheadMs: tat + emissionMs - clock.now });
    },
  };
}

describe('SharedRateLimiter', () => {
  const logger = silentLogger();

  it('allows exactly a burst of capacity, then one request per refill interval', async () => {
    const clock = { now: 0 };
    const limiter = new SharedRateLimiter({
      capacity: 3,
      refillPerSecond: 2,
      store: gcraStore(clock),
      logger,
    });

    const remaining: number[] = [];
    for (let i = 0; i < 3; i++) {
      const decision = await limiter.take('k');
      expect(decision.allowed).toBe(true);
      remaining.push(decision.remaining);
    }
    expect(remaining).toEqual([2, 1, 0]);

    const denied = await limiter.take('k');
    expect(denied).toMatchObject({ allowed: false, limit: 3, remaining: 0, retryAfterMs: 500 });

    clock.now = 500;
    expect((await limiter.take('k')).allowed).toBe(true);
    expect((await limiter.take('k')).allowed).toBe(false);
  });

  it('refills to the full burst and no further after idling', async () => {
    const clock = { now: 0 };
    const limiter = new SharedRateLimiter({
      capacity: 120,
      refillPerSecond: 2,
      store: gcraStore(clock),
      logger,
    });
    for (let i = 0; i < 120; i++) await limiter.take('k');
    expect((await limiter.take('k')).allowed).toBe(false);

    clock.now = 3_600_000;
    const first = await limiter.take('k');
    expect(first).toMatchObject({ allowed: true, remaining: 119 });
  });

  it('keeps keys independent', async () => {
    const clock = { now: 0 };
    const limiter = new SharedRateLimiter({
      capacity: 1,
      refillPerSecond: 1,
      store: gcraStore(clock),
      logger,
    });
    expect((await limiter.take('a')).allowed).toBe(true);
    expect((await limiter.take('a')).allowed).toBe(false);
    expect((await limiter.take('b')).allowed).toBe(true);
  });

  it('lets requests through when the store is down, instead of failing the API', async () => {
    const limiter = new SharedRateLimiter({
      capacity: 120,
      refillPerSecond: 2,
      store: { take: () => Promise.reject(new Error('connection refused')) },
      logger,
    });
    expect(await limiter.take('k')).toEqual({
      allowed: true,
      limit: 120,
      remaining: 119,
      retryAfterMs: 0,
    });
  });
});
