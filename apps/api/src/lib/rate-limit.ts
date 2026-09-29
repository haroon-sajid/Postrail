import { type MiddlewareHandler } from 'hono';
import { type AppEnv } from './context';
import { AppError } from './errors';

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** How long until at least one more request would be allowed. 0 when allowed. */
  retryAfterMs: number;
}

/**
 * Anything that can answer "may this key make one more request now". The in-memory
 * bucket below is per process; a Redis or Postgres implementation slots in here when
 * several Cloud Run instances need to share a budget.
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
