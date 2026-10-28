import { describe, expect, it } from 'vitest';
import { progressOf } from './hooks';

const stats = { total: 10, pending: 0, queued: 0, sent: 0, failed: 0, skipped: 0 };

describe('progressOf', () => {
  it('counts everyone who is done, however it ended', () => {
    expect(progressOf({ ...stats, sent: 5, failed: 1, skipped: 2, pending: 2 })).toBe(80);
    expect(progressOf({ ...stats, sent: 10 })).toBe(100);
  });

  it('does not count recipients still waiting or on their way', () => {
    expect(progressOf({ ...stats, pending: 4, queued: 6 })).toBe(0);
  });

  it('is zero for an empty broadcast instead of dividing by zero', () => {
    expect(progressOf({ ...stats, total: 0 })).toBe(0);
  });
});
