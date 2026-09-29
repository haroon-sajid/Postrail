import { describe, expect, it } from 'vitest';
import { InMemoryTokenBucket } from './rate-limit';

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
