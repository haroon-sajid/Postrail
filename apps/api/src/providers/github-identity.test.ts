import { describe, expect, it } from 'vitest';
import { createGithubIdentityProvider, GITHUB_SIGN_IN_SCOPES } from './github-identity';
import { PROVIDER_UNAVAILABLE } from './identity';

const credentials = { clientId: 'gh-client', clientSecret: 'gh-secret' };
const redirectUri = 'https://api.example.com/api/sign-in/github/callback';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Answers the token call, then /user, then /user/emails, and records each request. */
function fakeFetch(...responses: Response[]) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const impl = ((url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url,
      init,
    });
    return Promise.resolve(responses[calls.length - 1] ?? json({}, 500));
  }) as typeof fetch;
  return { impl, calls };
}

const token = () => json({ access_token: 'gho_1', token_type: 'bearer' });
const user = () => json({ id: 42, login: 'ada', name: 'Ada Lovelace', avatar_url: 'https://a/1' });
const fetchProfile = (impl: typeof fetch) =>
  createGithubIdentityProvider(impl).fetchProfile({ credentials, redirectUri, code: 'code-1' });

describe('createGithubIdentityProvider', () => {
  it('asks only to read the profile and the email addresses', () => {
    const url = new URL(
      createGithubIdentityProvider().authUrl({ clientId: 'gh-client', redirectUri, state: 's' }),
    );
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('gh-client');
    expect(url.searchParams.get('redirect_uri')).toBe(redirectUri);
    expect(url.searchParams.get('scope')?.split(' ')).toEqual(GITHUB_SIGN_IN_SCOPES);
    expect(url.searchParams.get('state')).toBe('s');
  });

  it('swaps the code and takes the primary address GitHub verified', async () => {
    const { impl, calls } = fakeFetch(
      token(),
      user(),
      json([
        { email: 'old@example.com', primary: false, verified: true },
        { email: 'ada@example.com', primary: true, verified: true },
      ]),
    );
    expect(await fetchProfile(impl)).toEqual({
      id: '42',
      email: 'ada@example.com',
      emailVerified: true,
      name: 'Ada Lovelace',
      picture: 'https://a/1',
    });

    const form = calls[0]?.init?.body;
    expect(Object.fromEntries(form as URLSearchParams)).toEqual({
      client_id: 'gh-client',
      client_secret: 'gh-secret',
      code: 'code-1',
      redirect_uri: redirectUri,
    });
    expect(calls.map((c) => c.url)).toEqual([
      'https://github.com/login/oauth/access_token',
      'https://api.github.com/user',
      'https://api.github.com/user/emails',
    ]);
    expect(calls[1]?.init?.headers).toMatchObject({ authorization: 'Bearer gho_1' });
  });

  it('reports an unverified primary address as unverified, and falls back to the login', async () => {
    const { impl } = fakeFetch(
      token(),
      json({ id: 42, login: 'ada', name: null }),
      json([{ email: 'ada@example.com', primary: true, verified: false }]),
    );
    expect(await fetchProfile(impl)).toMatchObject({
      emailVerified: false,
      name: 'ada',
      picture: null,
    });
  });

  it("surfaces GitHub's error, which arrives with a 200", async () => {
    const { impl } = fakeFetch(json({ error: 'incorrect_client_credentials' }));
    await expect(fetchProfile(impl)).rejects.toMatchObject({
      code: 'incorrect_client_credentials',
    });
  });

  it('reports the provider as unavailable when the API fails or has no address', async () => {
    for (const responses of [
      [token(), json({}, 503)],
      [token(), user(), json([])],
    ]) {
      const { impl } = fakeFetch(...responses);
      await expect(fetchProfile(impl)).rejects.toMatchObject({ code: PROVIDER_UNAVAILABLE });
    }
  });
});
