import { type MiddlewareHandler } from 'hono';
import { type RateLimitStore } from '../modules/rate-limits/repo';
import { type AppEnv } from './context';
import { AppError } from './errors';
import { type Logger } from './logger';

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** How long until at least one more request would be allowed. 0 when allowed. */
  retryAfterMs: number;
}

/**
 * Anything that can answer "may this key make one more request now". Production uses
 * `SharedRateLimiter`, whose budget lives in Postgres so every instance and every deploy
 * sees the same one (ADR 0015). The in-memory bucket is per process, for tests.
 */
export interface RateLimiter {
  take: (key: string) => Promise<RateLimitDecision>;
}

export interface TokenBucketOptions {
  /** Burst size. */
  capacity: number;
  /** Sustained rate. */
  refillPerSecond: number;
  now?: () => number;
}

/** 120 requests burst, 2/s sustained, per API key. */
export const DEFAULT_RATE_LIMIT: TokenBucketOptions = { capacity: 120, refillPerSecond: 2 };

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const IDLE_EVICT_MS = 10 * 60_000;
const EVICT_CHECK_SIZE = 10_000;

export class InMemoryTokenBucket implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly now: () => number;

  constructor(private readonly options: TokenBucketOptions = DEFAULT_RATE_LIMIT) {
    this.now = options.now ?? (() => Date.now());
  }

  take = (key: string): Promise<RateLimitDecision> => {
    const { capacity, refillPerSecond } = this.options;
    const nowMs = this.now();
    const bucket = this.buckets.get(key) ?? { tokens: capacity, updatedAt: nowMs };

    const elapsedSeconds = Math.max(0, nowMs - bucket.updatedAt) / 1000;
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSeconds * refillPerSecond);
    bucket.updatedAt = nowMs;

    const allowed = bucket.tokens >= 1;
    if (allowed) bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    this.evictIdle(nowMs);

    return Promise.resolve({
      allowed,
      limit: capacity,
      remaining: Math.floor(bucket.tokens),
      retryAfterMs: allowed ? 0 : Math.ceil(((1 - bucket.tokens) / refillPerSecond) * 1000),
    });
  };

  /** Keeps the map bounded without a timer, which Cloud Run would not keep alive anyway. */
  private evictIdle(nowMs: number): void {
    if (this.buckets.size < EVICT_CHECK_SIZE) return;
    for (const [key, bucket] of this.buckets) {
      if (nowMs - bucket.updatedAt > IDLE_EVICT_MS) this.buckets.delete(key);
    }
  }
}

export interface SharedRateLimiterOptions extends Omit<TokenBucketOptions, 'now'> {
  store: Pick<RateLimitStore, 'take'>;
  logger: Logger;
}

/**
 * The same budget as the token bucket (a burst of `capacity`, then `refillPerSecond`),
 * computed with GCRA so the shared state is a single timestamp per key that one SQL
 * statement can check and advance atomically.
 *
 * If the store cannot answer, the request is allowed and a warning logged: a limiter that
 * fails closed would turn a database blip into a full outage of the API.
 */
export class SharedRateLimiter implements RateLimiter {
  private readonly emissionMs: number;
  private readonly toleranceMs: number;

  constructor(private readonly options: SharedRateLimiterOptions) {
    this.emissionMs = 1000 / options.refillPerSecond;
    // A fresh key may spend `capacity` requests at once: the first plus capacity - 1 more.
    this.toleranceMs = this.emissionMs * (options.capacity - 1);
  }

  take = async (key: string): Promise<RateLimitDecision> => {
    const { capacity, store, logger } = this.options;
    let result: { allowed: boolean; aheadMs: number };
    try {
      result = await store.take(key, this.emissionMs, this.toleranceMs);
    } catch (error) {
      logger.warn({ err: error }, 'rate limiter unavailable; allowing the request');
      return { allowed: true, limit: capacity, remaining: capacity - 1, retryAfterMs: 0 };
    }
    if (!result.allowed) {
      return {
        allowed: false,
        limit: capacity,
        remaining: 0,
        retryAfterMs: Math.max(0, Math.ceil(result.aheadMs - this.toleranceMs)),
      };
    }
    const left = Math.floor(
      (this.toleranceMs + this.emissionMs - result.aheadMs) / this.emissionMs,
    );
    return {
      allowed: true,
      limit: capacity,
      remaining: Math.min(capacity - 1, Math.max(0, left)),
      retryAfterMs: 0,
    };
  };
}

/** Mount after auth. Budgets are per API key, or per user for dashboard sessions. */
export function rateLimit(limiter: RateLimiter): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const key = c.var.auth?.apiKeyId ?? c.var.user?.id;
    if (!key) return next();

    const decision = await limiter.take(key);
    c.header('RateLimit-Limit', String(decision.limit));
    c.header('RateLimit-Remaining', String(decision.remaining));
    if (!decision.allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil(decision.retryAfterMs / 1000));
      c.header('Retry-After', String(retryAfterSeconds));
      throw AppError.rateLimited(retryAfterSeconds);
    }
    await next();
  };
}
