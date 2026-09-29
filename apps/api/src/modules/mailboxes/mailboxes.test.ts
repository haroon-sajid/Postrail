import {
  errorResponseSchema,
  mailboxListResponseSchema,
  oauthStateSchema,
  signState,
  verifyState,
} from '@postrail/shared';
import { describe, expect, it } from 'vitest';
import { GOOGLE_SCOPES } from '../../providers/google-client';
import { createTestApp } from '../../test/app';
import { fakeGoogleClient, TEST_KEY_HEX, testCipher } from '../../test/fakes';

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

async function errorOf(res: Response) {
  const body: unknown = await res.json();
  return errorResponseSchema.parse(body).error;
}

describe('GET /api/google/connect', () => {
  it('redirects to Google with the right scopes and a verifiable state', async () => {
    const { app } = createTestApp();
    const res = await app.request(`/api/google/connect?org=${ORG_A}`);
    expect(res.status).toBe(302);

    const url = new URL(res.headers.get('location') ?? '');
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('test-client-id');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:8080/api/google/callback');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('scope')?.split(' ')).toEqual(GOOGLE_SCOPES);
    expect(url.searchParams.get('scope')).toContain('gmail.send');

    const state = verifyState(url.searchParams.get('state') ?? '', TEST_KEY_HEX, oauthStateSchema);
    expect(state).toEqual({ ok: true, payload: { orgId: ORG_A } });
  });

  it('rejects a missing or non-uuid org', async () => {
    const { app } = createTestApp();
    expect((await app.request('/api/google/connect')).status).toBe(400);
    const res = await app.request('/api/google/connect?org=nope');
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/google/callback', () => {
  const validState = () => signState({ orgId: ORG_A }, TEST_KEY_HEX);

  it('stores the mailbox with encrypted tokens, audits it and shows a success page', async () => {
    const { app, store } = createTestApp();
    const res = await app.request(`/api/google/callback?code=abc&state=${validState()}`);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('user@example.com');

    expect(store.rows).toHaveLength(1);
    const row = store.rows[0];
    expect(row?.orgId).toBe(ORG_A);
    expect(row?.status).toBe('active');
    expect(row?.provider).toBe('google');
    expect(row?.refreshTokenEnc).not.toContain('refresh-1');
    expect(testCipher.decrypt(row?.refreshTokenEnc ?? '')).toBe('refresh-1');
    expect(testCipher.decrypt(row?.accessTokenEnc ?? '')).toBe('access-1');
    expect(row?.accessExpiresAt?.getTime()).toBeGreaterThan(Date.now());

    expect(store.audits).toEqual([
      expect.objectContaining({
        orgId: ORG_A,
        actor: 'google-oauth',
        action: 'mailbox.connected',
        target: row?.id,
        meta: { email: 'user@example.com', provider: 'google' },
      }),
    ]);
  });

  it('upserts on reconnect instead of duplicating the (org, email) pair', async () => {
    const { app, store } = createTestApp();
    await app.request(`/api/google/callback?code=abc&state=${validState()}`);
    await app.request(`/api/google/callback?code=def&state=${validState()}`);
    expect(store.rows).toHaveLength(1);
    expect(store.audits).toHaveLength(2);
  });

  it('rejects a forged, expired or missing state', async () => {
    const { app } = createTestApp();
    const forged = signState({ orgId: ORG_B }, 'other-secret');
    const expired = signState({ orgId: ORG_A }, TEST_KEY_HEX, { now: () => new Date(0) });
    for (const state of [forged, expired, 'garbage']) {
      const res = await app.request(`/api/google/callback?code=abc&state=${state}`);
      expect(res.status).toBe(400);
      expect((await errorOf(res)).message).toMatch(/state/);
    }
    expect((await app.request('/api/google/callback?code=abc')).status).toBe(400);
  });

  it('reports a Google-side refusal', async () => {
    const { app, store } = createTestApp();
    const res = await app.request(`/api/google/callback?error=access_denied&state=${validState()}`);
    expect(res.status).toBe(400);
    expect((await errorOf(res)).message).toContain('access_denied');
    expect(store.rows).toHaveLength(0);
  });

  it('fails when Google returns no refresh token', async () => {
    const google = fakeGoogleClient({
      exchangeCode: () => Promise.resolve({ accessToken: 'a', expiresIn: 3600 }),
    });
    const { app, store } = createTestApp({ google });
    const res = await app.request(`/api/google/callback?code=abc&state=${validState()}`);
    expect(res.status).toBe(400);
    expect((await errorOf(res)).message).toMatch(/refresh token/);
    expect(store.rows).toHaveLength(0);
  });
});

describe('/v1/mailboxes', () => {
  async function connectedApp() {
    const t = createTestApp();
    await t.app.request(
      `/api/google/callback?code=abc&state=${signState({ orgId: ORG_A }, TEST_KEY_HEX)}`,
    );
    return { ...t, headers: t.authHeaders(ORG_A) };
  }

  it('requires an API key', async () => {
    const { app } = await connectedApp();
    const res = await app.request('/v1/mailboxes');
    expect(res.status).toBe(401);
    expect((await errorOf(res)).code).toBe('UNAUTHORIZED');
  });

  it('lists the org mailboxes in snake_case without any token fields', async () => {
    const { app, headers } = await connectedApp();
    const res = await app.request('/v1/mailboxes', { headers });
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    const { data } = mailboxListResponseSchema.parse(body);
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      email: 'user@example.com',
      provider: 'google',
      status: 'active',
      daily_limit: 400,
      sent_today: 0,
    });
    expect(JSON.stringify(body)).not.toMatch(/token|Enc/i);
  });

  it('scopes the list to the calling org', async () => {
    const { app, authHeaders } = await connectedApp();
    const res = await app.request('/v1/mailboxes', { headers: authHeaders(ORG_B) });
    const body: unknown = await res.json();
    expect(mailboxListResponseSchema.parse(body).data).toEqual([]);
  });

  it('deletes a mailbox, audits it, and 404s afterwards and for other orgs', async () => {
    const { app, store, headers, authHeaders } = await connectedApp();
    const id = store.rows[0]?.id ?? '';

    const foreign = await app.request(`/v1/mailboxes/${id}`, {
      method: 'DELETE',
      headers: authHeaders(ORG_B),
    });
    expect(foreign.status).toBe(404);

    const ok = await app.request(`/v1/mailboxes/${id}`, { method: 'DELETE', headers });
    expect(ok.status).toBe(204);
    expect(store.rows).toHaveLength(0);
    expect(store.audits.at(-1)).toMatchObject({
      action: 'mailbox.removed',
      target: id,
      orgId: ORG_A,
    });
    expect(store.audits.at(-1)?.actor).toMatch(/^api-key:/);

    const again = await app.request(`/v1/mailboxes/${id}`, { method: 'DELETE', headers });
    expect(again.status).toBe(404);
  });

  it('rejects a non-uuid mailbox id', async () => {
    const { app, headers } = await connectedApp();
    const res = await app.request('/v1/mailboxes/not-a-uuid', { method: 'DELETE', headers });
    expect(res.status).toBe(400);
  });
});
