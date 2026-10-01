import { describe, expect, it } from 'vitest';
import { toWeekly } from './usage';

describe('toWeekly', () => {
  it('sums days into calendar weeks that start on Monday', () => {
    const weekly = toWeekly([
      // Sunday closes one week, Monday opens the next.
      { date: '2026-09-27', sent: 3, failed: 1 },
      { date: '2026-09-28', sent: 5, failed: 0 },
      { date: '2026-09-29', sent: 2, failed: 2 },
      { date: '2026-10-04', sent: 1, failed: 0 },
      { date: '2026-10-05', sent: 7, failed: 0 },
    ]);
    expect(weekly).toEqual([
      { date: '2026-09-21', sent: 3, failed: 1 },
      { date: '2026-09-28', sent: 8, failed: 2 },
      { date: '2026-10-05', sent: 7, failed: 0 },
    ]);
  });

  it('keeps empty weeks as zero points and does not change the input', () => {
    const series = [{ date: '2026-09-28', sent: 0, failed: 0 }];
    expect(toWeekly(series)).toEqual([{ date: '2026-09-28', sent: 0, failed: 0 }]);
    expect(series).toEqual([{ date: '2026-09-28', sent: 0, failed: 0 }]);
  });
});
