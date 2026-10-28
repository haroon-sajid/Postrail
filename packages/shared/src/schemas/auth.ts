import { z } from 'zod';
import {
  AUTH_MAX_REDIRECT_URLS,
  AUTH_OTP_LENGTH,
  AUTH_PROVIDERS,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '../constants';
import { uuidSchema } from './common';
import { templateSlugSchema } from './templates';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Where a sign-in may send the browser back to. https everywhere, http only on the
 * developer's own machine, and no query or fragment: the registered URL is compared
 * exactly and Postrail appends `code` and `state` itself.
 */
export function isRedirectUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.search || url.hash || url.username || url.password) return false;
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname);
}

/** The form redirect URLs are stored and compared in, e.g. a bare origin gains its `/`. */
export function normalizeRedirectUrl(value: string): string {
  const url = new URL(value);
  return `${url.origin}${url.pathname}`;
}

export const redirectUrlSchema = z
  .string()
  .max(2048)
  .refine(isRedirectUrl, 'must be an https URL (http on localhost) without a query or fragment');

/** Opaque value the tenant gets back on the redirect, to tie the flow to one browser. */
const passthroughStateSchema = z.string().min(1).max(512);

export const authMethodsSchema = z.object({
  google: z.boolean(),
  github: z.boolean(),
  magic_link: z.boolean(),
  email_otp: z.boolean(),
});
export type AuthMethods = z.infer<typeof authMethodsSchema>;

/** Which stored template a sign-in email uses. Null is Postrail's built-in wording. */
export const authEmailTemplatesSchema = z.object({
  magic_link: z.string().nullable(),
  email_otp: z.string().nullable(),
});

/** How sign-in is configured for a workspace. Client secrets are never returned. */
export const authSettingsSchema = z.object({
  /** Name used in sign-in emails. Null falls back to the workspace name. */
  app_name: z.string().nullable(),
  redirect_urls: z.array(z.string()),
  methods: authMethodsSchema,
  /** When false, only people who already have an account can sign in. */
  signups_enabled: z.boolean(),
  google: z.object({
    /** `shared` uses Postrail's Google client; `custom` uses the workspace's own. */
    mode: z.enum(['shared', 'custom']),
    client_id: z.string().nullable(),
    /** The authorised redirect URI to add to a custom Google client. */
    callback_url: z.string(),
  }),
  github: z.object({
    /** Null until the workspace adds its GitHub OAuth app; there is no shared one. */
    client_id: z.string().nullable(),
    /** The authorization callback URL to set on the GitHub OAuth app. */
    callback_url: z.string(),
  }),
  email_templates: authEmailTemplatesSchema,
  /** What a tenant needs to verify an access token without calling Postrail. */
  tokens: z.object({
    issuer: z.string(),
    audience: z.string(),
    jwks_url: z.string(),
  }),
});
export type AuthSettings = z.infer<typeof authSettingsSchema>;

/** A workspace's own OAuth client: Google Cloud Console, or a GitHub OAuth app. */
export const oauthClientSchema = z.object({
  client_id: z.string().trim().min(1).max(255),
  client_secret: z.string().trim().min(1).max(255),
});
export type OAuthClientInput = z.infer<typeof oauthClientSchema>;

export const updateAuthSettingsRequestSchema = z
  .object({
    app_name: z.string().trim().min(1).max(80).nullable().optional(),
    redirect_urls: z.array(redirectUrlSchema).max(AUTH_MAX_REDIRECT_URLS).optional(),
    methods: authMethodsSchema.partial().optional(),
    signups_enabled: z.boolean().optional(),
    /** Null goes back to Postrail's shared Google client. */
    google: oauthClientSchema.nullable().optional(),
    /** Null removes the GitHub OAuth app and turns GitHub sign-in off. */
    github: oauthClientSchema.nullable().optional(),
    /** A template slug, or null for the built-in wording. */
    email_templates: z
      .object({
        magic_link: templateSlugSchema.nullable().optional(),
        email_otp: templateSlugSchema.nullable().optional(),
      })
      .optional(),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), { message: 'nothing to update' });
export type UpdateAuthSettingsRequest = z.infer<typeof updateAuthSettingsRequestSchema>;

/** Public shape of an end user: someone who signs in to the tenant's app. */
export const authUserSchema = z.object({
  id: uuidSchema,
  email: z.email(),
  email_verified: z.boolean(),
  name: z.string().nullable(),
  image: z.string().nullable(),
  /** Linked sign-in providers. Empty for a user who has only used emailed links or codes. */
  providers: z.array(z.enum(AUTH_PROVIDERS)),
  created_at: z.iso.datetime(),
  last_sign_in_at: z.iso.datetime().nullable(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

/** Adds a user by hand, which is how people get in while sign-ups are closed. */
export const createAuthUserRequestSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(1).max(120).optional(),
});
export type CreateAuthUserRequest = z.infer<typeof createAuthUserRequestSchema>;

export const authUserListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  cursor: z.string().min(1).optional(),
  /** Case-insensitive substring match on the email or the name. */
  q: z.string().trim().min(1).max(200).optional(),
});
export type AuthUserListQuery = z.infer<typeof authUserListQuerySchema>;

export const authUserListResponseSchema = z.object({
  data: z.array(authUserSchema),
  next_cursor: z.string().nullable(),
});

export const authSessionSchema = z.object({
  id: uuidSchema,
  user_id: uuidSchema,
  expires_at: z.iso.datetime(),
  created_at: z.iso.datetime(),
});
export type AuthSession = z.infer<typeof authSessionSchema>;

/** Body of `POST /v1/auth/sign-in/{provider}`. */
export const oauthSignInRequestSchema = z.object({
  redirect_url: redirectUrlSchema,
  state: passthroughStateSchema.optional(),
});
export type OAuthSignInRequest = z.infer<typeof oauthSignInRequestSchema>;

export const oauthSignInResponseSchema = z.object({ url: z.url() });

export const magicLinkRequestSchema = z.object({
  email: z.email(),
  redirect_url: redirectUrlSchema,
  state: passthroughStateSchema.optional(),
});
export type MagicLinkRequest = z.infer<typeof magicLinkRequestSchema>;

export const otpRequestSchema = z.object({ email: z.email() });
export type OtpRequest = z.infer<typeof otpRequestSchema>;

/** A sign-in email was queued. `expires_at` is when its link or code stops working. */
export const signInEmailSentSchema = z.object({
  email: z.email(),
  expires_at: z.iso.datetime(),
});
export type SignInEmailSent = z.infer<typeof signInEmailSentSchema>;

export const otpVerifyRequestSchema = z.object({
  email: z.email(),
  code: z
    .string()
    .regex(new RegExp(`^\\d{${AUTH_OTP_LENGTH}}$`), `must be ${AUTH_OTP_LENGTH} digits`),
});
export type OtpVerifyRequest = z.infer<typeof otpVerifyRequestSchema>;

/** The `code` Postrail put on the redirect back to the tenant's app. */
export const exchangeCodeRequestSchema = z.object({ code: z.string().min(1).max(200) });

/**
 * Two credentials come out of a sign-in. `session.token` is long-lived, revocable and
 * appears here and nowhere else (only its hash is stored). `access_token` is a short-lived
 * signed JWT the tenant can verify on every request without calling Postrail.
 */
export const signInResponseSchema = z.object({
  user: authUserSchema,
  session: authSessionSchema.extend({ token: z.string() }),
  access_token: z.string(),
  access_token_expires_at: z.iso.datetime(),
  is_new_user: z.boolean(),
});
export type SignInResponse = z.infer<typeof signInResponseSchema>;

export const sessionTokenRequestSchema = z.object({ token: z.string().min(1).max(200) });

/** Introspection: an expired, revoked or unknown token is `active: false`, not an error. */
export const verifySessionResponseSchema = z.object({
  active: z.boolean(),
  user: authUserSchema.nullable(),
  session: authSessionSchema.nullable(),
});
export type VerifySessionResponse = z.infer<typeof verifySessionResponseSchema>;

/** A fresh access token for a live session. A dead session answers `active: false`. */
export const refreshSessionResponseSchema = verifySessionResponseSchema.extend({
  access_token: z.string().nullable(),
  access_token_expires_at: z.iso.datetime().nullable(),
});
export type RefreshSessionResponse = z.infer<typeof refreshSessionResponseSchema>;

export const revokeSessionsResponseSchema = z.object({ revoked: z.number().int() });

/** What the signed OAuth `state` carries from the start call to the provider's callback. */
export const signInStateSchema = z.object({
  orgId: uuidSchema,
  provider: z.enum(AUTH_PROVIDERS),
  redirectUrl: z.string(),
  state: z.string().optional(),
});
export type SignInState = z.infer<typeof signInStateSchema>;
