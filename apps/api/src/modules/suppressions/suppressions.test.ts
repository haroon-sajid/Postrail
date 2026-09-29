import {
  errorResponseSchema,
  suppressionListResponseSchema,
  suppressionSchema,
} from '@postrail/shared';
import { describe, expect, it, vi } from 'vitest';
import { GoogleApiError } from '../../providers/google-client';
import { createTestApp } from '../../test/app';
import { fakeGoogleClient } from '../../test/fakes';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function setup() {
  const sendRaw = vi.fn((_t: string, _r: string) => Promise.resolve({ id: 'gmail-1' }));
  const t = createTestApp({ google: fakeGoogleClient({ sendRaw }) });
  const headers = t.authHeaders(ORG);
  const call = (method: string, path: string, body?: unknown) =>
    t.app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const send = (to: string) => call('POST', '/v1/emails', { to, subject: 's', text: 'b' });
  return { ...t, headers, call, sendRaw, send };
}

describe('/v1/suppressions', () => {
  it('adds, lists, checks and removes an address, normalised to lowercase', async () => {
    const t = setup();
    const res = await t.call('POST', '/v1/suppressions', {
      email: 'Bounce@Example.org',
      reason: 'unsubscribe',
    });
    expect(res.status).toBe(201);
    expect(suppressionSchema.parse(await res.json())).toMatchObject({
      email: 'bounce@example.org',
      reason: 'unsubscribe',
    });

    const again = await t.call('POST', '/v1/suppressions', { email: 'bounce@example.org' });
    expect(suppressionSchema.parse(await again.json()).reason).toBe('unsubscribe');

    const list = await t.call('GET', '/v1/suppressions');
    expect(suppressionListResponseSchema.parse(await list.json()).data).toHaveLength(1);
    expect((await t.call('GET', '/v1/suppressions/BOUNCE@example.org')).status).toBe(200);
    expect((await t.call('GET', '/v1/suppressions/other@example.org')).status).toBe(404);

    const foreign = await t.app.request('/v1/suppressions/bounce@example.org', {
      method: 'DELETE',
      headers: t.authHeaders(ORG_B),
    });
    expect(foreign.status).toBe(404);
    expect((await t.call('DELETE', '/v1/suppressions/bounce%40example.org')).status).toBe(204);
    expect((await t.call('GET', '/v1/suppressions/bounce@example.org')).status).toBe(404);
  });

  it('blocks sends to a suppressed address until it is removed', async () => {
    const t = setup();
    t.store.add(ORG);
    await t.call('POST', '/v1/suppressions', { email: 'dest@example.org' });
    const blocked = await t.send('Dest@Example.org');
    expect(blocked.status).toBe(422);
    expect(errorResponseSchema.parse(await blocked.json()).error.code).toBe('SUPPRESSED');

    await t.call('DELETE', '/v1/suppressions/dest@example.org');
    expect((await t.send('dest@example.org')).status).toBe(201);
  });

  it('auto-suppresses an address Gmail refuses as invalid, but not other 4xx failures', async () => {
    const t = setup();
    t.store.add(ORG);
    t.sendRaw.mockRejectedValueOnce(new GoogleApiError(400, 'gmail.send', 'Invalid To header'));
    await t.send('nobody@example.org');
    await t.queue.drain();

    expect(t.emailStore.rows[0]?.status).toBe('failed');
    const list = await t.call('GET', '/v1/suppressions');
    expect(suppressionListResponseSchema.parse(await list.json()).data).toEqual([
      expect.objectContaining({ email: 'nobody@example.org', reason: 'hard_bounce' }),
    ]);
    expect((await t.send('nobody@example.org')).status).toBe(422);

    t.sendRaw.mockRejectedValueOnce(
      new GoogleApiError(403, 'gmail.send', 'Insufficient Permission'),
    );
    await t.send('fine@example.org');
    await t.queue.drain();
    expect(t.suppressionStore.rows.map((r) => r.email)).toEqual(['nobody@example.org']);
  });
});
