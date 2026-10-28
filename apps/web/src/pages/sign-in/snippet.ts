import { PUBLIC_API_URL } from '@/lib/config';
import { KEY_PLACEHOLDER } from '@/pages/overview/onboarding';

export const REDIRECT_PLACEHOLDER = 'https://yourapp.com/auth/callback';

/** The whole integration, server side: start, exchange, refresh. Runs on Node 18+ as is. */
export function signInSnippet(redirectUrl = REDIRECT_PLACEHOLDER): string {
  return `// Server side only: the API key must never reach the browser.
const postrail = (path, body) =>
  fetch('${PUBLIC_API_URL}/v1/auth' + path, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ${KEY_PLACEHOLDER}',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }).then((res) => res.json());

// 1. Start. Redirect the browser to \`url\` for Google (or '/sign-in/github')...
const { url } = await postrail('/sign-in/google', {
  redirect_url: '${redirectUrl}',
});
// ...or email a link instead.
await postrail('/sign-in/magic-link', {
  email: 'someone@example.com',
  redirect_url: '${redirectUrl}',
});

// 2. Both come back to your redirect URL with ?code=... Swap it once.
const { user, session, access_token } = await postrail('/exchange', { code });

// 3. Keep both in httpOnly cookies. When the access token is about to
//    expire, trade the session token for a new one.
const fresh = await postrail('/sessions/refresh', { token: session.token });
if (!fresh.active) {
  // The session was revoked or ran out: sign the user out.
}`;
}

export interface TokenSettings {
  issuer: string;
  audience: string;
  jwks_url: string;
}

/** Checking the access token on every request without a call to Postrail. */
export function verifySnippet(tokens: TokenSettings): string {
  return `// npm install jose
import { createRemoteJWKSet, jwtVerify } from 'jose';

const keys = createRemoteJWKSet(new URL('${tokens.jwks_url}'));

export async function currentUser(accessToken) {
  const { payload } = await jwtVerify(accessToken, keys, {
    issuer: '${tokens.issuer}',
    audience: '${tokens.audience}',
  });
  // payload.sub is the user id, payload.email their address.
  return payload;
}`;
}
