import { z, ZodError } from 'zod';
import { type IdentityProvider, IdentityProviderError, PROVIDER_UNAVAILABLE } from './identity';

const AUTH_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_URL = 'https://api.github.com/user';
const EMAILS_URL = 'https://api.github.com/user/emails';

/** Read the profile and the addresses on the account, nothing else. */
export const GITHUB_SIGN_IN_SCOPES = ['read:user', 'user:email'];

// GitHub answers a failed code exchange with 200 and an `error` field, not a 4xx.
const tokenResponseSchema = z.union([
  z.object({ access_token: z.string().min(1) }),
  z.object({ error: z.string().min(1) }),
]);

const userSchema = z.object({
  id: z.number(),
  login: z.string(),
  name: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
});

const emailsSchema = z.array(
  z.object({ email: z.email(), primary: z.boolean(), verified: z.boolean() }),
);

/** GitHub as a sign-in provider. Tenants bring their own OAuth app; there is no shared one. */
export function createGithubIdentityProvider(fetchImpl: typeof fetch = fetch): IdentityProvider {
  async function api(url: string, accessToken: string): Promise<unknown> {
    const res = await fetchImpl(url, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/vnd.github+json',
        // GitHub rejects API requests that carry no User-Agent.
        'user-agent': 'postrail',
      },
    });
    if (!res.ok) throw new IdentityProviderError(PROVIDER_UNAVAILABLE);
    return res.json();
  }

  return {
    authUrl({ clientId, redirectUri, state }) {
      const url = new URL(AUTH_URL);
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('scope', GITHUB_SIGN_IN_SCOPES.join(' '));
      url.searchParams.set('state', state);
      return url.toString();
    },

    async fetchProfile({ credentials, redirectUri, code }) {
      try {
        const res = await fetchImpl(TOKEN_URL, {
          method: 'POST',
          // Without this header GitHub answers in form encoding instead of JSON.
          headers: { accept: 'application/json' },
          body: new URLSearchParams({
            client_id: credentials.clientId,
            client_secret: credentials.clientSecret,
            code,
            redirect_uri: redirectUri,
          }),
        });
        if (!res.ok) throw new IdentityProviderError(PROVIDER_UNAVAILABLE);
        const token = tokenResponseSchema.parse(await res.json());
        // `incorrect_client_credentials` and `bad_verification_code` arrive here.
        if ('error' in token) throw new IdentityProviderError(token.error);

        const user = userSchema.parse(await api(USER_URL, token.access_token));
        const emails = emailsSchema.parse(await api(EMAILS_URL, token.access_token));
        // The profile's public email is optional and unverified; the primary address from
        // the emails endpoint is the one GitHub actually confirmed.
        const primary = emails.find((e) => e.primary) ?? emails[0];
        if (!primary) throw new IdentityProviderError(PROVIDER_UNAVAILABLE);
        return {
          id: String(user.id),
          email: primary.email,
          emailVerified: primary.verified,
          name: user.name ?? user.login,
          picture: user.avatar_url ?? null,
        };
      } catch (error) {
        if (error instanceof ZodError) throw new IdentityProviderError(PROVIDER_UNAVAILABLE);
        throw error;
      }
    },
  };
}
