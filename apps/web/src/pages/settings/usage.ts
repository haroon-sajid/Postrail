import type { Overview } from '@/api/types';

export type UsagePoint = Overview['series'][number];

/** Monday (UTC) of the week `date` ("YYYY-MM-DD") falls in, in the same format. */
function weekStart(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  const sinceMonday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - sinceMonday);
  return day.toISOString().slice(0, 10);
}

/** Folds a daily series into one point per calendar week, keyed by its Monday. */
export function toWeekly(series: UsagePoint[]): UsagePoint[] {
  const weeks = new Map<string, UsagePoint>();
  for (const point of series) {
    const key = weekStart(point.date);
    const week = weeks.get(key) ?? { date: key, sent: 0, failed: 0 };
    week.sent += point.sent;
    week.failed += point.failed;
    weeks.set(key, week);
  }
  return [...weeks.values()];
}
