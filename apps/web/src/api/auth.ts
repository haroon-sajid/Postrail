import { magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { API_URL } from '@/lib/config';

/**
 * Better Auth client. Sessions live in an httpOnly cookie set by the API. With no baseURL
 * the client uses the page's own origin, which is the Worker proxy in production;
 * credentials: 'include' covers local dev, where the API is on another port.
 */
export const authClient = createAuthClient({
  ...(API_URL ? { baseURL: API_URL } : {}),
  basePath: '/api/auth',
  plugins: [magicLinkClient()],
  fetchOptions: { credentials: 'include' },
});
