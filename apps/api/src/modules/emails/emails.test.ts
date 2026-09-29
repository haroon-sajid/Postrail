import {
  emailListResponseSchema,
  emailSchema,
  errorResponseSchema,
  sendEmailBatchResponseSchema,
  sendEmailResponseSchema,
} from '@postrail/shared';
import { describe, expect, it, vi } from 'vitest';
import { GoogleApiError } from '../../providers/google-client';
import { createTestApp } from '../../test/app';
import { fakeGoogleClient, inMemoryEmailStore, inMemoryMailboxStore } from '../../test/fakes';

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const basic = { to: 'dest@example.org', subject: 'Hello', text: 'hi there' };

function setup() {
  const store = inMemoryMailboxStore();
  const emails = inMemoryEmailStore();
  const sendRaw = vi.fn((_token: string, _raw: string) => Promise.resolve({ id: 'gmail-1' }));
  const google = fakeGoogleClient({ sendRaw });
  const t = createTestApp({ store, emails, google });
  const headers = t.authHeaders(ORG_A);
  const post = (path: string, body: unknown, extra: Record<string, string> = {}) =>
    t.app.request(path, {
      method: 'POST',
      headers: { ...headers, ...extra },
      body: JSON.stringify(body),
    });
  return { ...t, headers, post, sendRaw, mailboxStore: store, emailStore: emails };
}

async function json<T>(res: Response, parse: (body: unknown) => T): Promise<T> {
  const body: unknown = await res.json();
  return parse(body);
}

const mimeOfLastSend = (sendRaw: ReturnType<typeof vi.fn>) =>
  Buffer.from((sendRaw.mock.calls.at(-1)?.[1] as string | undefined) ?? '', 'base64url').toString(
    'utf8',
  );

describe('POST /v1/emails', () => {
  it('queues the message and returns before anything is sent', async () => {
    const t = setup();
    const mailbox = t.mailboxStore.add(ORG_A, { email: 'sender@example.com' });

    // The first request through a fresh app pays for route compilation; the latency
    // promise is about steady state, so warm the auth and router paths once.
    await t.app.request('/v1/mailboxes', { headers: t.headers });

    const started = performance.now();
    const res = await t.post('/v1/emails', basic);
    const elapsedMs = performance.now() - started;

    expect(res.status).toBe(201);
    const body = await json(res, (b) => sendEmailResponseSchema.parse(b));
    expect(body.status).toBe('queued');
    expect(elapsedMs).toBeLessThan(100);
    expect(t.sendRaw).not.toHaveBeenCalled();
    expect(t.queue.taskIds).toEqual([body.id]);

    expect(t.emailStore.rows[0]).toMatchObject({
      id: body.id,
      orgId: ORG_A,
      mailboxId: mailbox.id,
      toEmail: 'dest@example.org',
      fromEmail: 'sender@example.com',
      subject: 'Hello',
      status: 'queued',
      attempts: 0,
    });
    expect(t.emailStore.bodies.get(body.id)).toMatchObject({ text: 'hi there', html: null });
  });

  it('delivers through the worker, records the result and keeps the body for preview', async () => {
    const t = setup();
    const mailbox = t.mailboxStore.add(ORG_A, { email: 'sender@example.com' });
    const { id } = await json(await t.post('/v1/emails', basic), (b) =>
      sendEmailResponseSchema.parse(b),
    );

    await t.queue.drain();

    expect(t.sendRaw).toHaveBeenCalledTimes(1);
    expect(t.emailStore.rows[0]).toMatchObject({
      id,
      status: 'sent',
      providerMessageId: 'gmail-1',
      attempts: 1,
      error: null,
    });
    expect(t.emailStore.rows[0]?.sentAt).toBeInstanceOf(Date);
    expect(t.emailStore.bodies.has(id)).toBe(true);
    expect(mailbox.sentToday).toBe(1);
    const mime = mimeOfLastSend(t.sendRaw);
    expect(mime).toContain('From: sender@example.com');
    expect(mime).toContain('To: dest@example.org');
  });

  it('passes reply_to and custom headers through to the provider', async () => {
    const t = setup();
    t.mailboxStore.add(ORG_A);
    await t.post('/v1/emails', {
      ...basic,
      reply_to: 'r@example.org',
      headers: { 'X-Campaign': 'q4' },
    });
    await t.queue.drain();
    const mime = mimeOfLastSend(t.sendRaw);
    expect(mime).toContain('Reply-To: r@example.org');
    expect(mime).toContain('X-Campaign: q4');
  });

  it('records a permanent provider failure without retrying', async () => {
    const t = setup();
    t.mailboxStore.add(ORG_A);
    t.sendRaw.mockRejectedValueOnce(new GoogleApiError(403, 'gmail.send'));

    await t.post('/v1/emails', basic);
    await t.queue.drain();

    expect(t.emailStore.rows[0]).toMatchObject({
      status: 'failed',
      error: 'google api gmail.send responded 403',
      attempts: 1,
    });
    expect(t.queue.size).toBe(0);
    expect(t.mailboxStore.rows[0]?.sentToday).toBe(0);
  });

  it('validates the body', async () => {
    const t = setup();
    for (const body of [{ to: 'nope' }, { to: 'a@b.co' }, { to: 'a@b.co', subject: 'x' }]) {
      const res = await t.post('/v1/emails', body);
      expect(res.status).toBe(400);
      expect((await json(res, (b) => errorResponseSchema.parse(b))).error.code).toBe(
        'VALIDATION_ERROR',
      );
    }
  });

  describe('mailbox selection', () => {
    it('uses the from mailbox when given', async () => {
      const t = setup();
      t.mailboxStore.add(ORG_A, { email: 'a@example.com', sentToday: 0 });
      const b = t.mailboxStore.add(ORG_A, { email: 'b@example.com', sentToday: 50 });
      const res = await t.post('/v1/emails', { ...basic, from: 'b@example.com' });
      expect(res.status).toBe(201);
      expect(t.emailStore.rows[0]?.mailboxId).toBe(b.id);
    });

    it('otherwise picks the active mailbox with the fewest sends under its limit', async () => {
      const t = setup();
      t.mailboxStore.add(ORG_A, { email: 'full@example.com', sentToday: 400, dailyLimit: 400 });
      t.mailboxStore.add(ORG_A, { email: 'paused@example.com', sentToday: 0, status: 'paused' });
      t.mailboxStore.add(ORG_A, { email: 'busy@example.com', sentToday: 10 });
      const quiet = t.mailboxStore.add(ORG_A, { email: 'quiet@example.com', sentToday: 3 });
      t.mailboxStore.add(ORG_B, { email: 'other-org@example.com', sentToday: 0 });

      await t.post('/v1/emails', basic);
      expect(t.emailStore.rows[0]?.mailboxId).toBe(quiet.id);
    });

    it('fails with NO_MAILBOX when nothing qualifies or from is unknown', async () => {
      const t = setup();
      t.mailboxStore.add(ORG_A, { email: 'full@example.com', sentToday: 400, dailyLimit: 400 });

      const none = await t.post('/v1/emails', basic);
      expect(none.status).toBe(422);
      expect((await json(none, (b) => errorResponseSchema.parse(b))).error.code).toBe('NO_MAILBOX');

      const unknown = await t.post('/v1/emails', { ...basic, from: 'nobody@example.com' });
      expect(unknown.status).toBe(422);
      expect(t.emailStore.rows).toHaveLength(0);
    });
  });

  describe('idempotency', () => {
    it('returns the original message for a repeated Idempotency-Key without queueing again', async () => {
      const t = setup();
      t.mailboxStore.add(ORG_A);

      const first = await t.post('/v1/emails', basic, { 'idempotency-key': 'order-42' });
      const second = await t.post('/v1/emails', basic, { 'idempotency-key': 'order-42' });
      expect(first.status).toBe(201);
      expect(second.status).toBe(200);
      const a = await json(first, (b) => sendEmailResponseSchema.parse(b));
      const b = await json(second, (b) => sendEmailResponseSchema.parse(b));
      expect(b).toEqual(a);
      expect(t.emailStore.rows).toHaveLength(1);
      expect(t.queue.size).toBe(1);

      await t.queue.drain();
      const third = await t.post('/v1/emails', basic, { 'idempotency-key': 'order-42' });
      expect(await json(third, (b) => sendEmailResponseSchema.parse(b))).toEqual({
        id: a.id,
        status: 'sent',
      });
      expect(t.sendRaw).toHaveBeenCalledTimes(1);
    });

    it('scopes keys to the org', async () => {
      const t = setup();
      t.mailboxStore.add(ORG_A);
      t.mailboxStore.add(ORG_B);
      await t.post('/v1/emails', basic, { 'idempotency-key': 'k' });
      const other = await t.app.request('/v1/emails', {
        method: 'POST',
        headers: { ...t.authHeaders(ORG_B), 'idempotency-key': 'k' },
        body: JSON.stringify(basic),
      });
      expect(other.status).toBe(201);
      expect(t.emailStore.rows).toHaveLength(2);
    });
  });

  describe('suppression', () => {
    it('refuses suppressed recipients before touching a mailbox', async () => {
      const t = setup();
      t.mailboxStore.add(ORG_A);
      t.emailStore.suppress(ORG_A, 'Dest@Example.org');

      const res = await t.post('/v1/emails', basic);
      expect(res.status).toBe(422);
      expect((await json(res, (b) => errorResponseSchema.parse(b))).error.code).toBe('SUPPRESSED');
      expect(t.emailStore.rows).toHaveLength(0);
      expect(t.queue.size).toBe(0);
    });

    it('only applies within the org', async () => {
      const t = setup();
      t.mailboxStore.add(ORG_A);
      t.emailStore.suppress(ORG_B, basic.to);
      expect((await t.post('/v1/emails', basic)).status).toBe(201);
    });
  });

  describe('templates', () => {
    it('renders subject and html with escaped variables', async () => {
      const t = setup();
      t.mailboxStore.add(ORG_A);
      t.emailStore.addTemplate(ORG_A);

      const res = await t.post('/v1/emails', {
        to: basic.to,
        template: 'welcome',
        variables: { name: '<Ada>', code: 1234 },
      });
      expect(res.status).toBe(201);
      expect(t.emailStore.rows[0]?.subject).toBe('Welcome <Ada>');
      await t.queue.drain();
      const mime = mimeOfLastSend(t.sendRaw);
      const html = Buffer.from(
        mime.split('\r\n\r\n')[1]?.replace(/\r\n/g, '') ?? '',
        'base64',
      ).toString();
      expect(html).toBe('<p>Hi &#60;Ada&#62;, your code is 1234</p>');
    });

    it('rejects missing variables, unknown templates and mixing template with a body', async () => {
      const t = setup();
      t.mailboxStore.add(ORG_A);
      t.emailStore.addTemplate(ORG_A);

      const missing = await t.post('/v1/emails', {
        to: basic.to,
        template: 'welcome',
        variables: { name: 'x' },
      });
      expect(missing.status).toBe(400);
      expect((await json(missing, (b) => errorResponseSchema.parse(b))).error.message).toContain(
        'code',
      );

      expect((await t.post('/v1/emails', { to: basic.to, template: 'nope' })).status).toBe(404);
      expect((await t.post('/v1/emails', { ...basic, template: 'welcome' })).status).toBe(400);
    });
  });
});

describe('POST /v1/emails/batch', () => {
  it('caps the batch at 100 and requires at least one', async () => {
    const t = setup();
    const tooMany = await t.post('/v1/emails/batch', { emails: Array(101).fill(basic) });
    expect(tooMany.status).toBe(400);
    expect((await t.post('/v1/emails/batch', { emails: [] })).status).toBe(400);
  });

  it('reports per-item results and keeps going after failures', async () => {
    const t = setup();
    t.mailboxStore.add(ORG_A);
    t.emailStore.suppress(ORG_A, 'blocked@example.org');

    const res = await t.post('/v1/emails/batch', {
      emails: [
        basic,
        { ...basic, to: 'blocked@example.org' },
        { ...basic, idempotency_key: 'dup' },
        { ...basic, idempotency_key: 'dup' },
      ],
    });
    expect(res.status).toBe(200);
    const { results } = await json(res, (b) => sendEmailBatchResponseSchema.parse(b));
    expect(results).toHaveLength(4);
    expect(results[0]).toMatchObject({ index: 0, status: 'queued' });
    expect(results[1]).toMatchObject({ index: 1, error: { code: 'SUPPRESSED' } });
    expect(results[2]).toMatchObject({ index: 2, status: 'queued' });
    expect(results[3]).toMatchObject({ index: 3, id: (results[2] as { id: string }).id });
    expect(t.queue.size).toBe(2);

    await t.queue.drain();
    expect(t.sendRaw).toHaveBeenCalledTimes(2);
  });

  it('accepts exactly 100 items', async () => {
    const t = setup();
    t.mailboxStore.add(ORG_A, { dailyLimit: 1000 });
    const res = await t.post('/v1/emails/batch', { emails: Array(100).fill(basic) });
    expect(res.status).toBe(200);
    expect((await json(res, (b) => sendEmailBatchResponseSchema.parse(b))).results).toHaveLength(
      100,
    );
  });
});

describe('GET /v1/emails', () => {
  it('returns one email by id, scoped to the org', async () => {
    const t = setup();
    t.mailboxStore.add(ORG_A);
    const created = await json(await t.post('/v1/emails', basic), (b) =>
      sendEmailResponseSchema.parse(b),
    );
    await t.queue.drain();

    const res = await t.app.request(`/v1/emails/${created.id}`, { headers: t.headers });
    expect(res.status).toBe(200);
    const email = await json(res, (b) => emailSchema.parse(b));
    expect(email).toMatchObject({ id: created.id, to: basic.to, status: 'sent', attempts: 1 });
    expect(JSON.stringify(email)).not.toMatch(/html|text|token/i);

    const foreign = await t.app.request(`/v1/emails/${created.id}`, {
      headers: t.authHeaders(ORG_B),
    });
    expect(foreign.status).toBe(404);
  });

  it('paginates newest first with an opaque cursor', async () => {
    const t = setup();
    t.mailboxStore.add(ORG_A);
    for (let i = 0; i < 5; i++) await t.post('/v1/emails', { ...basic, subject: `m${i}` });

    const first = await json(
      await t.app.request('/v1/emails?limit=2', { headers: t.headers }),
      (b) => emailListResponseSchema.parse(b),
    );
    expect(first.data.map((e) => e.subject)).toEqual(['m4', 'm3']);
    expect(first.next_cursor).toBeTruthy();

    const second = await json(
      await t.app.request(`/v1/emails?limit=2&cursor=${first.next_cursor ?? ''}`, {
        headers: t.headers,
      }),
      (b) => emailListResponseSchema.parse(b),
    );
    expect(second.data.map((e) => e.subject)).toEqual(['m2', 'm1']);

    const third = await json(
      await t.app.request(`/v1/emails?limit=2&cursor=${second.next_cursor ?? ''}`, {
        headers: t.headers,
      }),
      (b) => emailListResponseSchema.parse(b),
    );
    expect(third.data.map((e) => e.subject)).toEqual(['m0']);
    expect(third.next_cursor).toBeNull();

    expect((await t.app.request('/v1/emails?cursor=garbage', { headers: t.headers })).status).toBe(
      400,
    );
    expect((await t.app.request('/v1/emails?limit=1000', { headers: t.headers })).status).toBe(400);
  });
});
