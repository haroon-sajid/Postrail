import {
  broadcastListResponseSchema,
  broadcastRecipientsResponseSchema,
  broadcastSchema,
  errorResponseSchema,
} from '@postrail/shared';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../../test/app';
import { DISPATCH_LEASE_MS } from './worker';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UNSUBSCRIBE = /href="(http:\/\/localhost:8080\/api\/unsubscribe\?token=[^"]+)"/;

async function errorOf(res: Response) {
  return errorResponseSchema.parse(await res.json()).error;
}

/**
 * A workspace with a template, a list of `contacts` people (a1@, a2@, ...) and one mailbox.
 * With the default limit of 10 a broadcast has room for 8 a day (80%).
 */
async function setup(options: { contacts?: number; dailyLimit?: number } = {}) {
  const clock = { at: Date.now() };
  const t = createTestApp({ now: () => new Date(clock.at) });
  const headers = t.authHeaders(ORG);
  const call = (method: string, path: string, body?: unknown, as = headers) =>
    t.app.request(path, {
      method,
      headers: as,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const json = async <T>(res: Response) => (await res.json()) as T;

  const mailbox = t.store.add(ORG, {
    email: 'sender@example.com',
    dailyLimit: options.dailyLimit ?? 10,
  });
  const template = await json<{ id: string }>(
    await call('POST', '/v1/templates', {
      slug: 'news',
      subject: 'News for {{first_name}}',
      html: '<p>Hi {{first_name}}</p>',
    }),
  );
  const list = await json<{ id: string }>(
    await call('POST', '/v1/contact-lists', { name: 'Newsletter' }),
  );
  const count = options.contacts ?? 3;
  if (count > 0) {
    await call('POST', '/v1/contacts/import', {
      contacts: Array.from({ length: count }, (_, i) => ({
        email: `a${String(i + 1).padStart(2, '0')}@example.com`,
        properties: { first_name: `Person ${i + 1}` },
      })),
      list_id: list.id,
    });
  }

  const draft = async (name = 'October news') =>
    broadcastSchema.parse(
      await (
        await call('POST', '/v1/broadcasts', {
          name,
          template_id: template.id,
          list_id: list.id,
        })
      ).json(),
    );
  const get = async (id: string) =>
    broadcastSchema.parse(await (await call('GET', `/v1/broadcasts/${id}`)).json());
  const send = (id: string) => call('POST', `/v1/broadcasts/${id}/send`);
  /** Creates a draft, starts it and runs the queue until nothing is left to do today. */
  const sendAndDrain = async () => {
    const created = await draft();
    expect((await send(created.id)).status).toBe(200);
    await t.queue.drain();
    return get(created.id);
  };
  /** What the daily Cloud Scheduler job does at midnight UTC. */
  const nextDay = async () => {
    const res = await call(
      'POST',
      '/internal/cron/reset-daily-counters',
      undefined,
      t.internalHeaders,
    );
    await t.queue.drain();
    return json<{ reset: number; resumed: number }>(res);
  };
  const recipients = async (id: string, query = '') =>
    broadcastRecipientsResponseSchema.parse(
      await (await call('GET', `/v1/broadcasts/${id}/recipients${query}`)).json(),
    );
  const htmlOf = (messageId: string) => t.emailStore.bodies.get(messageId)?.html ?? '';

  return {
    ...t,
    clock,
    headers,
    call,
    mailbox,
    template,
    list,
    draft,
    get,
    send,
    sendAndDrain,
    nextDay,
    recipients,
    htmlOf,
  };
}

describe('/v1/broadcasts drafts', () => {
  it('creates a draft that names its template and list and counts who it would reach', async () => {
    const t = await setup({ contacts: 3 });
    const created = await t.draft();
    expect(created).toMatchObject({
      name: 'October news',
      status: 'draft',
      template: { id: t.template.id, slug: 'news' },
      list: { id: t.list.id, name: 'Newsletter' },
      subject: null,
      stats: { total: 3, pending: 0, queued: 0, sent: 0, failed: 0, skipped: 0 },
      started_at: null,
      completed_at: null,
    });
    // Nothing is sent by creating one.
    expect(t.emailStore.rows).toHaveLength(0);
    expect(t.queue.size).toBe(0);

    const all = broadcastListResponseSchema.parse(
      await (await t.call('GET', '/v1/broadcasts')).json(),
    );
    expect(all.data.map((b) => b.id)).toEqual([created.id]);
  });

  it('only accepts a template and a list from the same workspace', async () => {
    const t = await setup();
    const stray = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const badTemplate = await t.call('POST', '/v1/broadcasts', {
      name: 'x',
      template_id: stray,
      list_id: t.list.id,
    });
    expect(badTemplate.status).toBe(400);
    expect((await errorOf(badTemplate)).message).toMatch(/template_id/);
    const badList = await t.call('POST', '/v1/broadcasts', {
      name: 'x',
      template_id: t.template.id,
      list_id: stray,
    });
    expect((await errorOf(badList)).message).toMatch(/list_id/);
    expect(t.broadcastStore.rows).toHaveLength(0);
  });

  it('can be renamed and deleted while it is a draft', async () => {
    const t = await setup();
    const created = await t.draft();
    const renamed = await t.call('PATCH', `/v1/broadcasts/${created.id}`, { name: 'November' });
    expect(broadcastSchema.parse(await renamed.json()).name).toBe('November');
    expect((await t.call('PATCH', `/v1/broadcasts/${created.id}`, {})).status).toBe(400);
    expect((await t.call('DELETE', `/v1/broadcasts/${created.id}`)).status).toBe(204);
    expect((await t.call('GET', `/v1/broadcasts/${created.id}`)).status).toBe(404);
  });

  it('keeps broadcasts apart per org', async () => {
    const t = await setup();
    const created = await t.draft();
    const other = t.authHeaders(ORG_B);
    const list = await t.call('GET', '/v1/broadcasts', undefined, other);
    expect(broadcastListResponseSchema.parse(await list.json()).data).toEqual([]);
    for (const [method, path] of [
      ['GET', ''],
      ['POST', '/send'],
      ['POST', '/cancel'],
      ['DELETE', ''],
      ['GET', '/recipients'],
    ] as const) {
      const res = await t.call(method, `/v1/broadcasts/${created.id}${path}`, undefined, other);
      expect(res.status).toBe(404);
    }
  });

  it('lets a member draft from the dashboard but keeps sending for admins', async () => {
    const t = await setup();
    const member = t.sessionHeaders(t.member(ORG, 'member'));
    const admin = t.sessionHeaders(t.member(ORG, 'admin'));
    const base = `/app/orgs/${ORG}/broadcasts`;
    const res = await t.call(
      'POST',
      base,
      { name: 'From the dashboard', template_id: t.template.id, list_id: t.list.id },
      member,
    );
    expect(res.status).toBe(201);
    const { id } = broadcastSchema.parse(await res.json());
    expect((await t.call('POST', `${base}/${id}/send`, undefined, member)).status).toBe(403);
    expect((await t.call('DELETE', `${base}/${id}`, undefined, member)).status).toBe(403);
    expect((await t.call('POST', `${base}/${id}/send`, undefined, admin)).status).toBe(200);
    expect(t.audit.entries.at(-1)).toMatchObject({
      action: 'broadcast.started',
      target: id,
      meta: { recipients: 3 },
    });
  });
});

describe('sending a broadcast', () => {
  it('queues one message per contact, rendered with that contact’s properties', async () => {
    const t = await setup({ contacts: 3 });
    const created = await t.draft();
    const started = await t.send(created.id);
    expect(started.status).toBe(200);
    expect(broadcastSchema.parse(await started.json())).toMatchObject({
      status: 'sending',
      subject: 'News for {{first_name}}',
      stats: { total: 3, pending: 3 },
    });
    // The request only copied the list and queued a job: no message exists yet.
    expect(t.emailStore.rows).toHaveLength(0);

    await t.queue.drain();
    const done = await t.get(created.id);
    expect(done.status).toBe('sent');
    expect(done.completed_at).not.toBeNull();
    expect(done.stats).toEqual({ total: 3, pending: 0, queued: 0, sent: 3, failed: 0, skipped: 0 });

    expect(t.emailStore.rows.map((r) => [r.toEmail, r.subject, r.status])).toEqual([
      ['a01@example.com', 'News for Person 1', 'sent'],
      ['a02@example.com', 'News for Person 2', 'sent'],
      ['a03@example.com', 'News for Person 3', 'sent'],
    ]);
    expect(t.htmlOf(t.emailStore.rows[0]?.id ?? '')).toContain('<p>Hi Person 1</p>');
  });

  it('paces over days: at most 80% of the mailbox limit, then the daily reset resumes it', async () => {
    const t = await setup({ contacts: 12, dailyLimit: 10 });
    const day1 = await t.sendAndDrain();
    expect(day1.status).toBe('sending');
    expect(day1.stats).toMatchObject({ total: 12, sent: 8, pending: 4 });
    expect(t.mailbox.sentToday).toBe(8);

    // The other 20% is still there for application email on the same day.
    const reset = await t.call('POST', '/v1/emails', {
      to: 'user@example.org',
      subject: 'Reset your password',
      text: 'link',
    });
    expect(reset.status).toBe(201);
    await t.queue.drain();
    expect(t.mailbox.sentToday).toBe(9);

    expect(await t.nextDay()).toEqual({ reset: 1, resumed: 1 });
    const day2 = await t.get(day1.id);
    expect(day2.status).toBe('sent');
    expect(day2.stats).toMatchObject({ sent: 12, pending: 0 });
    // Nobody got it twice.
    const sentTo = t.emailStore.rows
      .filter((r) => r.subject.startsWith('News'))
      .map((r) => r.toEmail);
    expect(new Set(sentTo).size).toBe(12);
    expect(sentTo).toHaveLength(12);

    // Finished broadcasts are left alone by later resets.
    expect((await t.nextDay()).resumed).toBe(0);
  });

  it('counts messages that are queued but not yet sent against the room', async () => {
    const t = await setup({ contacts: 12, dailyLimit: 10 });
    const created = await t.draft();
    await t.send(created.id);
    // One dispatch round, without letting the email worker send anything yet.
    await t.queue.step();
    expect(t.mailbox.sentToday).toBe(0);
    expect((await t.get(created.id)).stats).toMatchObject({ queued: 8, pending: 4 });

    // A second round before any of those are delivered must not queue the other four.
    const again = await t.call(
      'POST',
      '/internal/tasks/dispatch-broadcast',
      { kind: 'dispatch-broadcast', orgId: ORG, broadcastId: created.id },
      t.internalHeaders,
    );
    expect(await again.json()).toEqual({ outcome: 'waiting' });
    expect(t.emailStore.rows).toHaveLength(8);
  });

  it('spreads recipients across mailboxes instead of filling one', async () => {
    const t = await setup({ contacts: 10, dailyLimit: 10 });
    t.store.add(ORG, { email: 'second@example.com', dailyLimit: 10 });
    const done = await t.sendAndDrain();
    expect(done.status).toBe('sent');
    const from = t.emailStore.rows.map((r) => r.fromEmail);
    expect(from.filter((f) => f === 'sender@example.com')).toHaveLength(5);
    expect(from.filter((f) => f === 'second@example.com')).toHaveLength(5);
  });

  it('waits, without failing anyone, when no mailbox has room', async () => {
    const t = await setup({ contacts: 2, dailyLimit: 10 });
    t.mailbox.sentToday = 8;
    const waiting = await t.sendAndDrain();
    expect(waiting.status).toBe('sending');
    expect(waiting.stats).toMatchObject({ pending: 2, failed: 0 });
    expect(t.emailStore.rows).toHaveLength(0);

    await t.nextDay();
    expect((await t.get(waiting.id)).status).toBe('sent');
  });

  it('freezes the template and the list when sending starts', async () => {
    const t = await setup({ contacts: 10, dailyLimit: 10 });
    const day1 = await t.sendAndDrain();
    expect(day1.stats).toMatchObject({ sent: 8, pending: 2 });

    await t.call('PATCH', `/v1/templates/${t.template.id}`, {
      subject: 'Changed for {{first_name}}',
    });
    await t.call('POST', '/v1/contacts', {
      email: 'late@example.com',
      properties: { first_name: 'Late' },
      list_ids: [t.list.id],
    });
    await t.nextDay();

    const done = await t.get(day1.id);
    expect(done.stats.total).toBe(10);
    expect(done.subject).toBe('News for {{first_name}}');
    expect(t.emailStore.rows.every((r) => r.subject.startsWith('News for'))).toBe(true);
    expect(t.emailStore.rows.some((r) => r.toEmail === 'late@example.com')).toBe(false);
  });

  it('skips suppressed addresses and fails only the contact missing a property', async () => {
    const t = await setup({ contacts: 2 });
    await t.call('POST', '/v1/contacts', { email: 'bare@example.com', list_ids: [t.list.id] });
    await t.call('POST', '/v1/suppressions', { email: 'a01@example.com' });

    const done = await t.sendAndDrain();
    expect(done.status).toBe('sent');
    expect(done.stats).toEqual({ total: 3, pending: 0, queued: 0, sent: 1, failed: 1, skipped: 1 });

    const { data } = await t.recipients(done.id);
    expect(data.map((r) => [r.email, r.status, r.error])).toEqual([
      ['a01@example.com', 'skipped', 'suppressed'],
      ['a02@example.com', 'sent', null],
      ['bare@example.com', 'failed', 'missing template variables: first_name'],
    ]);
    expect(data[1]?.message_id).toBe(t.emailStore.rows[0]?.id);
    expect(data[0]?.message_id).toBeNull();
  });

  it('reports a message the provider refused as failed', async () => {
    const t = await setup({ contacts: 1 });
    const created = await t.draft();
    await t.send(created.id);
    await t.queue.step();
    const message = t.emailStore.rows[0];
    await t.emailStore.markFailed(ORG, message?.id ?? '', 'recipient address rejected');

    const { data } = await t.recipients(created.id);
    expect(data[0]).toMatchObject({ status: 'failed', error: 'recipient address rejected' });
    expect((await t.get(created.id)).stats).toMatchObject({ failed: 1, sent: 0, queued: 0 });
  });

  it('refuses an empty list, a second start and a deleted template', async () => {
    const empty = await setup({ contacts: 0 });
    const none = await empty.send((await empty.draft()).id);
    expect(none.status).toBe(400);
    expect((await errorOf(none)).message).toMatch(/empty/);

    const t = await setup();
    const created = await t.draft();
    expect((await t.send(created.id)).status).toBe(200);
    const twice = await t.send(created.id);
    expect(twice.status).toBe(409);
    expect((await t.call('PATCH', `/v1/broadcasts/${created.id}`, { name: 'x' })).status).toBe(409);
    expect((await t.call('DELETE', `/v1/broadcasts/${created.id}`)).status).toBe(409);
    expect(t.broadcastStore.recipientRows).toHaveLength(3);

    const orphan = await t.draft('Orphan');
    await t.call('DELETE', `/v1/templates/${t.template.id}`);
    const gone = await t.send(orphan.id);
    expect(gone.status).toBe(400);
    expect((await errorOf(gone)).message).toMatch(/template was deleted/);
  });
});

describe('broadcast worker', () => {
  const dispatch = (t: Awaited<ReturnType<typeof setup>>, broadcastId: string) =>
    t.broadcastWorker.processDispatch({ orgId: ORG, broadcastId });

  it('is safe to deliver twice: a second round finds nothing left to claim', async () => {
    const t = await setup({ contacts: 3 });
    const created = await t.draft();
    await t.send(created.id);
    expect(await dispatch(t, created.id)).toBe('completed');
    expect(await dispatch(t, created.id)).toBe('skipped');
    expect(t.emailStore.rows).toHaveLength(3);
  });

  it('takes over recipients a dead round left claimed, without sending twice', async () => {
    const t = await setup({ contacts: 2 });
    const created = await t.draft();
    await t.send(created.id);
    // A round that claimed both, queued the first, then died before recording anything.
    const claimed = await t.broadcastStore.claimRecipients(
      ORG,
      created.id,
      10,
      DISPATCH_LEASE_MS,
      new Date(t.clock.at),
    );
    await t.emails.send(
      { orgId: ORG, actor: 'system' },
      { to: claimed[0]?.email ?? '', subject: 's', text: 'b' },
      `broadcast:${claimed[0]?.id ?? ''}`,
    );

    // Within the lease the claim holds.
    expect(await dispatch(t, created.id)).toBe('dispatched');
    expect(t.emailStore.rows).toHaveLength(1);

    t.clock.at += DISPATCH_LEASE_MS + 1000;
    expect(await dispatch(t, created.id)).toBe('completed');
    // Two recipients, two messages: the one already queued was recognised by its key.
    expect(t.emailStore.rows).toHaveLength(2);
    expect((await t.get(created.id)).stats).toMatchObject({ queued: 2, pending: 0 });
  });

  it('ignores a job for a broadcast that is not sending', async () => {
    const t = await setup();
    const created = await t.draft();
    expect(await dispatch(t, created.id)).toBe('skipped');
    expect(await dispatch(t, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')).toBe('skipped');
    expect(t.emailStore.rows).toHaveLength(0);
  });
});

describe('canceling a broadcast', () => {
  it('stops the rest: waiting recipients are skipped and later rounds do nothing', async () => {
    const t = await setup({ contacts: 12, dailyLimit: 10 });
    const day1 = await t.sendAndDrain();
    const res = await t.call('POST', `/v1/broadcasts/${day1.id}/cancel`);
    expect(res.status).toBe(200);
    const canceled = broadcastSchema.parse(await res.json());
    expect(canceled.status).toBe('canceled');
    expect(canceled.stats).toMatchObject({ sent: 8, skipped: 4, pending: 0 });

    expect((await t.nextDay()).resumed).toBe(0);
    expect(t.emailStore.rows).toHaveLength(8);
    expect(t.audit.entries.at(-1)).toMatchObject({ action: 'broadcast.canceled', target: day1.id });

    // Only a broadcast that is sending can be canceled; a canceled one can be deleted.
    expect((await t.call('POST', `/v1/broadcasts/${day1.id}/cancel`)).status).toBe(409);
    expect((await t.call('DELETE', `/v1/broadcasts/${day1.id}`)).status).toBe(204);
    // Its messages stay in Logs.
    expect(t.emailStore.rows).toHaveLength(8);
  });

  it('cannot cancel a draft', async () => {
    const t = await setup();
    const created = await t.draft();
    expect((await t.call('POST', `/v1/broadcasts/${created.id}/cancel`)).status).toBe(409);
  });
});

describe('GET /v1/broadcasts/{id}/recipients', () => {
  it('pages by address with a cursor', async () => {
    const t = await setup({ contacts: 5, dailyLimit: 100 });
    const done = await t.sendAndDrain();
    const first = await t.recipients(done.id, '?limit=2');
    expect(first.data.map((r) => r.email)).toEqual(['a01@example.com', 'a02@example.com']);
    const second = await t.recipients(done.id, `?limit=2&cursor=${first.next_cursor}`);
    expect(second.data.map((r) => r.email)).toEqual(['a03@example.com', 'a04@example.com']);
    const last = await t.recipients(done.id, `?limit=2&cursor=${second.next_cursor}`);
    expect(last.data.map((r) => r.email)).toEqual(['a05@example.com']);
    expect(last.next_cursor).toBeNull();
    expect(
      (await t.call('GET', `/v1/broadcasts/${done.id}/recipients?cursor=garbage`)).status,
    ).toBe(400);
  });
});

describe('unsubscribe links', () => {
  const linkIn = (html: string) => new URL(UNSUBSCRIBE.exec(html)?.[1] ?? 'http://none.invalid');

  it('adds a footer link and the headers mail clients use for one-click unsubscribe', async () => {
    const t = await setup({ contacts: 1 });
    await t.sendAndDrain();
    const message = t.emailStore.rows[0];
    const body = t.emailStore.bodies.get(message?.id ?? '');
    const link = linkIn(body?.html ?? '');
    expect(link.pathname).toBe('/api/unsubscribe');
    expect(body?.headers).toEqual({
      'List-Unsubscribe': `<${link.toString()}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });

  it('uses the template’s own {{unsubscribe_url}} instead of adding a footer', async () => {
    const t = await setup({ contacts: 1 });
    await t.call('PATCH', `/v1/templates/${t.template.id}`, {
      html: '<p>Hi {{first_name}}</p><a href="{{unsubscribe_url}}">Stop these</a>',
    });
    await t.sendAndDrain();
    const html = t.htmlOf(t.emailStore.rows[0]?.id ?? '');
    expect(html).toContain('Stop these');
    expect(html.match(/api\/unsubscribe/g)).toHaveLength(1);
    expect(html).not.toContain('You are receiving this');
  });

  it('asks on GET and suppresses on POST, so a link scanner cannot unsubscribe anyone', async () => {
    const t = await setup({ contacts: 2 });
    await t.sendAndDrain();
    const link = linkIn(t.htmlOf(t.emailStore.rows[0]?.id ?? ''));
    const path = link.pathname + link.search;

    const page = await t.app.request(path);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('a01@example.com');
    expect(t.emailStore.suppressions).toHaveLength(0);

    const done = await t.app.request(path, { method: 'POST' });
    expect(done.status).toBe(200);
    expect(await done.text()).toContain('You are unsubscribed');
    expect(t.emailStore.suppressions).toEqual([
      expect.objectContaining({ orgId: ORG, email: 'a01@example.com', reason: 'unsubscribe' }),
    ]);

    // The next broadcast leaves them out, and the contact shows as suppressed.
    const next = await t.sendAndDrain();
    expect(next.stats).toMatchObject({ sent: 1, skipped: 1 });
  });

  it('rejects a link that was altered or made up', async () => {
    const t = await setup({ contacts: 1 });
    await t.sendAndDrain();
    const link = linkIn(t.htmlOf(t.emailStore.rows[0]?.id ?? ''));
    const token = link.searchParams.get('token') ?? '';
    for (const bad of [`${token}x`, 'garbage', '']) {
      const res = await t.app.request(`/api/unsubscribe?token=${encodeURIComponent(bad)}`, {
        method: 'POST',
      });
      expect(res.status).toBe(400);
    }
    expect(t.emailStore.suppressions).toHaveLength(0);
  });
});

describe('OpenAPI for contacts and broadcasts', () => {
  it('documents both for API keys and for the dashboard, and never the internal routes', async () => {
    const { app } = createTestApp();
    const doc = (await (await app.request('/openapi.json')).json()) as {
      paths: Record<string, unknown>;
    };
    const paths = Object.keys(doc.paths);
    expect(paths).toEqual(
      expect.arrayContaining([
        '/v1/contacts',
        '/v1/contacts/import',
        '/v1/contact-lists/{id}/contacts/{contactId}',
        '/v1/broadcasts/{id}/send',
        '/v1/broadcasts/{id}/recipients',
        '/app/orgs/{orgId}/contacts/{id}',
        '/app/orgs/{orgId}/contact-lists',
        '/app/orgs/{orgId}/broadcasts/{id}/cancel',
      ]),
    );
    expect(paths.some((p) => p.includes('unsubscribe') || p.includes('dispatch'))).toBe(false);
  });
});
