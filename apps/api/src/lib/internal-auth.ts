import { timingSafeEqual } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { type MiddlewareHandler } from 'hono';
import { type AppEnv } from './context';
import { AppError } from './errors';

/** Decides whether a call to /internal/* comes from our own infrastructure. */
export interface InternalAuth {
  verify: (authorization: string | undefined, requestPath: string) => Promise<boolean>;
}

function bearerToken(authorization: string | undefined): string | undefined {
  return /^Bearer\s+(\S+)$/i.exec(authorization ?? '')?.[1];
}

/** Local development: a long random secret shared between the API and whoever calls it. */
export function sharedSecretAuth(secret: string): InternalAuth {
  const expected = Buffer.from(secret);
  return {
    verify: (authorization) => {
      const token = bearerToken(authorization);
      if (!token) return Promise.resolve(false);
      const actual = Buffer.from(token);
      return Promise.resolve(
        actual.length === expected.length && timingSafeEqual(actual, expected),
      );
    },
  };
}

export interface OidcClaims {
  email?: string;
  email_verified?: boolean;
}

export interface OidcAuthOptions {
  /** Base URL of the deployed API; the audience must be this origin plus the request path. */
  workerUrl: string;
  /** Only tokens minted for this service account are accepted. */
  serviceAccountEmail: string;
  /** Verifies signature, expiry and audience. Defaults to Google's certificates. */
  verifyIdToken?: (idToken: string, audience: string) => Promise<OidcClaims | undefined>;
}

/**
 * Production: Cloud Tasks and Cloud Scheduler attach a Google-signed OIDC token whose
 * audience is the URL they were told to call. We check the signature, the audience (so a
 * token for one endpoint cannot be replayed against another) and the signing account.
 */
export function oidcAuth(options: OidcAuthOptions): InternalAuth {
  const verify = options.verifyIdToken ?? googleIdTokenVerifier();
  const origin = new URL(options.workerUrl).origin;
  return {
    verify: async (authorization, requestPath) => {
      const token = bearerToken(authorization);
      if (!token) return false;
      const audience = `${origin}${requestPath}`;
      try {
        const claims = await verify(token, audience);
        return (
          claims?.email_verified === true &&
          claims.email?.toLowerCase() === options.serviceAccountEmail.toLowerCase()
        );
      } catch {
        return false;
      }
    },
  };
}

function googleIdTokenVerifier(): NonNullable<OidcAuthOptions['verifyIdToken']> {
  const client = new OAuth2Client();
  return async (idToken, audience) => {
    const ticket = await client.verifyIdToken({ idToken, audience });
    const payload = ticket.getPayload();
    return payload
      ? {
          ...(payload.email ? { email: payload.email } : {}),
          ...(payload.email_verified !== undefined
            ? { email_verified: payload.email_verified }
            : {}),
        }
      : undefined;
  };
}

export function requireInternalAuth(auth: InternalAuth): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const ok = await auth.verify(c.req.header('authorization'), c.req.path);
    if (!ok) throw AppError.unauthorized('internal endpoint');
    await next();
  };
}
