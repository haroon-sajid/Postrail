import { overviewSchema } from '@postrail/shared';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../../test/app';
import { SERIES_DAYS, zeroFill } from './service';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('zeroFill', () => {
  it('produces one entry per day with zeros where nothing happened', () => {
    const from = new Date('2026-09-01T00:00:00Z');
    const out = zeroFill([{ date: '2026-09-02', sent: 3, failed: 1 }], from, 3);
    expect(out).toEqual([
      { date: '2026-09-01', sent: 0, failed: 0 },
      { date: '2026-09-02', sent: 3, failed: 1 },
      { date: '2026-09-03', sent: 0, failed: 0 },
    ]);
  });
});

describe('GET /app/orgs/:orgId/overview', () => {
  it('reports stats, a 30-day series, mailbox usage and recent failures', async () => {
    const now = new Date('2026-09-29T12:00:00Z');
    const t = createTestApp({ now: () => now });
    const user = t.member(ORG, 'member');
    const mailbox = t.store.add(ORG, { email: 'a@example.com', sentToday: 5 });
    t.store.add(ORG, { email: 'b@example.com', status: 'paused' });

    const day = 24 * 60 * 60 * 1000;
    const add = (status: 'sent' | 'failed', ageMs: number) => {
      const createdAt = new Date(now.getTime() - ageMs);
      t.emailStore.rows.push({
        id: `20000000-0000-4000-8000-${String(t.emailStore.rows.length + 1).padStart(12, '0')}`,
        orgId: ORG,
        mailboxId: mailbox.id,
        idempotencyKey: null,
        toEmail: 'x@example.org',
        fromEmail: 'a@example.com',
        subject: 's',
        status,
        providerMessageId: null,
        error: status === 'failed' ? 'boom' : null,
        attempts: 1,
        sentAt: status === 'sent' ? createdAt : null,
        createdAt,
        updatedAt: createdAt,
      });
    };
    add('sent', 1000);
    add('sent', 2 * day);
    add('failed', 3 * day);
    add('sent', 10 * day);
    add('failed', 40 * day);

    const res = await t.app.request(`/app/orgs/${ORG}/overview`, {
      headers: t.sessionHeaders(user),
    });
    expect(res.status).toBe(200);
    const overview = overviewSchema.parse(await res.json());
    expect(overview.stats).toEqual({
      sent_today: 1,
      sent_yesterday: 0,
      sent_7d: 2,
      sent_prev_7d: 1,
      failed_7d: 1,
      failed_prev_7d: 0,
      active_mailboxes: 1,
      total_mailboxes: 2,
    });
    expect(overview.series).toHaveLength(SERIES_DAYS);
    expect(overview.series.at(-1)).toEqual({ date: '2026-09-29', sent: 1, failed: 0 });
    expect(overview.mailbox_usage[0]).toMatchObject({
      email: 'a@example.com',
      sent_today: 5,
      daily_limit: 400,
    });
    expect(overview.recent_failures.map((f) => f.error)).toEqual(['boom', 'boom']);
  });
});
