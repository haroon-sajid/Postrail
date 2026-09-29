import { type Overview } from '@postrail/shared';
import { type AuthContext } from '../../lib/context';
import { toEmail } from '../emails/service';
import { type DailyCount, type OverviewStore } from './repo';

const DAY_MS = 24 * 60 * 60 * 1000;
export const SERIES_DAYS = 30;
const RECENT_FAILURES = 10;

export interface OverviewService {
  get: (auth: AuthContext) => Promise<Overview>;
}

export function createOverviewService(
  store: OverviewStore,
  now: () => Date = () => new Date(),
): OverviewService {
  return {
    async get({ orgId }) {
      const end = now();
      const todayStart = startOfUtcDay(end);
      const yesterdayStart = new Date(todayStart.getTime() - DAY_MS);
      const sevenDaysAgo = new Date(end.getTime() - 7 * DAY_MS);
      const fourteenDaysAgo = new Date(end.getTime() - 14 * DAY_MS);
      const seriesFrom = new Date(todayStart.getTime() - (SERIES_DAYS - 1) * DAY_MS);

      const [
        sentToday,
        sentYesterday,
        sent7d,
        sentPrev7d,
        failed7d,
        failedPrev7d,
        daily,
        usage,
        failures,
      ] = await Promise.all([
        store.countByStatus(orgId, 'sent', todayStart, end),
        store.countByStatus(orgId, 'sent', yesterdayStart, todayStart),
        store.countByStatus(orgId, 'sent', sevenDaysAgo, end),
        store.countByStatus(orgId, 'sent', fourteenDaysAgo, sevenDaysAgo),
        store.countByStatus(orgId, 'failed', sevenDaysAgo, end),
        store.countByStatus(orgId, 'failed', fourteenDaysAgo, sevenDaysAgo),
        store.dailyCounts(orgId, seriesFrom),
        store.mailboxUsage(orgId),
        store.recentFailures(orgId, RECENT_FAILURES),
      ]);

      return {
        stats: {
          sent_today: sentToday,
          sent_yesterday: sentYesterday,
          sent_7d: sent7d,
          sent_prev_7d: sentPrev7d,
          failed_7d: failed7d,
          failed_prev_7d: failedPrev7d,
          active_mailboxes: usage.filter((m) => m.status === 'active').length,
          total_mailboxes: usage.length,
        },
        series: zeroFill(daily, seriesFrom, SERIES_DAYS),
        mailbox_usage: usage.map((m) => ({
          id: m.id,
          email: m.email,
          status: m.status,
          sent_today: m.sentToday,
          daily_limit: m.dailyLimit,
        })),
        recent_failures: failures.map(toEmail),
      };
    },
  };
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Charts want every day present, so days without traffic become explicit zeros. */
export function zeroFill(rows: DailyCount[], from: Date, days: number): DailyCount[] {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const out: DailyCount[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(from.getTime() + i * DAY_MS).toISOString().slice(0, 10);
    out.push(byDate.get(date) ?? { date, sent: 0, failed: 0 });
  }
  return out;
}
