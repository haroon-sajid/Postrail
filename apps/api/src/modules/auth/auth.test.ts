import {
  AUTH_ACCESS_TOKEN_TTL_MINUTES,
  AUTH_EMAILS_PER_WINDOW,
  AUTH_OTP_MAX_ATTEMPTS,
  authSettingsSchema,
  authUserListResponseSchema,
  authUserSchema,
  errorResponseSchema,
  type JwksKey,
  refreshSessionResponseSchema,
  signInResponseSchema,
  signInStateSchema,
  signState,
  verifyJwt,
  verifySessionResponseSchema,
  verifyState,
} from '@postrail/shared';
import { describe, expect, it } from 'vitest';
import { GOOGLE_SIGN_IN_SCOPES } from '../../providers/google-identity';
import { type IdentityProvider, IdentityProviderError } from '../../providers/identity';
import { createTestApp } from '../../test/app';
import {
  fakeIdentityProvider,
  TEST_KEY_HEX,
  testCipher,
  testIdentityProfile,
} from '../../test/fakes';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const REDIRECT = 'https://app.example.com/auth/callback';
const CALLBACK = '/api/sign-in/google/callback';
const MINUTE = 60_000;

async function errorOf(res: Response) {
  const body: unknown = await res.json();
  return errorResponseSchema.parse(body).error;
}

function setup(google: Partial<IdentityProvider> = {}) {
  // A clock the test can move, starting at the real time the in-memory rows are stamped with.
  const clock = { at: Date.now() };
  const googleIdentity = fakeIdentityProvider('google', google);
  const githubIdentity = fakeIdentityProvider('github');
  const t = createTestApp({
    identityProviders: { google: googleIdentity, github: githubIdentity },
    now: () => new Date(clock.at),
  });
  const headers = t.authHeaders(ORG);
  const call = (method: string, path: string, body?: unknown, as = headers) =>
    t.app.request(path, {
      method,
      headers: as,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const advance = (minutes: number) => {
    clock.at += minutes * MINUTE;
  };
  return { ...t, googleIdentity, githubIdentity, headers, call, advance };
}

type Setup = ReturnType<typeof setup>;

/** A workspace that allows REDIRECT and has a mailbox to send sign-in emails from. */
async function ready(google: Partial<IdentityProvider> = {}) {
  const t = setup(google);
  t.store.add(ORG);
  const res = await t.call('PATCH', '/v1/auth/settings', { redirect_urls: [REDIRECT] });
  expect(res.status).toBe(200);
  return t;
}

/** Runs the Google redirect and returns where the browser ends up. */
async function googleCallback(t: Setup, query: Record<string, string> = { code: 'google-code' }) {
  const state = signState(
    { orgId: ORG, provider: 'google', redirectUrl: REDIRECT, state: 'csrf-1' },
    TEST_KEY_HEX,
  );
  const params = new URLSearchParams({ state, ...query });
  const res = await t.app.request(`${CALLBACK}?${params.toString()}`);
  return { res, location: new URL(res.headers.get('location') ?? 'http://none.invalid') };
}

async function signInWithGoogle(t: Setup) {
  const { location } = await googleCallback(t);
  const res = await t.call('POST', '/v1/auth/exchange', {
    code: location.searchParams.get('code'),
  });
  expect(res.status).toBe(200);
  return signInResponseSchema.parse(await res.json());
}

/** The text of the newest sign-in email, as the worker would send it. */
function lastEmailText(t: Setup): string {
  const row = t.emailStore.rows.at(-1);
  return (row && t.emailStore.bodies.get(row.id)?.text) ?? '';
}

describe('/v1/auth/settings', () => {
  it('starts open, with the shared Google client and GitHub waiting for an OAuth app', async () => {
    const t = setup();
    const res = await t.call('GET', '/v1/auth/settings');
    expect(res.status).toBe(200);
    expect(authSettingsSchema.parse(await res.json())).toEqual({
      app_name: null,
      redirect_urls: [],
      methods: { google: true, github: false, magic_link: true, email_otp: true },
      signups_enabled: true,
      google: {
        mode: 'shared',
        client_id: null,
        callback_url: `http://localhost:8080${CALLBACK}`,
      },
      github: {
        client_id: null,
        callback_url: 'http://localhost:8080/api/sign-in/github/callback',
      },
      email_templates: { magic_link: null, email_otp: null },
      tokens: {
        issuer: 'http://localhost:8080',
        audience: ORG,
        jwks_url: `http://localhost:8080/api/jwks/${ORG}`,
      },
    });
  });

  it('saves normalised redirect URLs, the app name and method switches, and audits it', async () => {
    const t = setup();
    const res = await t.call('PATCH', '/v1/auth/settings', {
      app_name: 'Acme',
      redirect_urls: ['https://App.Example.com', 'https://app.example.com/', REDIRECT],
      methods: { email_otp: false },
    });
    expect(res.status).toBe(200);
    expect(authSettingsSchema.parse(await res.json())).toMatchObject({
      app_name: 'Acme',
      redirect_urls: ['https://app.example.com/', REDIRECT],
      methods: { google: true, github: false, magic_link: true, email_otp: false },
    });
    expect(t.audit.entries.at(-1)).toMatchObject({
      orgId: ORG,
      action: 'auth.settings_updated',
      meta: { fields: ['app_name', 'redirect_urls', 'methods'] },
    });
  });

  it('stores a custom Google client encrypted and never returns the secret', async () => {
    const t = setup();
    const res = await t.call('PATCH', '/v1/auth/settings', {
      google: { client_id: 'tenant-client-id', client_secret: 'tenant-client-secret' },
    });
    const text = await res.text();
    expect(authSettingsSchema.parse(JSON.parse(text)).google).toMatchObject({
      mode: 'custom',
      client_id: 'tenant-client-id',
    });
    expect(text).not.toContain('tenant-client-secret');

    const stored = t.authStore.settings[0]?.googleClientSecretEnc ?? '';
    expect(stored).not.toContain('tenant-client-secret');
    expect(testCipher.decrypt(stored)).toBe('tenant-client-secret');
    expect(JSON.stringify(t.audit.entries)).not.toContain('tenant-client-secret');

    const cleared = await t.call('PATCH', '/v1/auth/settings', { google: null });
    expect(authSettingsSchema.parse(await cleared.json()).google.mode).toBe('shared');
    expect(t.authStore.settings[0]?.googleClientSecretEnc).toBeNull();
  });

  it('rejects redirect URLs that are not https, and an empty patch', async () => {
    const t = setup();
    for (const body of [
      { redirect_urls: ['http://app.example.com/callback'] },
      { redirect_urls: ['https://app.example.com/callback?x=1'] },
      {},
    ]) {
      expect((await t.call('PATCH', '/v1/auth/settings', body)).status).toBe(400);
    }
  });

  it('lets any member read from the dashboard but only admins change', async () => {
    const t = setup();
    const admin = t.sessionHeaders(t.member(ORG, 'admin'));
    const member = t.sessionHeaders(t.member(ORG, 'member'));
    const outsider = t.sessionHeaders(t.member(ORG_B, 'owner'));
    const path = `/app/orgs/${ORG}/auth/settings`;
    const patch = { redirect_urls: [REDIRECT] };

    expect((await t.call('GET', path, undefined, member)).status).toBe(200);
    expect((await t.call('PATCH', path, patch, member)).status).toBe(403);
    expect((await t.call('PATCH', path, patch, outsider)).status).toBe(404);
    expect((await t.call('PATCH', path, patch, admin)).status).toBe(200);
    expect((await t.call('GET', '/v1/auth/settings', undefined, {})).status).toBe(401);
  });

  it('keeps settings apart per org', async () => {
    const t = await ready();
    const other = await t.call('GET', '/v1/auth/settings', undefined, t.authHeaders(ORG_B));
    expect(authSettingsSchema.parse(await other.json()).redirect_urls).toEqual([]);
  });
});

describe('Google sign-in', () => {
  it('builds a consent URL with identity scopes and a signed state', async () => {
    const t = await ready();
    const res = await t.call('POST', '/v1/auth/sign-in/google', {
      redirect_url: REDIRECT,
      state: 'csrf-1',
    });
    expect(res.status).toBe(200);
    const url = new URL(((await res.json()) as { url: string }).url);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('test-client-id');
    expect(url.searchParams.get('redirect_uri')).toBe(`http://localhost:8080${CALLBACK}`);
    expect(url.searchParams.get('scope')?.split(' ')).toEqual(GOOGLE_SIGN_IN_SCOPES);
    expect(url.searchParams.get('scope')).not.toContain('gmail');

    const state = verifyState(url.searchParams.get('state') ?? '', TEST_KEY_HEX, signInStateSchema);
    expect(state).toEqual({
      ok: true,
      payload: { orgId: ORG, provider: 'google', redirectUrl: REDIRECT, state: 'csrf-1' },
    });
  });

  it('uses the workspace Google client once one is saved', async () => {
    const t = await ready();
    await t.call('PATCH', '/v1/auth/settings', {
      google: { client_id: 'tenant-client-id', client_secret: 'tenant-client-secret' },
    });
    const res = await t.call('POST', '/v1/auth/sign-in/google', { redirect_url: REDIRECT });
    const url = new URL(((await res.json()) as { url: string }).url);
    expect(url.searchParams.get('client_id')).toBe('tenant-client-id');

    await googleCallback(t);
    expect(t.googleIdentity.exchanges.at(-1)?.credentials).toEqual({
      clientId: 'tenant-client-id',
      clientSecret: 'tenant-client-secret',
    });
  });

  it('refuses a redirect URL the workspace has not allowed, and a disabled method', async () => {
    const t = await ready();
    const stray = await t.call('POST', '/v1/auth/sign-in/google', {
      redirect_url: 'https://evil.example.com/callback',
    });
    expect(stray.status).toBe(400);
    expect((await errorOf(stray)).message).toMatch(/allowed redirect URL/);

    await t.call('PATCH', '/v1/auth/settings', { methods: { google: false } });
    const off = await t.call('POST', '/v1/auth/sign-in/google', { redirect_url: REDIRECT });
    expect(off.status).toBe(403);
  });

  it('sends the browser back with a one-time code that the API key swaps for a session', async () => {
    const t = await ready();
    const { res, location } = await googleCallback(t);
    expect(res.status).toBe(302);
    expect(location.origin + location.pathname).toBe(REDIRECT);
    expect(location.searchParams.get('state')).toBe('csrf-1');
    const code = location.searchParams.get('code') ?? '';
    expect(code).toMatch(/^prc_/);
    expect(t.googleIdentity.exchanges[0]).toMatchObject({
      credentials: { clientId: 'test-client-id', clientSecret: 'test-client-secret' },
      redirectUri: `http://localhost:8080${CALLBACK}`,
      code: 'google-code',
    });

    const exchanged = await t.call('POST', '/v1/auth/exchange', { code });
    expect(exchanged.status).toBe(200);
    const signIn = signInResponseSchema.parse(await exchanged.json());
    expect(signIn.is_new_user).toBe(true);
    expect(signIn.session.token).toMatch(/^prs_/);
    expect(signIn.user).toMatchObject({
      email: testIdentityProfile.email,
      email_verified: true,
      name: testIdentityProfile.name,
      image: testIdentityProfile.picture,
      providers: ['google'],
    });
    expect(signIn.user.last_sign_in_at).not.toBeNull();

    // Neither secret is stored in the clear.
    const stored = JSON.stringify([t.authStore.challenges, t.authStore.sessions]);
    expect(stored).not.toContain(code);
    expect(stored).not.toContain(signIn.session.token);

    const replay = await t.call('POST', '/v1/auth/exchange', { code });
    expect(replay.status).toBe(400);
    expect((await errorOf(replay)).message).toBe('invalid or expired code');
  });

  it('recognises a returning user by their Google id even if the address changed', async () => {
    const t = await ready({
      fetchProfile: () => Promise.resolve({ ...testIdentityProfile, email: 'Ada@Example.com' }),
    });
    const first = await signInWithGoogle(t);
    expect(first.user.email).toBe('ada@example.com');

    t.googleIdentity.fetchProfile = () =>
      Promise.resolve({ ...testIdentityProfile, email: 'ada.new@example.com', name: 'Ada King' });
    const second = await signInWithGoogle(t);
    expect(second.is_new_user).toBe(false);
    expect(second.user.id).toBe(first.user.id);
    expect(second.user.name).toBe('Ada King');
    expect(t.authStore.users).toHaveLength(1);
  });

  it('does not let another org redeem the code', async () => {
    const t = await ready();
    const { location } = await googleCallback(t);
    const code = location.searchParams.get('code');
    const foreign = await t.call('POST', '/v1/auth/exchange', { code }, t.authHeaders(ORG_B));
    expect(foreign.status).toBe(400);
    expect((await t.call('POST', '/v1/auth/exchange', { code })).status).toBe(200);
  });

  it('expires the code after five minutes', async () => {
    const t = await ready();
    const { location } = await googleCallback(t);
    t.advance(6);
    const res = await t.call('POST', '/v1/auth/exchange', {
      code: location.searchParams.get('code'),
    });
    expect(res.status).toBe(400);
  });

  it('rejects a forged, expired or missing state without redirecting anywhere', async () => {
    const t = await ready();
    const forged = signState(
      { orgId: ORG, provider: 'google', redirectUrl: REDIRECT },
      'other-secret',
    );
    const expired = signState(
      { orgId: ORG, provider: 'google', redirectUrl: REDIRECT },
      TEST_KEY_HEX,
      {
        now: () => new Date(0),
      },
    );
    for (const state of [forged, expired, 'garbage']) {
      const res = await t.app.request(`${CALLBACK}?code=abc&state=${state}`);
      expect(res.status).toBe(400);
      expect(res.headers.get('location')).toBeNull();
    }
    expect((await t.app.request(`${CALLBACK}?code=abc`)).status).toBe(400);
    expect(t.authStore.users).toHaveLength(0);
  });

  it('refuses the callback when the redirect URL was removed after the flow started', async () => {
    const t = await ready();
    await t.call('PATCH', '/v1/auth/settings', { redirect_urls: [] });
    const { res } = await googleCallback(t);
    expect(res.status).toBe(403);
    expect(res.headers.get('location')).toBeNull();
  });

  it('reports failures to the tenant as an error on the redirect', async () => {
    const denied = await googleCallback(await ready(), { error: 'access_denied' });
    expect(denied.res.status).toBe(302);
    expect(denied.location.searchParams.get('error')).toBe('access_denied');
    expect(denied.location.searchParams.get('state')).toBe('csrf-1');
    expect(denied.location.searchParams.get('code')).toBeNull();

    const badSecret = await ready({
      fetchProfile: () => Promise.reject(new IdentityProviderError('invalid_client')),
    });
    const refused = await googleCallback(badSecret);
    expect(refused.location.searchParams.get('error')).toBe('invalid_client');

    const unverified = await ready({
      fetchProfile: () => Promise.resolve({ ...testIdentityProfile, emailVerified: false }),
    });
    const result = await googleCallback(unverified);
    expect(result.location.searchParams.get('error')).toBe('email_not_verified');
    expect(unverified.authStore.users).toHaveLength(0);

    const off = await ready();
    await off.call('PATCH', '/v1/auth/settings', { methods: { google: false } });
    const disabled = await googleCallback(off);
    expect(disabled.location.searchParams.get('error')).toBe('provider_disabled');
  });
});

describe('magic link sign-in', () => {
  const send = (t: Setup, email = 'Grace@Example.com') =>
    t.call('POST', '/v1/auth/sign-in/magic-link', {
      email,
      redirect_url: REDIRECT,
      state: 'csrf-2',
    });

  function linkFrom(t: Setup): URL {
    const match = /https:\/\/\S+/.exec(lastEmailText(t));
    return new URL(match?.[0] ?? 'http://none.invalid');
  }

  it('queues an email from the workspace mailbox with a link back to the app', async () => {
    const t = await ready();
    await t.call('PATCH', '/v1/auth/settings', { app_name: 'Acme' });
    const res = await send(t);
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ email: 'grace@example.com' });

    // Queued like any other message: the request never talks to Gmail.
    expect(t.emailStore.rows).toHaveLength(1);
    expect(t.emailStore.rows[0]).toMatchObject({
      orgId: ORG,
      toEmail: 'grace@example.com',
      subject: 'Sign in to Acme',
      status: 'queued',
    });
    const link = linkFrom(t);
    expect(link.origin + link.pathname).toBe(REDIRECT);
    expect(link.searchParams.get('state')).toBe('csrf-2');
    expect(link.searchParams.get('code')).toMatch(/^prc_/);
    expect(t.emailStore.rows[0]?.subject).not.toContain('prc_');
  });

  it('signs the user in once, creating them with a verified address', async () => {
    const t = await ready();
    await send(t);
    const code = linkFrom(t).searchParams.get('code');

    const res = await t.call('POST', '/v1/auth/exchange', { code });
    expect(res.status).toBe(200);
    const signIn = signInResponseSchema.parse(await res.json());
    expect(signIn.is_new_user).toBe(true);
    expect(signIn.user).toMatchObject({
      email: 'grace@example.com',
      email_verified: true,
      providers: [],
    });

    expect((await t.call('POST', '/v1/auth/exchange', { code })).status).toBe(400);
  });

  it('expires after fifteen minutes', async () => {
    const t = await ready();
    await send(t);
    const code = linkFrom(t).searchParams.get('code');
    t.advance(16);
    expect((await t.call('POST', '/v1/auth/exchange', { code })).status).toBe(400);
    expect(t.authStore.users).toHaveLength(0);
  });

  it('is one user whether they arrive by link or by Google', async () => {
    const t = await ready();
    await send(t, testIdentityProfile.email);
    const viaLink = signInResponseSchema.parse(
      await (
        await t.call('POST', '/v1/auth/exchange', { code: linkFrom(t).searchParams.get('code') })
      ).json(),
    );
    const viaGoogle = await signInWithGoogle(t);
    expect(viaGoogle.user.id).toBe(viaLink.user.id);
    expect(viaGoogle.is_new_user).toBe(false);
    expect(viaGoogle.user.providers).toEqual(['google']);
    expect(t.authStore.users).toHaveLength(1);
  });

  it('answers NO_MAILBOX without leaving a usable link behind', async () => {
    const t = setup();
    await t.call('PATCH', '/v1/auth/settings', { redirect_urls: [REDIRECT] });
    const res = await send(t);
    expect(res.status).toBe(422);
    expect((await errorOf(res)).code).toBe('NO_MAILBOX');
    expect(t.authStore.challenges).toHaveLength(0);
  });

  it('respects the suppression list', async () => {
    const t = await ready();
    t.emailStore.suppress(ORG, 'grace@example.com');
    const res = await send(t);
    expect(res.status).toBe(422);
    expect((await errorOf(res)).code).toBe('SUPPRESSED');
  });

  it('caps sign-in emails per address so a login form cannot be used to spam', async () => {
    const t = await ready();
    for (let i = 0; i < AUTH_EMAILS_PER_WINDOW; i += 1) {
      expect((await send(t)).status).toBe(202);
    }
    const limited = await send(t);
    expect(limited.status).toBe(429);
    expect((await errorOf(limited)).code).toBe('RATE_LIMITED');
    // Another address is unaffected, and the window passes.
    expect((await send(t, 'other@example.com')).status).toBe(202);
    t.advance(16);
    expect((await send(t)).status).toBe(202);
  });

  it('refuses a redirect URL that is not allowed, and a disabled method', async () => {
    const t = await ready();
    const stray = await t.call('POST', '/v1/auth/sign-in/magic-link', {
      email: 'grace@example.com',
      redirect_url: 'https://evil.example.com/callback',
    });
    expect(stray.status).toBe(400);
    await t.call('PATCH', '/v1/auth/settings', { methods: { magic_link: false } });
    expect((await send(t)).status).toBe(403);
    expect(t.emailStore.rows).toHaveLength(0);
  });
});

describe('email code sign-in', () => {
  const EMAIL = 'grace@example.com';
  const send = (t: Setup) => t.call('POST', '/v1/auth/sign-in/otp', { email: EMAIL });
  const verify = (t: Setup, code: string, as = t.headers) =>
    t.call('POST', '/v1/auth/sign-in/otp/verify', { email: EMAIL, code }, as);
  const codeFrom = (t: Setup) => /\b\d{6}\b/.exec(lastEmailText(t))?.[0] ?? '';
  const wrong = (code: string) => (code === '000000' ? '000001' : '000000');

  it('emails six digits and signs the user in with them', async () => {
    const t = await ready();
    const res = await send(t);
    expect(res.status).toBe(202);
    const code = codeFrom(t);
    expect(code).toMatch(/^\d{6}$/);
    expect(t.emailStore.rows[0]?.subject).not.toContain(code);
    expect(JSON.stringify(t.authStore.challenges)).not.toContain(code);

    const ok = await verify(t, code);
    expect(ok.status).toBe(200);
    const signIn = signInResponseSchema.parse(await ok.json());
    expect(signIn.user).toMatchObject({ email: EMAIL, email_verified: true });
    expect(signIn.is_new_user).toBe(true);

    // Single use.
    expect((await verify(t, code)).status).toBe(400);
  });

  it('retires the code after five wrong guesses', async () => {
    const t = await ready();
    await send(t);
    const code = codeFrom(t);
    for (let i = 0; i < AUTH_OTP_MAX_ATTEMPTS; i += 1) {
      expect((await verify(t, wrong(code))).status).toBe(400);
    }
    const locked = await verify(t, code);
    expect(locked.status).toBe(400);
    expect((await errorOf(locked)).message).toMatch(/too many wrong codes/);
    expect(t.authStore.users).toHaveLength(0);
  });

  it('lets only the newest code work', async () => {
    const t = await ready();
    await send(t);
    const first = codeFrom(t);
    await send(t);
    const second = codeFrom(t);
    if (first !== second) expect((await verify(t, first)).status).toBe(400);
    expect((await verify(t, second)).status).toBe(200);
  });

  it('expires after ten minutes and is scoped to the org', async () => {
    const t = await ready();
    await send(t);
    const code = codeFrom(t);
    expect((await verify(t, code, t.authHeaders(ORG_B))).status).toBe(400);
    t.advance(11);
    expect((await verify(t, code)).status).toBe(400);
  });

  it('can be turned off', async () => {
    const t = await ready();
    await t.call('PATCH', '/v1/auth/settings', { methods: { email_otp: false } });
    expect((await send(t)).status).toBe(403);
  });
});

describe('/v1/auth/sessions', () => {
  const verify = (t: Setup, token: string, as = t.headers) =>
    t.call('POST', '/v1/auth/sessions/verify', { token }, as);
  const parse = async (res: Response) => verifySessionResponseSchema.parse(await res.json());

  it('reports a live session with its user', async () => {
    const t = await ready();
    const { session, user } = await signInWithGoogle(t);
    const res = await verify(t, session.token);
    expect(res.status).toBe(200);
    const body = await parse(res);
    expect(body.active).toBe(true);
    expect(body.user?.id).toBe(user.id);
    expect(body.session).toEqual({
      id: session.id,
      user_id: user.id,
      expires_at: session.expires_at,
      created_at: session.created_at,
    });
    expect(JSON.stringify(body)).not.toContain(session.token);
  });

  it('answers inactive, not an error, for unknown, foreign and expired tokens', async () => {
    const t = await ready();
    const { session } = await signInWithGoogle(t);
    const inactive = { active: false, user: null, session: null };

    expect(await parse(await verify(t, 'prs_nope'))).toEqual(inactive);
    expect(await parse(await verify(t, session.token, t.authHeaders(ORG_B)))).toEqual(inactive);
    t.advance(31 * 24 * 60);
    expect(await parse(await verify(t, session.token))).toEqual(inactive);
  });

  it('ends a session on revoke, and revoking twice is fine', async () => {
    const t = await ready();
    const { session } = await signInWithGoogle(t);
    const revoke = () => t.call('POST', '/v1/auth/sessions/revoke', { token: session.token });
    expect((await revoke()).status).toBe(204);
    expect((await parse(await verify(t, session.token))).active).toBe(false);
    expect((await revoke()).status).toBe(204);
    expect((await t.call('POST', '/v1/auth/sessions/revoke', { token: 'prs_nope' })).status).toBe(
      204,
    );
  });

  it('needs an API key', async () => {
    const t = await ready();
    expect((await verify(t, 'prs_x', {})).status).toBe(401);
  });
});

describe('/v1/auth/users', () => {
  /** Three users, oldest first: a@, b@, c@. */
  async function seeded() {
    const t = await ready();
    for (const email of ['a@example.com', 'b@example.com', 'c@example.com']) {
      await t.authStore.resolveUserByEmail(ORG, email, true);
    }
    return t;
  }

  it('lists newest first with a cursor, and searches by email', async () => {
    const t = await seeded();
    const first = authUserListResponseSchema.parse(
      await (await t.call('GET', '/v1/auth/users?limit=2')).json(),
    );
    expect(first.data.map((u) => u.email)).toEqual(['c@example.com', 'b@example.com']);
    expect(first.next_cursor).not.toBeNull();

    const second = authUserListResponseSchema.parse(
      await (await t.call('GET', `/v1/auth/users?limit=2&cursor=${first.next_cursor}`)).json(),
    );
    expect(second.data.map((u) => u.email)).toEqual(['a@example.com']);
    expect(second.next_cursor).toBeNull();

    const found = authUserListResponseSchema.parse(
      await (await t.call('GET', '/v1/auth/users?q=B%40example')).json(),
    );
    expect(found.data.map((u) => u.email)).toEqual(['b@example.com']);
  });

  it('scopes users to the calling org', async () => {
    const t = await seeded();
    const id = t.authStore.users[0]?.id ?? '';
    const other = t.authHeaders(ORG_B);
    const list = await t.call('GET', '/v1/auth/users', undefined, other);
    expect(authUserListResponseSchema.parse(await list.json()).data).toEqual([]);
    expect((await t.call('GET', `/v1/auth/users/${id}`, undefined, other)).status).toBe(404);
    expect((await t.call('DELETE', `/v1/auth/users/${id}`, undefined, other)).status).toBe(404);

    const mine = await t.call('GET', `/v1/auth/users/${id}`);
    expect(authUserSchema.parse(await mine.json()).email).toBe('a@example.com');
  });

  it('signs a user out everywhere', async () => {
    const t = await ready();
    const first = await signInWithGoogle(t);
    const second = await signInWithGoogle(t);
    const res = await t.call('POST', `/v1/auth/users/${first.user.id}/revoke-sessions`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revoked: 2 });
    for (const { session } of [first, second]) {
      const check = await t.call('POST', '/v1/auth/sessions/verify', { token: session.token });
      expect(verifySessionResponseSchema.parse(await check.json()).active).toBe(false);
    }
    expect(t.audit.entries.at(-1)).toMatchObject({
      action: 'auth.sessions_revoked',
      target: first.user.id,
      meta: { count: 2 },
    });
  });

  it('deletes a user with their sessions, audits it and 404s afterwards', async () => {
    const t = await ready();
    const { user, session } = await signInWithGoogle(t);
    expect((await t.call('DELETE', `/v1/auth/users/${user.id}`)).status).toBe(204);
    expect(t.authStore.users).toHaveLength(0);
    expect(t.authStore.sessions).toHaveLength(0);
    expect(t.audit.entries.at(-1)).toMatchObject({
      action: 'auth.user_deleted',
      target: user.id,
      meta: { email: user.email },
    });

    const check = await t.call('POST', '/v1/auth/sessions/verify', { token: session.token });
    expect(verifySessionResponseSchema.parse(await check.json()).active).toBe(false);
    expect((await t.call('DELETE', `/v1/auth/users/${user.id}`)).status).toBe(404);

    // Signing in again is a fresh account.
    expect((await signInWithGoogle(t)).is_new_user).toBe(true);
  });

  it('shows users in the dashboard and keeps destructive actions for admins', async () => {
    const t = await seeded();
    const id = t.authStore.users[0]?.id ?? '';
    const member = t.sessionHeaders(t.member(ORG, 'member'));
    const admin = t.sessionHeaders(t.member(ORG, 'admin'));
    const base = `/app/orgs/${ORG}/auth/users`;

    const list = await t.call('GET', base, undefined, member);
    expect(authUserListResponseSchema.parse(await list.json()).data).toHaveLength(3);
    expect((await t.call('DELETE', `${base}/${id}`, undefined, member)).status).toBe(403);
    expect((await t.call('POST', `${base}/${id}/revoke-sessions`, undefined, member)).status).toBe(
      403,
    );
    expect((await t.call('DELETE', `${base}/${id}`, undefined, admin)).status).toBe(204);
    expect(t.audit.entries.at(-1)?.actor).toMatch(/^user:/);
  });

  it('rejects a non-uuid id and a bad cursor', async () => {
    const t = await ready();
    expect((await t.call('GET', '/v1/auth/users/not-a-uuid')).status).toBe(400);
    expect((await t.call('GET', '/v1/auth/users?cursor=garbage')).status).toBe(400);
  });
});

describe('access tokens', () => {
  async function jwks(t: Setup, orgId = ORG) {
    const res = await t.app.request(`/api/jwks/${orgId}`);
    expect(res.status).toBe(200);
    return { res, keys: ((await res.json()) as { keys: JwksKey[] }).keys };
  }

  it('signs a short-lived JWT that verifies against the public key set, with no API key', async () => {
    const t = await ready();
    const signIn = await signInWithGoogle(t);
    const { res, keys } = await jwks(t);
    expect(res.headers.get('cache-control')).toContain('max-age');
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({ kty: 'EC', crv: 'P-256', use: 'sig', alg: 'ES256' });

    const verified = verifyJwt(signIn.access_token, keys);
    if (!verified.ok) throw new Error(verified.reason);
    expect(verified.claims).toMatchObject({
      iss: 'http://localhost:8080',
      aud: ORG,
      sub: signIn.user.id,
      sid: signIn.session.id,
      email: signIn.user.email,
      email_verified: true,
    });
    const lifetime =
      Date.parse(signIn.access_token_expires_at) - Date.parse(signIn.session.created_at);
    expect(Math.round(lifetime / MINUTE)).toBe(AUTH_ACCESS_TOKEN_TTL_MINUTES);
  });

  it('keeps the private key encrypted and gives every org its own', async () => {
    const t = await ready();
    const signIn = await signInWithGoogle(t);
    const stored = t.authStore.signingKeys[0]?.privateKeyEnc ?? '';
    expect(stored).not.toContain('PRIVATE KEY');
    expect(testCipher.decrypt(stored)).toContain('PRIVATE KEY');

    // Another org publishes no key that verifies this token.
    const other = await jwks(t, ORG_B);
    expect(other.keys).toEqual([]);
    expect(verifyJwt(signIn.access_token, other.keys)).toEqual({
      ok: false,
      reason: 'unknown-key',
    });
    expect((await t.app.request('/api/jwks/not-a-uuid')).status).toBe(404);
  });

  it('refreshes while the session lives and stops when it is revoked', async () => {
    const t = await ready();
    const signIn = await signInWithGoogle(t);
    const refresh = async () =>
      refreshSessionResponseSchema.parse(
        await (
          await t.call('POST', '/v1/auth/sessions/refresh', { token: signIn.session.token })
        ).json(),
      );

    t.advance(20);
    const { keys } = await jwks(t);
    const now = () => new Date(Date.now() + 20 * MINUTE);
    expect(verifyJwt(signIn.access_token, keys, { now })).toEqual({ ok: false, reason: 'expired' });

    const fresh = await refresh();
    expect(fresh.active).toBe(true);
    expect(fresh.user?.id).toBe(signIn.user.id);
    expect(verifyJwt(fresh.access_token ?? '', keys, { now }).ok).toBe(true);
    // The same key keeps signing; one is made per org, not per token.
    expect(t.authStore.signingKeys).toHaveLength(1);

    await t.call('POST', '/v1/auth/sessions/revoke', { token: signIn.session.token });
    expect(await refresh()).toEqual({
      active: false,
      user: null,
      session: null,
      access_token: null,
      access_token_expires_at: null,
    });
  });
});

describe('sign-in email content', () => {
  const send = (t: Setup) =>
    t.call('POST', '/v1/auth/sign-in/magic-link', {
      email: 'grace@example.com',
      redirect_url: REDIRECT,
    });

  it('is never shown in Logs, cannot be resent, and is deleted once delivered', async () => {
    const t = await ready();
    await send(t);
    const id = t.emailStore.rows[0]?.id ?? '';
    expect(t.emailStore.bodies.get(id)?.sensitive).toBe(true);

    // Hidden even before delivery, while the worker still needs it.
    const preview = await t.call('GET', `/v1/emails/${id}/body`);
    expect(await preview.json()).toEqual({ html: null, text: null });
    expect((await t.call('POST', `/v1/emails/${id}/resend`)).status).toBe(400);

    const ordinary = await t.call('POST', '/v1/emails', {
      to: 'someone@example.org',
      subject: 'Hi',
      text: 'hello',
    });
    const ordinaryId = ((await ordinary.json()) as { id: string }).id;
    await t.queue.drain();
    expect(t.emailStore.rows.map((r) => r.status)).toEqual(['sent', 'sent']);
    expect(t.emailStore.bodies.has(id)).toBe(false);
    expect(t.emailStore.bodies.has(ordinaryId)).toBe(true);
  });

  it('uses the workspace template when one is chosen', async () => {
    const t = await ready();
    await t.call('PATCH', '/v1/auth/settings', { app_name: 'Acme' });
    await t.call('POST', '/v1/templates', {
      slug: 'login',
      subject: 'Your {{app_name}} link',
      html: '<a href="{{url}}">Sign in</a> within {{expires_in_minutes}} minutes',
    });
    const saved = await t.call('PATCH', '/v1/auth/settings', {
      email_templates: { magic_link: 'login' },
    });
    expect(authSettingsSchema.parse(await saved.json()).email_templates).toEqual({
      magic_link: 'login',
      email_otp: null,
    });

    expect((await send(t)).status).toBe(202);
    const row = t.emailStore.rows[0];
    const html = t.emailStore.bodies.get(row?.id ?? '')?.html ?? '';
    expect(row?.subject).toBe('Your Acme link');
    expect(html).toContain('prc_');
    expect(html).toContain('within 15 minutes');
    expect(t.emailStore.bodies.get(row?.id ?? '')?.sensitive).toBe(true);
  });

  it('only accepts a template that Postrail can fill in', async () => {
    const t = await ready();
    const create = (slug: string, html: string) =>
      t.call('POST', '/v1/templates', { slug, subject: 'Sign in', html });
    await create('no-link', '<p>Hello {{app_name}}</p>');
    await create('extra', '<a href="{{url}}">Go</a> {{first_name}}');
    await create('code', '<p>{{code}}</p>');
    const choose = (templates: Record<string, string>) =>
      t.call('PATCH', '/v1/auth/settings', { email_templates: templates });

    const missing = await choose({ magic_link: 'nope' });
    expect(missing.status).toBe(400);
    expect((await errorOf(await choose({ magic_link: 'no-link' }))).message).toContain('{{url}}');
    expect((await errorOf(await choose({ magic_link: 'extra' }))).message).toContain('first_name');
    // A code template belongs to the code email, not the link email.
    expect((await choose({ magic_link: 'code' })).status).toBe(400);
    expect((await choose({ email_otp: 'code' })).status).toBe(200);
  });

  it('falls back to the built-in wording when the chosen template is deleted', async () => {
    const t = await ready();
    const created = await t.call('POST', '/v1/templates', {
      slug: 'login',
      subject: 'Custom',
      html: '<a href="{{url}}">Go</a>',
    });
    await t.call('PATCH', '/v1/auth/settings', { email_templates: { magic_link: 'login' } });
    await t.call('DELETE', `/v1/templates/${((await created.json()) as { id: string }).id}`);

    expect((await send(t)).status).toBe(202);
    expect(t.emailStore.rows[0]?.subject).toMatch(/^Sign in to /);
  });
});

describe('closed sign-ups', () => {
  const EMAIL = 'grace@example.com';
  async function closed() {
    const t = await ready();
    const res = await t.call('PATCH', '/v1/auth/settings', { signups_enabled: false });
    expect(authSettingsSchema.parse(await res.json()).signups_enabled).toBe(false);
    return t;
  }
  const link = (t: Setup) =>
    t.call('POST', '/v1/auth/sign-in/magic-link', { email: EMAIL, redirect_url: REDIRECT });

  it('refuses every way in for someone without an account', async () => {
    const t = await closed();
    const refused = await link(t);
    expect(refused.status).toBe(403);
    expect((await errorOf(refused)).message).toMatch(/sign-ups are closed/);
    expect((await t.call('POST', '/v1/auth/sign-in/otp', { email: EMAIL })).status).toBe(403);
    expect(t.emailStore.rows).toHaveLength(0);

    const { location } = await googleCallback(t);
    expect(location.searchParams.get('error')).toBe('signups_disabled');
    expect(location.searchParams.get('code')).toBeNull();
    expect(t.authStore.users).toHaveLength(0);
  });

  it('lets in a user an admin added by hand', async () => {
    const t = await closed();
    const added = await t.call('POST', '/v1/auth/users', { email: 'Grace@Example.com', name: 'G' });
    expect(added.status).toBe(201);
    const user = authUserSchema.parse(await added.json());
    expect(user).toMatchObject({ email: EMAIL, name: 'G', email_verified: false, providers: [] });
    expect(t.audit.entries.at(-1)).toMatchObject({ action: 'auth.user_created', target: user.id });

    expect((await link(t)).status).toBe(202);
    const code = new URL(/https:\/\/\S+/.exec(lastEmailText(t))?.[0] ?? '').searchParams.get(
      'code',
    );
    const res = await t.call('POST', '/v1/auth/exchange', { code });
    const signIn = signInResponseSchema.parse(await res.json());
    expect(signIn.user.id).toBe(user.id);
    // Their first sign-in, and it proved the address.
    expect(signIn.is_new_user).toBe(true);
    expect(signIn.user.email_verified).toBe(true);
  });

  it('will not add the same address twice, and adding is for admins', async () => {
    const t = await ready();
    expect((await t.call('POST', '/v1/auth/users', { email: EMAIL })).status).toBe(201);
    const again = await t.call('POST', '/v1/auth/users', { email: EMAIL });
    expect(again.status).toBe(409);
    expect((await errorOf(again)).code).toBe('CONFLICT');

    const member = t.sessionHeaders(t.member(ORG, 'member'));
    const viaDashboard = await t.call(
      'POST',
      `/app/orgs/${ORG}/auth/users`,
      { email: 'x@example.com' },
      member,
    );
    expect(viaDashboard.status).toBe(403);
  });
});

describe('GitHub sign-in', () => {
  const GITHUB_CALLBACK = '/api/sign-in/github/callback';
  const client = { client_id: 'gh-client', client_secret: 'gh-secret' };

  async function withGithub() {
    const t = await ready();
    const res = await t.call('PATCH', '/v1/auth/settings', {
      github: client,
      methods: { github: true },
    });
    expect(res.status).toBe(200);
    return t;
  }

  async function githubCallback(t: Setup, provider: 'google' | 'github' = 'github') {
    const state = signState({ orgId: ORG, provider, redirectUrl: REDIRECT }, TEST_KEY_HEX);
    const res = await t.app.request(`${GITHUB_CALLBACK}?code=gh-code&state=${state}`);
    return { res, location: new URL(res.headers.get('location') ?? 'http://none.invalid') };
  }

  it('cannot be turned on before the workspace adds its OAuth app', async () => {
    const t = await ready();
    const early = await t.call('PATCH', '/v1/auth/settings', { methods: { github: true } });
    expect(early.status).toBe(400);
    expect((await errorOf(early)).message).toMatch(/client ID and secret/);
    const start = await t.call('POST', '/v1/auth/sign-in/github', { redirect_url: REDIRECT });
    expect(start.status).toBe(403);
  });

  it('starts at GitHub with the workspace client and signs the user in', async () => {
    const t = await withGithub();
    const start = await t.call('POST', '/v1/auth/sign-in/github', { redirect_url: REDIRECT });
    const url = new URL(((await start.json()) as { url: string }).url);
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('gh-client');
    expect(url.searchParams.get('redirect_uri')).toBe(`http://localhost:8080${GITHUB_CALLBACK}`);

    const { res, location } = await githubCallback(t);
    expect(res.status).toBe(302);
    expect(t.githubIdentity.exchanges[0]?.credentials).toEqual({
      clientId: 'gh-client',
      clientSecret: 'gh-secret',
    });
    const exchanged = await t.call('POST', '/v1/auth/exchange', {
      code: location.searchParams.get('code'),
    });
    const signIn = signInResponseSchema.parse(await exchanged.json());
    expect(signIn.user.providers).toEqual(['github']);

    // The same person through Google is the same user, now with both linked.
    const viaGoogle = await signInWithGoogle(t);
    expect(viaGoogle.user.id).toBe(signIn.user.id);
    expect(viaGoogle.user.providers).toEqual(['github', 'google']);
  });

  it('refuses a state that was minted for another provider', async () => {
    const t = await withGithub();
    const { res } = await githubCallback(t, 'google');
    expect(res.status).toBe(400);
    expect(t.authStore.users).toHaveLength(0);
  });

  it('goes off again when the OAuth app is removed', async () => {
    const t = await withGithub();
    const res = await t.call('PATCH', '/v1/auth/settings', { github: null });
    const settings = authSettingsSchema.parse(await res.json());
    expect(settings.methods.github).toBe(false);
    expect(settings.github.client_id).toBeNull();
    expect(t.authStore.settings[0]?.githubClientSecretEnc).toBeNull();
  });
});

describe('user webhooks', () => {
  it('tells subscribers when a user is created, signs in and is deleted', async () => {
    const t = await ready();
    await t.call('POST', '/v1/webhooks', {
      url: 'https://hooks.example.com/postrail',
      events: ['user.created', 'user.signed_in', 'user.deleted'],
    });
    const { user } = await signInWithGoogle(t);
    await signInWithGoogle(t);
    await t.call('DELETE', `/v1/auth/users/${user.id}`);

    const sent = t.webhookStore.deliveries.map((d) => ({
      event: d.event,
      data: (d.payload as { data: Record<string, unknown> }).data,
    }));
    expect(sent.map((s) => s.event)).toEqual([
      'user.created',
      'user.signed_in',
      'user.signed_in',
      'user.deleted',
    ]);
    expect(sent[0]?.data).toMatchObject({ id: user.id, email: user.email, providers: ['google'] });
    expect(sent[1]?.data).toMatchObject({ id: user.id, method: 'google' });
    // Nothing a webhook receiver should not hold.
    expect(JSON.stringify(sent)).not.toMatch(/prs_|prc_|eyJ/);
  });

  it('never lets a failing webhook cost someone their sign-in', async () => {
    const t = await ready();
    t.webhooks.emit = () => Promise.reject(new Error('webhook store is down'));
    const signIn = await signInWithGoogle(t);
    expect(signIn.session.token).toMatch(/^prs_/);
  });
});

describe('OpenAPI for auth', () => {
  it('documents the flows for API keys only and the resources for both', async () => {
    const { app } = createTestApp();
    const doc = (await (await app.request('/openapi.json')).json()) as {
      paths: Record<string, Record<string, { security?: unknown[] }>>;
    };
    const paths = Object.keys(doc.paths);
    expect(paths).toEqual(
      expect.arrayContaining([
        '/v1/auth/sign-in/google',
        '/v1/auth/sign-in/github',
        '/v1/auth/sessions/refresh',
        '/v1/auth/sign-in/magic-link',
        '/v1/auth/sign-in/otp',
        '/v1/auth/sign-in/otp/verify',
        '/v1/auth/exchange',
        '/v1/auth/sessions/verify',
        '/v1/auth/sessions/revoke',
        '/v1/auth/users',
        '/v1/auth/settings',
        '/app/orgs/{orgId}/auth/users/{id}',
        '/app/orgs/{orgId}/auth/settings',
      ]),
    );
    // A session cookie must never be able to mint end-user sessions.
    expect(paths.some((p) => p.startsWith('/app/') && p.includes('/auth/sign-in'))).toBe(false);
    expect(paths).not.toContain('/app/orgs/{orgId}/auth/exchange');
    expect(doc.paths['/v1/auth/exchange']?.post?.security).toEqual([{ bearerAuth: [] }]);
  });
});
