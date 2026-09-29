import { type Db, mailboxes, messages, withOrg } from '@postrail/db';
import { and, count, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { type MessageRow } from '../emails/repo';

export interface DailyCount {
  /** YYYY-MM-DD in UTC. */
  date: string;
  sent: number;
  failed: number;
}

export interface MailboxUsage {
  id: string;
  email: string;
  status: 'active' | 'disconnected' | 'paused';
  sentToday: number;
  dailyLimit: number;
}

export interface OverviewStore {
  countByStatus: (
    orgId: string,
    status: 'sent' | 'failed',
    from: Date,
    to: Date,
  ) => Promise<number>;
  dailyCounts: (orgId: string, from: Date) => Promise<DailyCount[]>;
  mailboxUsage: (orgId: string) => Promise<MailboxUsage[]>;
  recentFailures: (orgId: string, limit: number) => Promise<MessageRow[]>;
}

export function createOverviewStore(db: Db): OverviewStore {
  return {
    countByStatus: (orgId, status, from, to) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .select({ n: count() })
          .from(messages)
          .where(
            and(
              eq(messages.orgId, orgId),
              eq(messages.status, status),
              gte(messages.createdAt, from),
              lt(messages.createdAt, to),
            ),
          );
        return row?.n ?? 0;
      }),

    dailyCounts: (orgId, from) =>
      withOrg(db, orgId, async (tx) => {
        const day = sql<string>`to_char(date_trunc('day', ${messages.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`;
        const rows = await tx
          .select({ date: day, status: messages.status, n: count() })
          .from(messages)
          .where(and(eq(messages.orgId, orgId), gte(messages.createdAt, from)))
          .groupBy(day, messages.status);
        const byDate = new Map<string, DailyCount>();
        for (const r of rows) {
          const entry = byDate.get(r.date) ?? { date: r.date, sent: 0, failed: 0 };
          if (r.status === 'sent') entry.sent += r.n;
          if (r.status === 'failed') entry.failed += r.n;
          byDate.set(r.date, entry);
        }
        return [...byDate.values()];
      }),

    mailboxUsage: (orgId) =>
      withOrg(db, orgId, (tx) =>
        tx
          .select({
            id: mailboxes.id,
            email: mailboxes.email,
            status: mailboxes.status,
            sentToday: mailboxes.sentToday,
            dailyLimit: mailboxes.dailyLimit,
          })
          .from(mailboxes)
          .where(eq(mailboxes.orgId, orgId))
          .orderBy(desc(mailboxes.sentToday)),
      ),

    recentFailures: (orgId, limit) =>
      withOrg(db, orgId, (tx) =>
        tx
          .select()
          .from(messages)
          .where(and(eq(messages.orgId, orgId), eq(messages.status, 'failed')))
          .orderBy(desc(messages.createdAt), desc(messages.id))
          .limit(limit),
      ),
  };
}
