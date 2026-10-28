import { googleProfileSchema } from '@postrail/shared';
import { ZodError } from 'zod';
import {
  AUTH_URL,
  GoogleApiError,
  GoogleOAuthError,
  googleTokenRequest,
  USERINFO_URL,
} from './google-client';
import { type IdentityProvider, IdentityProviderError, PROVIDER_UNAVAILABLE } from './identity';

/** Identity only. None of these is a sensitive scope, so no Google verification is needed. */
export const GOOGLE_SIGN_IN_SCOPES = ['openid', 'email', 'profile'];

/**
 * Google as a sign-in provider. Separate from GoogleClient, which sends mail and is bound
 * to Postrail's own client for good.
 */
export function createGoogleIdentityProvider(fetchImpl: typeof fetch = fetch): IdentityProvider {
  return {
    authUrl({ clientId, redirectUri, state }) {
      const url = new URL(AUTH_URL);
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', GOOGLE_SIGN_IN_SCOPES.join(' '));
      // Let people with several Google accounts choose, instead of silently reusing one.
      url.searchParams.set('prompt', 'select_account');
      url.searchParams.set('state', state);
      return url.toString();
    },

    async fetchProfile({ credentials, redirectUri, code }) {
      try {
        const { accessToken } = await googleTokenRequest(fetchImpl, credentials, {
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        });
        const res = await fetchImpl(USERINFO_URL, {
          headers: { authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) throw new GoogleApiError(res.status, 'userinfo');
        const profile = googleProfileSchema.parse(await res.json());
        return {
          id: profile.sub,
          email: profile.email,
          emailVerified: profile.email_verified === true,
          name: profile.name ?? null,
          picture: profile.picture ?? null,
        };
      } catch (error) {
        if (error instanceof GoogleOAuthError) throw new IdentityProviderError(error.code);
        if (error instanceof GoogleApiError || error instanceof ZodError) {
          throw new IdentityProviderError(PROVIDER_UNAVAILABLE);
        }
        throw error;
      }
    },
  };
}
