import {
  MAX_WEBHOOK_ATTEMPTS,
  sendEmailResponseSchema,
  verifyWebhookSignature,
  webhookCreatedSchema,
  webhookDeliveryListResponseSchema,
  webhookListResponseSchema,
  webhookPayloadSchema,
  webhookSchema,
} from '@postrail/shared';
import { describe, expect, it, vi } from 'vitest';
import { GoogleApiError, GoogleOAuthError } from '../../providers/google-client';
import { createTestApp } from '../../test/app';
import { fakeGoogleClient } from '../../test/fakes';
import { WEBHOOK_RETRY_DELAYS_SECONDS } from './worker';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RECEIVER = 'https://hooks.example.com/postrail';

function setup(overrides: Parameters<typeof createTestApp>[0] = {}) {
  const sendRaw = vi.fn((_t: string, _r: string) => Promise.resolve({ id: 'gmail-1' }));
  const refreshAccessToken = vi.fn(() => Promise.resolve({ accessToken: 'a2', expiresIn: 3600 }));
  const t = createTestApp({
    google: fakeGoogleClient({ sendRaw, refreshAccessToken }),
    ...overrides,
  });
  const headers = t.authHeaders(ORG);
  const call = (method: string, path: string, body?: unknown) =>
    t.app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const mailbox = t.store.add(ORG, { email: 'sender@example.com' });
  const createWebhook = async (events = ['email.sent', 'email.failed', 'mailbox.disconnected']) => {
    const res = await call('POST', '/v1/webhooks', { url: RECEIVER, events });
    const body: unknown = await res.json();
    return webhookCreatedSchema.parse(body);
  };
  const queueEmail = async () => {
    const res = await call('POST', '/v1/emails', {
      to: 'dest@example.org',
      subject: 's',
      text: 'b',
    });
    const body: unknown = await res.json();
    return sendEmailResponseSchema.parse(body).id;
  };
  return { ...t, headers, call, mailbox, sendRaw, refreshAccessToken, createWebhook, queueEmail };
}

describe('/v1/webhooks CRUD', () => {
  it('creates an endpoint and returns the secret exactly once', async () => {
    const t = setup();
    const created = await t.createWebhook(['email.sent']);
    expect(created.secret).toMatch(/^whsec_[A-Za-z0-9_-]{32}$/);
    expect(created.events).toEqual(['email.sent']);
    expect(t.webhookStore.endpoints[0]?.secret).not.toContain(created.secret);

    const list = await t.call('GET', '/v1/webhooks');
    const listBody: unknown = await list.json();
    const { data } = webhookListResponseSchema.parse(listBody);
    expect(data).toHaveLength(1);
    expect(JSON.stringify(listBody)).not.toContain('secret');

    const one = await t.call('GET', `/v1/webhooks/${created.id}`);
    expect(webhookSchema.parse(await one.json()).id).toBe(created.id);
  });

  it('validates url and events', async () => {
    const t = setup();
    expect(
      (await t.call('POST', '/v1/webhooks', { url: 'ftp://x', events: ['email.sent'] })).status,
    ).toBe(400);
    expect((await t.call('POST', '/v1/webhooks', { url: RECEIVER, events: [] })).status).toBe(400);
    expect((await t.call('POST', '/v1/webhooks', { url: RECEIVER, events: ['nope'] })).status).toBe(
      400,
    );
  });

  it('updates, deletes and scopes to the org', async () => {
    const t = setup();
    const created = await t.createWebhook();
    const patched = await t.call('PATCH', `/v1/webhooks/${created.id}`, {
      events: ['email.failed'],
    });
    expect(webhookSchema.parse(await patched.json()).events).toEqual(['email.failed']);

    const foreign = await t.app.request(`/v1/webhooks/${created.id}`, {
      method: 'DELETE',
      headers: t.authHeaders(ORG_B),
    });
    expect(foreign.status).toBe(404);
    expect((await t.call('DELETE', `/v1/webhooks/${created.id}`)).status).toBe(204);
    expect((await t.call('GET', `/v1/webhooks/${created.id}`)).status).toBe(404);
  });
});

describe('webhook delivery', () => {
  it('delivers a signed email.sent event the receiver can verify', async () => {
    const t = setup();
    const { secret, id: endpointId } = await t.createWebhook();
    const messageId = await t.queueEmail();

    await t.queue.drain();

    expect(t.receiver.calls).toHaveLength(1);
    const call = t.receiver.calls[0];
    expect(call?.url).toBe(RECEIVER);
    expect(call?.headers['Postrail-Event']).toBe('email.sent');
    expect(
      verifyWebhookSignature({
        secret,
        body: call?.body ?? '',
        timestamp: call?.headers['Postrail-Timestamp'],
        signature: call?.headers['Postrail-Signature'],
      }),
    ).toBe(true);
    expect(
      verifyWebhookSignature({
        secret: 'wrong',
        body: call?.body ?? '',
        timestamp: call?.headers['Postrail-Timestamp'],
        signature: call?.headers['Postrail-Signature'],
      }),
    ).toBe(false);

    const payload = webhookPayloadSchema.parse(JSON.parse(call?.body ?? ''));
    expect(payload.event).toBe('email.sent');
    expect(payload.data).toMatchObject({ id: messageId, status: 'sent', to: 'dest@example.org' });
    expect(call?.headers['Postrail-Delivery-Id']).toBe(payload.id);

    const list = await t.call('GET', `/v1/webhooks/${endpointId}/deliveries`);
    const { data } = webhookDeliveryListResponseSchema.parse(await list.json());
    expect(data).toEqual([
      expect.objectContaining({
        id: payload.id,
        event: 'email.sent',
        status: 'delivered',
        attempts: 1,
        response_code: 200,
        message_id: messageId,
      }),
    ]);
  });

  it('emits email.failed and mailbox.disconnected', async () => {
    const t = setup();
    await t.createWebhook();
    t.mailbox.accessTokenEnc = null;
    t.refreshAccessToken.mockRejectedValueOnce(new GoogleOAuthError('invalid_grant', 'revoked'));
    await t.queueEmail();

    await t.queue.drain();

    const events = t.receiver.calls.map((c) => c.headers['Postrail-Event']).sort();
    expect(events).toEqual(['email.failed', 'mailbox.disconnected']);
    const disconnected = t.receiver.calls.find(
      (c) => c.headers['Postrail-Event'] === 'mailbox.disconnected',
    );
    expect(webhookPayloadSchema.parse(JSON.parse(disconnected?.body ?? '')).data).toMatchObject({
      id: t.mailbox.id,
      email: 'sender@example.com',
      status: 'disconnected',
    });
  });

  it('only notifies endpoints subscribed to the event, in the same org', async () => {
    const t = setup();
    await t.createWebhook(['email.failed']);
    await t.app.request('/v1/webhooks', {
      method: 'POST',
      headers: t.authHeaders(ORG_B),
      body: JSON.stringify({ url: RECEIVER, events: ['email.sent'] }),
    });
    await t.queueEmail();
    await t.queue.drain();
    expect(t.receiver.calls).toHaveLength(0);
  });

  it('retries non-2xx responses with backoff and gives up after 8 attempts', async () => {
    const t = setup({ webhookStatus: 503 });
    const { id: endpointId } = await t.createWebhook(['email.sent']);
    const enqueue = vi.spyOn(t.queue, 'enqueue');
    await t.queueEmail();
    await t.queue.step(); // send the email; that emits and queues the delivery

    for (let attempt = 1; attempt < MAX_WEBHOOK_ATTEMPTS; attempt++) {
      await t.queue.step();
      expect(t.webhookStore.deliveries[0]).toMatchObject({
        status: 'pending',
        attempts: attempt,
        responseCode: 503,
      });
      expect(t.webhookStore.deliveries[0]?.nextRetryAt).toBeInstanceOf(Date);
    }
    await t.queue.step();
    expect(t.webhookStore.deliveries[0]).toMatchObject({
      status: 'failed',
      attempts: MAX_WEBHOOK_ATTEMPTS,
    });
    expect(t.webhookStore.deliveries[0]?.error).toMatch(/gave up after 8 attempts/);
    expect(t.receiver.calls).toHaveLength(MAX_WEBHOOK_ATTEMPTS);
    expect(t.queue.size).toBe(0);

    const delays = enqueue.mock.calls
      .filter(([job]) => job.kind === 'deliver-webhook')
      .slice(1)
      .map(([, options]) => options.delaySeconds);
    expect(delays).toEqual(WEBHOOK_RETRY_DELAYS_SECONDS);

    const list = await t.call('GET', `/v1/webhooks/${endpointId}/deliveries?limit=5`);
    expect(webhookDeliveryListResponseSchema.parse(await list.json()).data[0]?.status).toBe(
      'failed',
    );
  });

  it('treats a network error as retryable and succeeds on the next try', async () => {
    const t = setup();
    await t.createWebhook(['email.sent']);
    t.receiver.state.throwNext = true;
    await t.queueEmail();
    await t.queue.step();
    await t.queue.step();
    expect(t.webhookStore.deliveries[0]).toMatchObject({
      status: 'pending',
      attempts: 1,
      error: 'fetch failed',
    });
    await t.queue.step();
    expect(t.webhookStore.deliveries[0]).toMatchObject({
      status: 'delivered',
      attempts: 2,
      error: null,
    });
  });

  it('never delivers twice for a duplicated task and fails cleanly when the endpoint is gone', async () => {
    const t = setup();
    const { id: endpointId } = await t.createWebhook(['email.sent']);
    await t.queueEmail();
    await t.queue.step();
    const deliveryId = t.webhookStore.deliveries[0]?.id ?? '';
    const job = { orgId: ORG, deliveryId };

    const outcomes = await Promise.all([
      t.webhookWorker.processDelivery(job),
      t.webhookWorker.processDelivery(job),
    ]);
    expect(outcomes.sort()).toEqual(['delivered', 'skipped']);
    expect(t.receiver.calls).toHaveLength(1);
    expect(await t.webhookWorker.processDelivery(job)).toBe('skipped');

    // Clear the delivery task that is still queued (it will be skipped: already delivered).
    await t.queue.drain();
    await t.queueEmail();
    await t.queue.step();
    await t.call('DELETE', `/v1/webhooks/${endpointId}`);
    expect(t.webhookStore.deliveries).toHaveLength(2);
    await t.queue.step();
    expect(t.webhookStore.deliveries[1]).toMatchObject({
      status: 'failed',
      error: 'endpoint no longer exists',
    });
  });

  it('fails a permanent Gmail error once and reports it through email.failed', async () => {
    const t = setup();
    await t.createWebhook(['email.failed']);
    t.sendRaw.mockRejectedValueOnce(new GoogleApiError(400, 'gmail.send', 'Invalid To header'));
    await t.queueEmail();
    await t.queue.drain();
    expect(t.receiver.calls).toHaveLength(1);
    expect(
      webhookPayloadSchema.parse(JSON.parse(t.receiver.calls[0]?.body ?? '')).data,
    ).toMatchObject({
      status: 'failed',
      error: 'google api gmail.send responded 400: Invalid To header',
    });
  });
});
