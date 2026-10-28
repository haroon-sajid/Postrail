import { describe, expect, it } from 'vitest';
import { createGoogleIdentityProvider, GOOGLE_SIGN_IN_SCOPES } from './google-identity';
import { IdentityProviderError, PROVIDER_UNAVAILABLE } from './identity';

const credentials = { clientId: 'client-1', clientSecret: 'secret-1' };
const redirectUri = 'https://api.example.com/api/sign-in/google/callback';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Answers the token call, then the userinfo call, and records both requests. */
function fakeFetch(token: Response, userinfo?: Response) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const impl = ((url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url,
      init,
    });
    return Promise.resolve(calls.length === 1 ? token : (userinfo ?? json({}, 500)));
  }) as typeof fetch;
  return { impl, calls };
}

describe('createGoogleIdentityProvider', () => {
  it('asks for identity scopes only and never for offline access', () => {
    const url = new URL(
      createGoogleIdentityProvider().authUrl({ clientId: 'client-1', redirectUri, state: 's' }),
    );
    expect(url.searchParams.get('client_id')).toBe('client-1');
    expect(url.searchParams.get('redirect_uri')).toBe(redirectUri);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')?.split(' ')).toEqual(GOOGLE_SIGN_IN_SCOPES);
    expect(url.searchParams.get('state')).toBe('s');
    expect(url.searchParams.has('access_type')).toBe(false);
  });

  it('swaps the code with the given credentials and maps the profile', async () => {
    const { impl, calls } = fakeFetch(
      json({ access_token: 'at-1', expires_in: 3600 }),
      json({
        sub: '1234',
        email: 'ada@example.com',
        email_verified: true,
        name: 'Ada',
        picture: 'https://example.com/a.png',
      }),
    );
    const profile = await createGoogleIdentityProvider(impl).fetchProfile({
      credentials,
      redirectUri,
      code: 'code-1',
    });
    expect(profile).toEqual({
      id: '1234',
      email: 'ada@example.com',
      emailVerified: true,
      name: 'Ada',
      picture: 'https://example.com/a.png',
    });

    const form = calls[0]?.init?.body;
    expect(form).toBeInstanceOf(URLSearchParams);
    expect(Object.fromEntries(form as URLSearchParams)).toEqual({
      client_id: 'client-1',
      client_secret: 'secret-1',
      grant_type: 'authorization_code',
      code: 'code-1',
      redirect_uri: redirectUri,
    });
    expect(calls[1]?.init?.headers).toEqual({ authorization: 'Bearer at-1' });
  });

  it('treats a missing email_verified as unverified and fills absent fields with null', async () => {
    const { impl } = fakeFetch(
      json({ access_token: 'at-1', expires_in: 3600 }),
      json({ sub: '1234', email: 'ada@example.com' }),
    );
    const profile = await createGoogleIdentityProvider(impl).fetchProfile({
      credentials,
      redirectUri,
      code: 'code-1',
    });
    expect(profile).toMatchObject({ emailVerified: false, name: null, picture: null });
  });

  it("surfaces Google's OAuth error code, e.g. a wrong client secret", async () => {
    const { impl } = fakeFetch(json({ error: 'invalid_client' }, 401));
    const attempt = createGoogleIdentityProvider(impl).fetchProfile({
      credentials,
      redirectUri,
      code: 'code-1',
    });
    await expect(attempt).rejects.toBeInstanceOf(IdentityProviderError);
    await expect(attempt).rejects.toMatchObject({ code: 'invalid_client' });
  });

  it('reports the provider as unavailable when userinfo fails or answers nonsense', async () => {
    for (const userinfo of [json({}, 503), json({ unexpected: true })]) {
      const { impl } = fakeFetch(json({ access_token: 'at-1', expires_in: 3600 }), userinfo);
      await expect(
        createGoogleIdentityProvider(impl).fetchProfile({ credentials, redirectUri, code: 'c' }),
      ).rejects.toMatchObject({ code: PROVIDER_UNAVAILABLE });
    }
  });
});
