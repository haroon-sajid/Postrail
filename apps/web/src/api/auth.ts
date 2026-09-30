import { magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { API_URL } from '@/lib/config';

/**
 * Better Auth client. Sessions live in an httpOnly cookie set by the API, which is on
 * another origin, so every request must carry credentials or the cookie stays home.
 */
export const authClient = createAuthClient({
  baseURL: API_URL,
  basePath: '/api/auth',
  plugins: [magicLinkClient()],
  fetchOptions: { credentials: 'include' },
});
