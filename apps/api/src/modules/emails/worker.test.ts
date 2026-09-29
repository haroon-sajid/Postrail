import { sendEmailResponseSchema } from '@postrail/shared';
import { describe, expect, it, vi } from 'vitest';
import { GoogleApiError, GoogleOAuthError } from '../../providers/google-client';
import { createTestApp } from '../../test/app';
import { fakeGoogleClient, inMemoryEmailStore, inMemoryMailboxStore } from '../../test/fakes';
import { MAX_SEND_ATTEMPTS, RETRY_DELAYS_SECONDS, SENDING_LEASE_MS } from './worker';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const basic = { to: 'dest@example.org', subject: 'Hello', text: 'hi' };

function setup() {
  const store = inMemoryMailboxStore();
  const emails = inMemoryEmailStore();
  const sendRaw = vi.fn((_token: string, _raw: string) => Promise.resolve({ id: 'gmail-1' }));
  const refreshAccessToken = vi.fn(() =>
    Promise.resolve({ accessToken: 'access-2', expiresIn: 3600 }),
  );
  const google = fakeGoogleClient({ sendRaw, refreshAccessToken });
  const clock = { now: new Date('2026-09-29T12:00:00Z') };
  const t = createTestApp({ store, emails, google, now: () => clock.now });
  const mailbox = store.add(ORG, { email: 'sender@example.com' });

  async function queueOne() {
    const res = await t.app.request('/v1/emails', {
      method: 'POST',
      headers: t.authHeaders(ORG),
      body: JSON.stringify(basic),
    });
    const body: unknown = await res.json();
    return sendEmailResponseSchema.parse(body).id;
  }

  return {
    ...t,
    sendRaw,
    refreshAccessToken,
    mailbox,
    clock,
    mailboxStore: store,
    emailStore: emails,
    queueOne,
  };
}

describe('email worker retry policy', () => {
  it.each([429, 500, 503])(
    'retries a %s from Gmail with backoff and a fresh task id',
    async (status) => {
      const t = setup();
      t.sendRaw.mockRejectedValueOnce(new GoogleApiError(status, 'gmail.send'));
      const id = await t.queueOne();

      await t.queue.step();

      expect(t.emailStore.rows[0]).toMatchObject({
        status: 'queued',
        attempts: 1,
        error: `google api gmail.send responded ${status}`,
      });
      expect(t.emailStore.bodies.has(id)).toBe(true);
      expect(t.queue.taskIds).toEqual([`${id}-1`]);

      await t.queue.step();
      expect(t.emailStore.rows[0]).toMatchObject({ status: 'sent', attempts: 2, error: null });
      expect(t.sendRaw).toHaveBeenCalledTimes(2);
    },
  );

  it(`gives up after ${MAX_SEND_ATTEMPTS} attempts`, async () => {
    const t = setup();
    t.sendRaw.mockRejectedValue(new GoogleApiError(503, 'gmail.send'));
    const id = await t.queueOne();

    for (let attempt = 1; attempt < MAX_SEND_ATTEMPTS; attempt++) {
      await t.queue.step();
      expect(t.emailStore.rows[0]).toMatchObject({ status: 'queued', attempts: attempt });
      expect(t.queue.taskIds).toEqual([`${id}-${attempt}`]);
    }
    await t.queue.step();

    expect(t.emailStore.rows[0]).toMatchObject({ status: 'failed', attempts: MAX_SEND_ATTEMPTS });
    expect(t.emailStore.rows[0]?.error).toMatch(/gave up after 5 attempts/);
    expect(t.emailStore.bodies.has(id)).toBe(false);
    expect(t.queue.size).toBe(0);
    expect(t.sendRaw).toHaveBeenCalledTimes(MAX_SEND_ATTEMPTS);
    expect(t.mailbox.sentToday).toBe(0);
  });

  it('uses growing delays between attempts', async () => {
    const t = setup();
    t.sendRaw.mockRejectedValue(new GoogleApiError(500, 'gmail.send'));
    const enqueue = vi.spyOn(t.queue, 'enqueue');
    await t.queueOne();

    for (let i = 0; i < RETRY_DELAYS_SECONDS.length; i++) await t.queue.step();

    const delays = enqueue.mock.calls.slice(1).map(([, options]) => options.delaySeconds);
    expect(delays).toEqual(RETRY_DELAYS_SECONDS);
  });

  it('treats network failures as transient', async () => {
    const t = setup();
    t.sendRaw.mockRejectedValueOnce(
      Object.assign(new TypeError('fetch failed'), {
        cause: Object.assign(new Error('x'), { code: 'ECONNRESET' }),
      }),
    );
    await t.queueOne();
    await t.queue.step();
    expect(t.emailStore.rows[0]).toMatchObject({ status: 'queued', attempts: 1 });
    expect(t.queue.size).toBe(1);
  });

  it('fails immediately on a permanent 4xx', async () => {
    const t = setup();
    t.sendRaw.mockRejectedValueOnce(new GoogleApiError(400, 'gmail.send'));
    await t.queueOne();
    await t.queue.step();
    expect(t.emailStore.rows[0]).toMatchObject({ status: 'failed', attempts: 1 });
    expect(t.queue.size).toBe(0);
  });

  it('fails immediately on invalid_grant and marks the mailbox disconnected', async () => {
    const t = setup();
    // Force a refresh so the provider hits the token endpoint.
    t.mailbox.accessTokenEnc = null;
    t.refreshAccessToken.mockRejectedValueOnce(new GoogleOAuthError('invalid_grant', 'revoked'));
    await t.queueOne();
    await t.queue.step();

    expect(t.mailbox.status).toBe('disconnected');
    expect(t.emailStore.rows[0]).toMatchObject({
      status: 'failed',
      error: 'mailbox disconnected; reconnect it',
      attempts: 1,
    });
    expect(t.sendRaw).not.toHaveBeenCalled();
    expect(t.queue.size).toBe(0);
  });

  it('fails when the mailbox is gone or not active', async () => {
    const t = setup();
    await t.queueOne();
    t.mailbox.status = 'paused';
    await t.queue.step();
    expect(t.emailStore.rows[0]).toMatchObject({ status: 'failed', error: 'mailbox is paused' });
  });
});

describe('email worker idempotency', () => {
  it('never sends twice when the same job is delivered twice', async () => {
    const t = setup();
    const id = await t.queueOne();
    const job = { orgId: ORG, messageId: id };

    const [first, second] = await Promise.all([
      t.worker.processSendJob(job),
      t.worker.processSendJob(job),
    ]);
    expect([first, second].sort()).toEqual(['sent', 'skipped']);
    expect(t.sendRaw).toHaveBeenCalledTimes(1);

    expect(await t.worker.processSendJob(job)).toBe('skipped');
    expect(t.sendRaw).toHaveBeenCalledTimes(1);
    expect(t.emailStore.rows[0]).toMatchObject({ status: 'sent', attempts: 1 });
  });

  it('deduplicates the task itself at the queue', async () => {
    const t = setup();
    const id = await t.queueOne();
    await t.queue.enqueue({ kind: 'send-email', orgId: ORG, messageId: id }, { taskId: id });
    expect(t.queue.size).toBe(1);
    await t.queue.step();
    expect(t.sendRaw).toHaveBeenCalledTimes(1);
  });

  it('skips a message another worker is sending, until its lease expires', async () => {
    const t = setup();
    const id = await t.queueOne();
    const row = t.emailStore.rows[0];
    if (!row) throw new Error('no row');
    Object.assign(row, { status: 'sending', updatedAt: t.clock.now });

    expect(await t.worker.processSendJob({ orgId: ORG, messageId: id })).toBe('skipped');
    expect(t.sendRaw).not.toHaveBeenCalled();

    t.clock.now = new Date(t.clock.now.getTime() + SENDING_LEASE_MS + 1);
    expect(await t.worker.processSendJob({ orgId: ORG, messageId: id })).toBe('sent');
    expect(t.sendRaw).toHaveBeenCalledTimes(1);
  });

  it('ignores jobs for messages that do not belong to the org', async () => {
    const t = setup();
    const id = await t.queueOne();
    const outcome = await t.worker.processSendJob({
      orgId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      messageId: id,
    });
    expect(outcome).toBe('skipped');
    expect(t.sendRaw).not.toHaveBeenCalled();
  });
});
