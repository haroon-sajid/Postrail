import { randomUUID } from 'node:crypto';
import {
  errorResponseSchema,
  resetCountersResponseSchema,
  tickResponseSchema,
  webhookCreatedSchema,
} from '@postrail/shared';
import { describe, expect, it, vi } from 'vitest';
import { createTestApp } from '../../test/app';
import { DISPATCH_LEASE_MS } from '../broadcasts/worker';
import { SENDING_LEASE_MS } from '../emails/worker';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** A test app on a clock the test moves, plus a way to call the tick like the cron does. */
function setup(start = new Date()) {
  const clock = { now: start };
  const t = createTestApp({ now: () => clock.now });
  const tick = async (expected = 200) => {
    const res = await t.app.request('/internal/cron/tick', {
      method: 'POST',
      headers: t.cronHeaders,
    });
    expect(res.status).toBe(expected);
    return tickResponseSchema.parse(await res.json());
  };
  const queueEmail = async (orgId = ORG) => {
    const res = await t.app.request('/v1/emails', {
      method: 'POST',
      headers: t.authHeaders(orgId),
      body: JSON.stringify({ to: 'dest@example.org', subject: 's', text: 'b' }),
    });
    return ((await res.json()) as { id: string }).id;
  };
  return { ...t, clock, tick, queueEmail };
}

describe('POST /internal/cron/tick: auth', () => {
  it('needs the cron secret or the queue credential', async () => {
    const t = setup();
    const res = await t.app.request('/internal/cron/tick', { method: 'POST' });
    expect(res.status).toBe(401);
    expect(errorResponseSchema.parse(await res.json()).error.code).toBe('UNAUTHORIZED');
    const internal = await t.app.request('/internal/cron/tick', {
      method: 'POST',
      headers: t.internalHeaders,
    });
    expect(internal.status).toBe(200);
  });
});

describe('daily reset', () => {
  it('runs once per UTC day however often the tick is called', async () => {
    const t = setup(new Date('2026-11-06T00:05:00Z'));
    const box = t.store.add(ORG, { sentToday: 12 });
    t.store.add(ORG_B, { sentToday: 3 });

    expect((await t.tick()).daily).toEqual({ reset: 2, resumed: 0 });
    expect(box.sentToday).toBe(0);

    // Sending during the day must not be wiped by the next tick.
    box.sentToday = 7;
    t.clock.now = new Date('2026-11-06T23:55:00Z');
    expect((await t.tick()).daily).toBeNull();
    expect(box.sentToday).toBe(7);

    t.clock.now = new Date('2026-11-07T00:00:30Z');
    // Only the mailbox that sent since the last reset has anything to zero.
    expect((await t.tick()).daily).toEqual({ reset: 1, resumed: 0 });
    expect(box.sentToday).toBe(0);
  });

  it('keeps the old endpoint working, under the same once-a-day rule', async () => {
    const t = setup(new Date('2026-11-06T10:00:00Z'));
    t.store.add(ORG, { sentToday: 4 });
    const call = async () => {
      const res = await t.app.request('/internal/cron/reset-daily-counters', {
        method: 'POST',
        headers: t.internalHeaders,
      });
      expect(res.status).toBe(200);
      return resetCountersResponseSchema.parse(await res.json());
    };
    expect(await call()).toEqual({ reset: 1, resumed: 0, skipped: false });
    expect(await call()).toEqual({ reset: 0, resumed: 0, skipped: true });
    expect((await t.tick()).daily).toBeNull();
  });

  it('gives the day back when the reset fails, so the next tick retries it', async () => {
    const t = setup(new Date('2026-11-06T00:05:00Z'));
    const box = t.store.add(ORG, { sentToday: 9 });
    vi.spyOn(t.store, 'resetDailyCounters').mockRejectedValueOnce(new Error('db down'));

    const failed = await t.tick(500);
    expect(failed.failed).toEqual(['daily']);
    expect(box.sentToday).toBe(9);

    t.clock.now = new Date('2026-11-06T00:35:00Z');
    expect((await t.tick()).daily).toEqual({ reset: 1, resumed: 0 });
    expect(box.sentToday).toBe(0);
  });
});

describe('sweep', () => {
  it('re-queues an email whose task was lost, and only once it is overdue', async () => {
    const t = setup();
    t.store.add(ORG, { email: 'sender@example.com' });
    const id = await t.queueEmail();
    // The task is lost: a restart, or a free-tier instance that went to sleep.
    t.queue.discard();

    expect((await t.tick()).requeued.emails).toBe(0);

    t.clock.now = new Date(Date.now() + 11 * MINUTE);
    expect((await t.tick()).requeued.emails).toBe(1);
    expect(t.queue.taskIds).toEqual([expect.stringMatching(new RegExp(`^${id}-sweep-`))]);
    await t.queue.drain();
    expect(t.emailStore.rows[0]?.status).toBe('sent');

    expect((await t.tick()).requeued.emails).toBe(0);
  });

  it('leaves a retry alone until it is due, then picks it up if its task is lost', async () => {
    const t = setup();
    t.store.add(ORG, { email: 'sender@example.com' });
    await t.queueEmail();
    t.queue.discard();
    const row = t.emailStore.rows[0];
    if (!row) throw new Error('no message');
    row.nextAttemptAt = new Date(Date.now() + 30 * MINUTE);

    t.clock.now = new Date(Date.now() + 20 * MINUTE);
    expect((await t.tick()).requeued.emails).toBe(0);
    t.clock.now = new Date(Date.now() + 41 * MINUTE);
    expect((await t.tick()).requeued.emails).toBe(1);
  });

  it('re-queues a message whose sending lease lapsed', async () => {
    const t = setup();
    t.store.add(ORG, { email: 'sender@example.com' });
    await t.queueEmail();
    t.queue.discard();
    const row = t.emailStore.rows[0];
    if (!row) throw new Error('no message');
    Object.assign(row, { status: 'sending', attempts: 1, updatedAt: new Date() });

    t.clock.now = new Date(Date.now() + SENDING_LEASE_MS - MINUTE);
    expect((await t.tick()).requeued.emails).toBe(0);
    t.clock.now = new Date(Date.now() + SENDING_LEASE_MS + MINUTE);
    expect((await t.tick()).requeued.emails).toBe(1);
    await t.queue.drain();
    expect(row).toMatchObject({ status: 'sent', attempts: 2 });
  });

  it('re-queues a webhook delivery whose task was lost', async () => {
    const t = setup();
    const created = await t.app.request('/v1/webhooks', {
      method: 'POST',
      headers: t.authHeaders(ORG),
      body: JSON.stringify({ url: 'https://hooks.example.com/x', events: ['email.sent'] }),
    });
    const endpoint = webhookCreatedSchema.parse(await created.json());
    await t.webhookStore.createDelivery(ORG, {
      id: randomUUID(),
      endpointId: endpoint.id,
      messageId: null,
      event: 'email.sent',
      payload: { hello: 'world' },
    });

    t.clock.now = new Date(Date.now() + 11 * MINUTE);
    expect((await t.tick()).requeued.webhooks).toBe(1);
    await t.queue.drain();
    expect(t.webhookStore.deliveries[0]?.status).toBe('delivered');
    expect(t.receiver.calls).toHaveLength(1);
  });

  it('restarts a broadcast whose round was lost', async () => {
    const t = setup();
    t.store.add(ORG, { email: 'sender@example.com' });
    const stalled = addSendingBroadcast(t, 'stalled@example.com', 'pending');

    expect((await t.tick()).requeued.broadcasts).toBe(1);
    await t.queue.drain();
    expect(t.broadcastStore.rows.find((b) => b.id === stalled)?.status).toBe('sent');
    expect(t.emailStore.rows.map((m) => m.toEmail)).toEqual(['stalled@example.com']);
  });

  it('leaves a broadcast alone while a round holds its recipients', async () => {
    const t = setup();
    t.store.add(ORG, { email: 'sender@example.com' });
    addSendingBroadcast(t, 'busy@example.com', 'dispatching');

    expect((await t.tick()).requeued.broadcasts).toBe(0);
    // The round died: its claim lapses and the broadcast counts as stalled.
    t.clock.now = new Date(Date.now() + DISPATCH_LEASE_MS + MINUTE);
    expect((await t.tick()).requeued.broadcasts).toBe(1);
  });
});

describe('retention', () => {
  it('deletes what is past its date and keeps everything else', async () => {
    const now = new Date();
    const t = setup(now);
    const ago = (ms: number) => new Date(now.getTime() - ms);

    t.store.add(ORG, { email: 'sender@example.com' });
    const oldSent = await t.queueEmail();
    const oldQueued = await t.queueEmail();
    const recent = await t.queueEmail();
    for (const row of t.emailStore.rows) {
      if (row.id === oldSent) Object.assign(row, { status: 'sent', createdAt: ago(31 * DAY) });
      if (row.id === oldQueued) row.createdAt = ago(31 * DAY);
      if (row.id === recent) row.status = 'sent';
    }

    const endpoint = await t.app.request('/v1/webhooks', {
      method: 'POST',
      headers: t.authHeaders(ORG),
      body: JSON.stringify({ url: 'https://hooks.example.com/x', events: ['email.sent'] }),
    });
    const { id: endpointId } = webhookCreatedSchema.parse(await endpoint.json());
    for (const [status, age] of [
      ['delivered', 31 * DAY],
      ['failed', 31 * DAY],
      ['pending', 31 * DAY],
      ['delivered', 29 * DAY],
    ] as const) {
      const row = await t.webhookStore.createDelivery(ORG, {
        id: randomUUID(),
        endpointId,
        messageId: null,
        event: 'email.sent',
        payload: {},
      });
      Object.assign(row, { status, createdAt: ago(age) });
    }

    const session = (expiresAt: Date) => ({
      id: randomUUID(),
      orgId: ORG,
      userId: randomUUID(),
      tokenHash: randomUUID(),
      expiresAt,
      revokedAt: null,
      createdAt: ago(60 * DAY),
    });
    t.authStore.sessions.push(session(ago(31 * DAY)), session(ago(29 * DAY)));
    const challenge = (expiresAt: Date) => ({
      id: randomUUID(),
      orgId: ORG,
      kind: 'email_otp' as const,
      email: 'u@example.com',
      userId: null,
      provider: null,
      tokenHash: randomUUID(),
      attempts: 0,
      expiresAt,
      consumedAt: null,
      createdAt: ago(3 * DAY),
    });
    t.authStore.challenges.push(challenge(ago(2 * DAY)), challenge(ago(MINUTE)));
    t.rateLimitStore.tats.set('idle-key', ago(2 * DAY).getTime());
    t.rateLimitStore.tats.set('busy-key', now.getTime() + 500);

    // Drop the email tasks so nothing else changes the rows under the tick.
    while (t.queue.discard());

    expect((await t.tick()).deleted).toEqual({
      message_bodies: 1,
      webhook_deliveries: 2,
      auth_sessions: 1,
      auth_challenges: 1,
      rate_limits: 1,
    });
    expect(t.emailStore.bodies.has(oldSent)).toBe(false);
    expect(t.emailStore.bodies.has(oldQueued)).toBe(true);
    expect(t.emailStore.bodies.has(recent)).toBe(true);
    expect(t.emailStore.rows).toHaveLength(3);
    expect(t.webhookStore.deliveries.map((d) => d.status).sort()).toEqual(['delivered', 'pending']);
    expect([...t.rateLimitStore.tats.keys()]).toEqual(['busy-key']);

    expect((await t.tick()).deleted).toEqual({
      message_bodies: 0,
      webhook_deliveries: 0,
      auth_sessions: 0,
      auth_challenges: 0,
      rate_limits: 0,
    });
  });
});

describe('failure isolation', () => {
  it('runs the other parts when one throws, and answers 500 naming it', async () => {
    const t = setup(new Date('2026-11-06T00:05:00Z'));
    const box = t.store.add(ORG, { sentToday: 5 });
    vi.spyOn(t.emailStore, 'findStalled').mockRejectedValueOnce(new Error('timeout'));

    const report = await t.tick(500);
    expect(report.failed).toEqual(['sweep']);
    expect(report.daily).toEqual({ reset: 1, resumed: 0 });
    expect(box.sentToday).toBe(0);
  });
});

/** A broadcast already sending, with one recipient in `state`. */
function addSendingBroadcast(
  t: ReturnType<typeof setup>,
  email: string,
  state: 'pending' | 'dispatching',
): string {
  const id = randomUUID();
  const at = new Date();
  t.broadcastStore.rows.push({
    id,
    orgId: ORG,
    name: email,
    status: 'sending',
    templateId: null,
    listId: null,
    subject: 'Hello',
    html: '<p>Hello</p>',
    startedAt: at,
    completedAt: null,
    createdAt: at,
    updatedAt: at,
  });
  t.broadcastStore.recipientRows.push({
    id: randomUUID(),
    orgId: ORG,
    broadcastId: id,
    contactId: null,
    email,
    properties: {},
    state,
    messageId: null,
    error: null,
    createdAt: at,
    updatedAt: at,
  });
  return id;
}
