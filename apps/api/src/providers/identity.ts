/** What any sign-in provider tells us about the person who just authenticated. */
export interface IdentityProfile {
  /** The provider's stable account id. Survives the user changing their address. */
  id: string;
  email: string;
  /** Whether the provider vouches that the person controls `email`. */
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
}

/**
 * An OAuth provider used to sign in tenants' end users (ADR 0011). Credentials differ per
 * workspace, so they are passed per call, and no provider token outlives the request.
 */
export interface IdentityProvider {
  authUrl: (params: { clientId: string; redirectUri: string; state: string }) => string;
  /** Swaps the authorization code for an access token and reads the profile behind it. */
  fetchProfile: (params: {
    credentials: OAuthCredentials;
    redirectUri: string;
    code: string;
  }) => Promise<IdentityProfile>;
}

/** Used when the provider is down or answers with something we do not recognise. */
export const PROVIDER_UNAVAILABLE = 'provider_unavailable';

/**
 * A sign-in the provider refused or could not complete. `code` is safe to hand to the
 * tenant on the redirect: either the provider's own OAuth error (`invalid_client` for a
 * wrong secret) or PROVIDER_UNAVAILABLE.
 */
export class IdentityProviderError extends Error {
  constructor(readonly code: string) {
    super(`identity provider error: ${code}`);
    this.name = 'IdentityProviderError';
  }
}
