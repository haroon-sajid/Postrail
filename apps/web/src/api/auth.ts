import { magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { API_ORIGIN } from './client';

/** Better Auth client. Sessions live in an httpOnly cookie set by the API. */
export const authClient = createAuthClient({
  baseURL: API_ORIGIN,
  basePath: '/api/auth',
  plugins: [magicLinkClient()],
  fetchOptions: { credentials: 'include' },
});
