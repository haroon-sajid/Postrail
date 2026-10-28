import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  AUTH_ACCESS_TOKEN_TTL_MINUTES,
  AUTH_EMAIL_WINDOW_MINUTES,
  AUTH_EMAILS_PER_WINDOW,
  AUTH_MAGIC_LINK_TTL_MINUTES,
  AUTH_OAUTH_CODE_TTL_MINUTES,
  AUTH_OTP_LENGTH,
  AUTH_OTP_MAX_ATTEMPTS,
  AUTH_OTP_TTL_MINUTES,
  AUTH_SESSION_TTL_DAYS,
  AUTH_TEMPLATE_VARIABLES,
  type AuthEmailKind,
  type AuthMethod,
  type AuthProvider,
  generateSigningKey,
  JWT_ALG,
  type JwksKey,
  normalizeRedirectUrl,
  sha256Hex,
  signJwt,
  signState,
  type TokenCipher,
  verifyState,
  type WebhookEvent,
} from '@postrail/shared';
import { type AuthContext, requireRole } from '../../lib/context';
import { AppError } from '../../lib/errors';
import { type EventBus } from '../../lib/events';
import {
  type IdentityProvider,
  IdentityProviderError,
  type OAuthCredentials,
} from '../../providers/identity';
import { type AuditStore } from '../audit/repo';
import { type EmailStore } from '../emails/repo';
import { decodeCursor, encodeCursor, type EmailService } from '../emails/service';
import { type OrgStore } from '../orgs/repo';
import {
  type AuthSessionRow,
  type AuthSettingsPatch,
  type AuthSettingsRow,
  type AuthStore,
  type AuthUserView,
} from './repo';
import {
  type AuthSession,
  type AuthSettings,
  type AuthUser,
  type AuthUserListQuery,
  type CreateAuthUserRequest,
  type GoogleCallbackQuery,
  type MagicLinkRequest,
  type OAuthSignInRequest,
  type OtpRequest,
  type OtpVerifyRequest,
  type RefreshSessionResponse,
  type SendEmailRequest,
  type SignInEmailSent,
  type SignInResponse,
  signInStateSchema,
  type UpdateAuthSettingsRequest,
  type VerifySessionResponse,
} from './schemas';

/** Where a provider sends the browser back to. Tenants add this to their own OAuth client. */
export const oauthCallbackPath = (provider: AuthProvider) => `/api/sign-in/${provider}/callback`;

/** Where an org's public signing keys are published. */
export const jwksPath = (orgId: string) => `/api/jwks/${orgId}`;

/** Prefixes make a leaked value recognisable, and keep these apart from `pr_live_` keys. */
export const SESSION_TOKEN_PREFIX = 'prs_';
export const SIGN_IN_CODE_PREFIX = 'prc_';

const PROVIDER_NAME: Record<AuthProvider, string> = { google: 'Google', github: 'GitHub' };

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export interface AuthServiceDeps {
  store: AuthStore;
  providers: Record<AuthProvider, IdentityProvider>;
  /** Postrail's own Google client, used until a workspace saves its own. */
  sharedGoogle: OAuthCredentials;
  /** Encrypts client secrets and private signing keys at rest. */
  cipher: TokenCipher;
  /** HMAC secret for the OAuth state. Any long random string; the token key works. */
  stateSecret: string;
  /** Public origin of this API. Providers redirect back to it and it is the token issuer. */
  apiOrigin: string;
  /** Sign-in emails are ordinary messages: queued here, delivered by the worker. */
  emails: Pick<EmailService, 'send'>;
  /** For workspaces that write their own sign-in emails. */
  findTemplate: EmailStore['findTemplate'];
  orgs: Pick<OrgStore, 'getOrg'>;
  events?: EventBus;
  audit?: AuditStore;
  now?: () => Date;
}

/**
 * Sign-in for a tenant's end users (ADR 0011). Every method acts for the org in `auth`;
 * the exceptions are `completeOAuthSignIn`, whose org comes from the signed state, and
 * `jwks`, which publishes public keys.
 */
export interface AuthService {
  getSettings: (auth: AuthContext) => Promise<AuthSettings>;
  updateSettings: (auth: AuthContext, input: UpdateAuthSettingsRequest) => Promise<AuthSettings>;

  /** Where to send the browser to sign in with `provider`. */
  oauthSignInUrl: (
    auth: AuthContext,
    provider: AuthProvider,
    input: OAuthSignInRequest,
  ) => Promise<string>;
  /**
   * Finishes the provider's redirect and returns the tenant URL to send the browser on
   * to, carrying either `code` or `error`. Throws only when that URL cannot be trusted.
   */
  completeOAuthSignIn: (provider: AuthProvider, query: GoogleCallbackQuery) => Promise<string>;
  sendMagicLink: (auth: AuthContext, input: MagicLinkRequest) => Promise<SignInEmailSent>;
  sendOtp: (auth: AuthContext, input: OtpRequest) => Promise<SignInEmailSent>;
  verifyOtp: (auth: AuthContext, input: OtpVerifyRequest) => Promise<SignInResponse>;
  /** Swaps the `code` from an OAuth or magic-link redirect for a user and a session. */
  exchangeCode: (auth: AuthContext, code: string) => Promise<SignInResponse>;

  verifySession: (auth: AuthContext, token: string) => Promise<VerifySessionResponse>;
  /** A new access token for a live session, so the tenant can keep verifying offline. */
  refreshSession: (auth: AuthContext, token: string) => Promise<RefreshSessionResponse>;
  /** Idempotent: an unknown or already ended session is not an error. */
  revokeSession: (auth: AuthContext, token: string) => Promise<void>;
  /** The org's public signing keys. Not secret, so it takes no AuthContext. */
  jwks: (orgId: string) => Promise<{ keys: JwksKey[] }>;

  listUsers: (
    auth: AuthContext,
    query: AuthUserListQuery,
  ) => Promise<{ data: AuthUser[]; nextCursor: string | null }>;
  getUser: (auth: AuthContext, id: string) => Promise<AuthUser>;
  /** Adds a user by hand, e.g. while sign-ups are closed. */
  createUser: (auth: AuthContext, input: CreateAuthUserRequest) => Promise<AuthUser>;
  deleteUser: (auth: AuthContext, id: string) => Promise<void>;
  /** Signs the user out everywhere. Returns how many sessions were ended. */
  revokeUserSessions: (auth: AuthContext, id: string) => Promise<number>;
}

type Settings = Omit<AuthSettingsRow, 'orgId' | 'createdAt' | 'updatedAt'>;

/** What a workspace gets before it has saved anything. */
const DEFAULT_SETTINGS: Settings = {
  appName: null,
  redirectUrls: [],
  googleEnabled: true,
  magicLinkEnabled: true,
  emailOtpEnabled: true,
  googleClientId: null,
  googleClientSecretEnc: null,
  githubEnabled: false,
  githubClientId: null,
  githubClientSecretEnc: null,
  signupsEnabled: true,
  magicLinkTemplate: null,
  otpTemplate: null,
};

/** One message for unknown, expired and used codes, so a probe learns nothing. */
const invalidCode = () => AppError.validation('invalid or expired code');
const signupsClosed = () => AppError.forbidden('sign-ups are closed for this workspace');

export function createAuthService(deps: AuthServiceDeps): AuthService {
  const { store, providers, sharedGoogle, cipher, stateSecret, emails, findTemplate, orgs } = deps;
  const { events, audit } = deps;
  const now = deps.now ?? (() => new Date());
  const origin = deps.apiOrigin.replace(/\/+$/, '');
  const callbackUrl = (provider: AuthProvider) => `${origin}${oauthCallbackPath(provider)}`;

  const minutesFromNow = (minutes: number) => new Date(now().getTime() + minutes * MINUTE_MS);

  async function loadSettings(orgId: string): Promise<Settings> {
    return (await store.getSettings(orgId)) ?? DEFAULT_SETTINGS;
  }

  function toSettings(orgId: string, s: Settings): AuthSettings {
    return {
      app_name: s.appName,
      redirect_urls: s.redirectUrls,
      methods: {
        google: s.googleEnabled,
        github: s.githubEnabled,
        magic_link: s.magicLinkEnabled,
        email_otp: s.emailOtpEnabled,
      },
      signups_enabled: s.signupsEnabled,
      google: {
        mode: s.googleClientId ? 'custom' : 'shared',
        client_id: s.googleClientId,
        callback_url: callbackUrl('google'),
      },
      github: { client_id: s.githubClientId, callback_url: callbackUrl('github') },
      email_templates: { magic_link: s.magicLinkTemplate, email_otp: s.otpTemplate },
      tokens: { issuer: origin, audience: orgId, jwks_url: `${origin}${jwksPath(orgId)}` },
    };
  }

  const isEnabled = (s: Settings, provider: AuthProvider) =>
    provider === 'google' ? s.googleEnabled : s.githubEnabled;

  /** The OAuth client to use for `provider`, or undefined when the workspace has none. */
  function credentialsFor(s: Settings, provider: AuthProvider): OAuthCredentials | undefined {
    const [clientId, secretEnc] =
      provider === 'google'
        ? [s.googleClientId, s.googleClientSecretEnc]
        : [s.githubClientId, s.githubClientSecretEnc];
    if (clientId && secretEnc) return { clientId, clientSecret: cipher.decrypt(secretEnc) };
    // Only Google has a client of Postrail's own to fall back on.
    return provider === 'google' ? sharedGoogle : undefined;
  }

  function assertEnabled(enabled: boolean, method: string): void {
    if (!enabled) throw AppError.forbidden(`${method} is turned off for this workspace`);
  }

  /** The registered form of `redirectUrl`, or a 400 when the workspace has not allowed it. */
  function allowedRedirect(s: Settings, redirectUrl: string): string {
    const normalized = normalizeRedirectUrl(redirectUrl);
    if (!s.redirectUrls.includes(normalized)) {
      throw AppError.validation(
        'redirect_url is not an allowed redirect URL for this workspace; add it under Sign-in methods',
      );
    }
    return normalized;
  }

  async function assertEmailBudget(orgId: string, email: string): Promise<void> {
    const since = minutesFromNow(-AUTH_EMAIL_WINDOW_MINUTES);
    if ((await store.countEmailedSince(orgId, email, since)) >= AUTH_EMAILS_PER_WINDOW) {
      throw new AppError(
        'RATE_LIMITED',
        `too many sign-in emails to this address; try again in ${AUTH_EMAIL_WINDOW_MINUTES} minutes`,
        429,
      );
    }
  }

  /** With sign-ups closed, a sign-in email only goes to someone who already has an account. */
  async function assertMaySignIn(orgId: string, s: Settings, email: string): Promise<void> {
    if (!s.signupsEnabled && !(await store.findUserByEmail(orgId, email))) throw signupsClosed();
  }

  /** A workspace's own template must exist and use only what Postrail can fill in. */
  async function assertTemplateFits(orgId: string, kind: AuthEmailKind, slug: string) {
    const template = await findTemplate(orgId, slug);
    if (!template) throw AppError.validation(`template "${slug}" not found`);
    const allowed: readonly string[] = AUTH_TEMPLATE_VARIABLES[kind];
    const required = AUTH_TEMPLATE_VARIABLES[kind][0];
    const unknown = template.variables.filter((v) => !allowed.includes(v));
    if (unknown.length > 0) {
      throw AppError.validation(
        `template "${slug}" uses variables Postrail does not fill in: ${unknown.join(', ')}`,
      );
    }
    if (!template.variables.includes(required)) {
      throw AppError.validation(`template "${slug}" must contain {{${required}}}`);
    }
  }

  /** The workspace's template when it has one that still exists, else the built-in wording. */
  async function signInEmail(
    orgId: string,
    s: Settings,
    kind: AuthEmailKind,
    email: string,
    secret: string,
  ): Promise<SendEmailRequest> {
    const appName = s.appName ?? (await orgs.getOrg(orgId))?.name ?? 'your account';
    const slug = kind === 'magic_link' ? s.magicLinkTemplate : s.otpTemplate;
    // A template deleted after it was chosen must not lock every user out.
    if (slug && (await findTemplate(orgId, slug))) {
      const minutes = kind === 'magic_link' ? AUTH_MAGIC_LINK_TTL_MINUTES : AUTH_OTP_TTL_MINUTES;
      return {
        to: email,
        template: slug,
        variables: {
          [AUTH_TEMPLATE_VARIABLES[kind][0]]: secret,
          app_name: appName,
          email,
          expires_in_minutes: minutes,
        },
      };
    }
    const content =
      kind === 'magic_link' ? magicLinkEmail(appName, secret) : otpEmail(appName, secret);
    return { to: email, ...content };
  }

  /** Queues the email; if that fails the challenge is useless, so it must not linger. */
  async function sendSignInEmail(
    auth: AuthContext,
    challengeId: string,
    message: SendEmailRequest,
  ): Promise<void> {
    try {
      // Sensitive: the content would sign its reader in, so Logs never shows it.
      await emails.send(auth, message, undefined, { sensitive: true });
    } catch (error) {
      await store.deleteChallenge(auth.orgId, challengeId);
      throw error;
    }
  }

  /** Tells the tenant's webhooks. A failure here must never cost someone their sign-in. */
  async function emit(orgId: string, event: WebhookEvent, data: Record<string, unknown>) {
    await events?.emit(orgId, event, data).catch(() => undefined);
  }

  async function emitCreated(orgId: string, userId: string): Promise<void> {
    const user = await store.getUser(orgId, userId);
    if (user) await emit(orgId, 'user.created', toUser(user));
  }

  /** The org's current key pair, made on first use so idle workspaces hold no keys. */
  async function signingKey(orgId: string) {
    const existing = await store.latestSigningKey(orgId);
    if (existing) return existing;
    const pair = generateSigningKey();
    return store.createSigningKey(orgId, {
      id: randomUUID(),
      publicJwk: pair.publicJwk,
      privateKeyEnc: cipher.encrypt(pair.privateKeyPem),
    });
  }

  async function accessToken(orgId: string, user: AuthUserView, session: AuthSessionRow) {
    const key = await signingKey(orgId);
    const issuedAt = now().getTime();
    // Never valid past the session it speaks for.
    const expiresAt = new Date(
      Math.min(issuedAt + AUTH_ACCESS_TOKEN_TTL_MINUTES * MINUTE_MS, session.expiresAt.getTime()),
    );
    const token = signJwt(
      {
        iss: origin,
        aud: orgId,
        sub: user.id,
        sid: session.id,
        email: user.email,
        email_verified: user.emailVerified,
        name: user.name,
        iat: Math.floor(issuedAt / 1000),
        exp: Math.floor(expiresAt.getTime() / 1000),
      },
      cipher.decrypt(key.privateKeyEnc),
      key.id,
    );
    return { access_token: token, access_token_expires_at: expiresAt.toISOString() };
  }

  async function issueSession(
    orgId: string,
    userId: string,
    method: AuthMethod,
  ): Promise<SignInResponse> {
    const at = now();
    const signIn = await store.recordSignIn(orgId, userId, at);
    const user = signIn ? await store.getUser(orgId, userId) : undefined;
    // The user can be deleted between a code being issued and redeemed.
    if (!signIn || !user) throw invalidCode();

    // 256 random bits; only the hash is stored, the caller gets the token once.
    const token = `${SESSION_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
    const session = await store.createSession(orgId, {
      userId,
      tokenHash: sha256Hex(token),
      expiresAt: new Date(at.getTime() + AUTH_SESSION_TTL_DAYS * DAY_MS),
    });
    const response: SignInResponse = {
      user: toUser(user),
      session: { ...toSession(session), token },
      ...(await accessToken(orgId, user, session)),
      is_new_user: signIn.firstSignIn,
    };
    await emit(orgId, 'user.signed_in', { ...response.user, method });
    return response;
  }

  /** The live session behind a token and its user, or undefined when either is gone. */
  async function liveSession(orgId: string, token: string) {
    const session = await store.findSessionByHash(orgId, sha256Hex(token));
    if (!session || session.revokedAt || session.expiresAt.getTime() <= now().getTime()) {
      return undefined;
    }
    const user = await store.getUser(orgId, session.userId);
    return user ? { session, user } : undefined;
  }

  async function userOr404(orgId: string, id: string): Promise<AuthUserView> {
    const user = await store.getUser(orgId, id);
    if (!user) throw AppError.notFound('user');
    return user;
  }

  return {
    async getSettings(auth) {
      return toSettings(auth.orgId, await loadSettings(auth.orgId));
    },

    async updateSettings(auth, input) {
      requireRole(auth, 'admin');
      const { orgId } = auth;
      const patch: AuthSettingsPatch = {};
      if (input.app_name !== undefined) patch.appName = input.app_name;
      if (input.redirect_urls !== undefined) {
        patch.redirectUrls = [...new Set(input.redirect_urls.map(normalizeRedirectUrl))];
      }
      if (input.signups_enabled !== undefined) patch.signupsEnabled = input.signups_enabled;
      if (input.methods?.google !== undefined) patch.googleEnabled = input.methods.google;
      if (input.methods?.github !== undefined) patch.githubEnabled = input.methods.github;
      if (input.methods?.magic_link !== undefined) {
        patch.magicLinkEnabled = input.methods.magic_link;
      }
      if (input.methods?.email_otp !== undefined) patch.emailOtpEnabled = input.methods.email_otp;
      if (input.google !== undefined) {
        patch.googleClientId = input.google?.client_id ?? null;
        patch.googleClientSecretEnc = input.google
          ? cipher.encrypt(input.google.client_secret)
          : null;
      }
      if (input.github !== undefined) {
        patch.githubClientId = input.github?.client_id ?? null;
        patch.githubClientSecretEnc = input.github
          ? cipher.encrypt(input.github.client_secret)
          : null;
        // Without an OAuth app there is nothing to sign in with.
        if (!input.github) patch.githubEnabled = false;
      }
      const templates = input.email_templates;
      if (templates?.magic_link !== undefined) {
        if (templates.magic_link)
          await assertTemplateFits(orgId, 'magic_link', templates.magic_link);
        patch.magicLinkTemplate = templates.magic_link;
      }
      if (templates?.email_otp !== undefined) {
        if (templates.email_otp) await assertTemplateFits(orgId, 'email_otp', templates.email_otp);
        patch.otpTemplate = templates.email_otp;
      }

      const next = { ...(await loadSettings(orgId)), ...patch };
      if (next.githubEnabled && !next.githubClientId) {
        throw AppError.validation('GitHub sign-in needs a client ID and secret first');
      }

      const row = await store.saveSettings(orgId, patch);
      await audit?.record(orgId, {
        actor: auth.actor,
        action: 'auth.settings_updated',
        // Which settings changed, never their values: one of them is a client secret.
        meta: { fields: Object.keys(input) },
      });
      return toSettings(orgId, row);
    },

    async oauthSignInUrl(auth, provider, input) {
      const settings = await loadSettings(auth.orgId);
      assertEnabled(isEnabled(settings, provider), `${PROVIDER_NAME[provider]} sign-in`);
      const redirectUrl = allowedRedirect(settings, input.redirect_url);
      const credentials = credentialsFor(settings, provider);
      if (!credentials) {
        throw AppError.validation(
          `${PROVIDER_NAME[provider]} sign-in needs a client ID and secret; add them under Sign-in methods`,
        );
      }
      const state = signState(
        {
          orgId: auth.orgId,
          provider,
          redirectUrl,
          ...(input.state ? { state: input.state } : {}),
        },
        stateSecret,
        { now },
      );
      return providers[provider].authUrl({
        clientId: credentials.clientId,
        redirectUri: callbackUrl(provider),
        state,
      });
    },

    async completeOAuthSignIn(provider, query) {
      const verified = verifyState(query.state, stateSecret, signInStateSchema, { now });
      if (!verified.ok) throw AppError.validation(`invalid sign-in state (${verified.reason})`);
      const { orgId, redirectUrl, state } = verified.payload;
      // A state minted for one provider must not complete a sign-in at another's callback.
      if (verified.payload.provider !== provider) {
        throw AppError.validation('invalid sign-in state (wrong provider)');
      }

      // The state alone is not permission: the workspace may have removed the URL since.
      const settings = await loadSettings(orgId);
      if (!settings.redirectUrls.includes(redirectUrl)) {
        throw AppError.forbidden('this redirect URL is no longer allowed for the workspace');
      }
      const back = (params: Record<string, string>): string => {
        const url = new URL(redirectUrl);
        for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
        if (state) url.searchParams.set('state', state);
        return url.toString();
      };

      if (query.error) return back({ error: query.error });
      if (!query.code) return back({ error: 'missing_code' });
      const credentials = credentialsFor(settings, provider);
      if (!isEnabled(settings, provider) || !credentials)
        return back({ error: 'provider_disabled' });

      let profile;
      try {
        profile = await providers[provider].fetchProfile({
          credentials,
          redirectUri: callbackUrl(provider),
          code: query.code,
        });
      } catch (error) {
        // A wrong client secret shows up here as `invalid_client`; the tenant needs to see it.
        if (error instanceof IdentityProviderError) return back({ error: error.code });
        throw error;
      }
      // An unverified address could belong to anyone, and email is how users are matched.
      if (!profile.emailVerified) return back({ error: 'email_not_verified' });

      const resolved = await store.resolveUserByIdentity(
        orgId,
        {
          provider,
          providerUserId: profile.id,
          email: profile.email.toLowerCase(),
          name: profile.name,
          image: profile.picture,
        },
        settings.signupsEnabled,
      );
      if (!resolved) return back({ error: 'signups_disabled' });
      if (resolved.created) await emitCreated(orgId, resolved.user.id);

      const code = newCode();
      await store.createChallenge(orgId, {
        id: randomUUID(),
        kind: 'oauth_code',
        email: resolved.user.email,
        userId: resolved.user.id,
        provider,
        tokenHash: sha256Hex(code),
        expiresAt: minutesFromNow(AUTH_OAUTH_CODE_TTL_MINUTES),
      });
      return back({ code });
    },

    async sendMagicLink(auth, input) {
      const { orgId } = auth;
      const settings = await loadSettings(orgId);
      assertEnabled(settings.magicLinkEnabled, 'Magic link sign-in');
      const redirectUrl = allowedRedirect(settings, input.redirect_url);
      const email = input.email.toLowerCase();
      await assertMaySignIn(orgId, settings, email);
      await assertEmailBudget(orgId, email);

      const id = randomUUID();
      const code = newCode();
      const expiresAt = minutesFromNow(AUTH_MAGIC_LINK_TTL_MINUTES);
      await store.createChallenge(orgId, {
        id,
        kind: 'magic_link',
        email,
        userId: null,
        tokenHash: sha256Hex(code),
        expiresAt,
      });

      const link = new URL(redirectUrl);
      link.searchParams.set('code', code);
      if (input.state) link.searchParams.set('state', input.state);
      await sendSignInEmail(
        auth,
        id,
        await signInEmail(orgId, settings, 'magic_link', email, link.toString()),
      );
      return { email, expires_at: expiresAt.toISOString() };
    },

    async sendOtp(auth, input) {
      const { orgId } = auth;
      const settings = await loadSettings(orgId);
      assertEnabled(settings.emailOtpEnabled, 'Email code sign-in');
      const email = input.email.toLowerCase();
      await assertMaySignIn(orgId, settings, email);
      await assertEmailBudget(orgId, email);

      const id = randomUUID();
      const code = newOtp();
      const expiresAt = minutesFromNow(AUTH_OTP_TTL_MINUTES);
      await store.supersedeOtps(orgId, email, now());
      await store.createChallenge(orgId, {
        id,
        kind: 'email_otp',
        email,
        userId: null,
        tokenHash: otpHash(id, code),
        expiresAt,
      });
      await sendSignInEmail(auth, id, await signInEmail(orgId, settings, 'email_otp', email, code));
      return { email, expires_at: expiresAt.toISOString() };
    },

    async verifyOtp(auth, input) {
      const { orgId } = auth;
      const email = input.email.toLowerCase();
      const challenge = await store.findActiveOtp(orgId, email, now());
      if (!challenge) throw invalidCode();

      // Count the guess before checking it, so parallel guesses cannot outrun the limit.
      const attempts = await store.countOtpAttempt(orgId, challenge.id);
      if (attempts > AUTH_OTP_MAX_ATTEMPTS) {
        await store.consumeChallenge(orgId, challenge.id, now());
        throw AppError.validation('too many wrong codes; request a new one');
      }
      if (!safeEqual(challenge.tokenHash, otpHash(challenge.id, input.code))) throw invalidCode();
      // Claim first: of two requests with the right code, only one gets a session.
      if (!(await store.consumeChallenge(orgId, challenge.id, now()))) throw invalidCode();

      const { signupsEnabled } = await loadSettings(orgId);
      const resolved = await store.resolveUserByEmail(orgId, email, signupsEnabled);
      if (!resolved) throw signupsClosed();
      if (resolved.created) await emitCreated(orgId, resolved.user.id);
      return issueSession(orgId, resolved.user.id, 'email_otp');
    },

    async exchangeCode(auth, code) {
      const { orgId } = auth;
      const challenge = await store.redeemCode(orgId, sha256Hex(code), now());
      if (!challenge) throw invalidCode();
      // An OAuth code already names its user; an emailed link proves an address instead.
      if (challenge.userId) {
        return issueSession(orgId, challenge.userId, challenge.provider ?? 'google');
      }
      const { signupsEnabled } = await loadSettings(orgId);
      const resolved = await store.resolveUserByEmail(orgId, challenge.email, signupsEnabled);
      if (!resolved) throw signupsClosed();
      if (resolved.created) await emitCreated(orgId, resolved.user.id);
      return issueSession(orgId, resolved.user.id, 'magic_link');
    },

    async verifySession(auth, token) {
      const live = await liveSession(auth.orgId, token);
      if (!live) return { active: false, user: null, session: null };
      return { active: true, user: toUser(live.user), session: toSession(live.session) };
    },

    async refreshSession(auth, token) {
      const live = await liveSession(auth.orgId, token);
      if (!live) {
        return {
          active: false,
          user: null,
          session: null,
          access_token: null,
          access_token_expires_at: null,
        };
      }
      return {
        active: true,
        user: toUser(live.user),
        session: toSession(live.session),
        ...(await accessToken(auth.orgId, live.user, live.session)),
      };
    },

    async revokeSession(auth, token) {
      const session = await store.findSessionByHash(auth.orgId, sha256Hex(token));
      if (session) await store.revokeSession(auth.orgId, session.id, now());
    },

    async jwks(orgId) {
      const keys = await store.listSigningKeys(orgId);
      return {
        keys: keys.map((key) => ({ ...key.publicJwk, kid: key.id, use: 'sig', alg: JWT_ALG })),
      };
    },

    async listUsers(auth, query) {
      const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
      const rows = await store.listUsers(auth.orgId, query.limit + 1, cursor, query.q);
      const page = rows.slice(0, query.limit);
      const last = page.at(-1);
      const nextCursor = rows.length > query.limit && last ? encodeCursor(last) : null;
      return { data: page.map(toUser), nextCursor };
    },

    async getUser(auth, id) {
      return toUser(await userOr404(auth.orgId, id));
    },

    async createUser(auth, input) {
      requireRole(auth, 'admin');
      const email = input.email.toLowerCase();
      const row = await store.createUser(auth.orgId, { email, name: input.name ?? null });
      if (!row) throw AppError.conflict(`${email} is already a user`);
      await audit?.record(auth.orgId, {
        actor: auth.actor,
        action: 'auth.user_created',
        target: row.id,
        meta: { email },
      });
      const user = toUser({ ...row, providers: [] });
      await emit(auth.orgId, 'user.created', user);
      return user;
    },

    async deleteUser(auth, id) {
      requireRole(auth, 'admin');
      const user = await userOr404(auth.orgId, id);
      if (!(await store.deleteUser(auth.orgId, id))) throw AppError.notFound('user');
      await audit?.record(auth.orgId, {
        actor: auth.actor,
        action: 'auth.user_deleted',
        target: id,
        meta: { email: user.email },
      });
      await emit(auth.orgId, 'user.deleted', toUser(user));
    },

    async revokeUserSessions(auth, id) {
      requireRole(auth, 'admin');
      await userOr404(auth.orgId, id);
      const revoked = await store.revokeUserSessions(auth.orgId, id, now());
      await audit?.record(auth.orgId, {
        actor: auth.actor,
        action: 'auth.sessions_revoked',
        target: id,
        meta: { count: revoked },
      });
      return revoked;
    },
  };
}

/** 192 random bits. Carried in a URL, redeemed once, stored only as a hash. */
function newCode(): string {
  return `${SIGN_IN_CODE_PREFIX}${randomBytes(24).toString('base64url')}`;
}

function newOtp(): string {
  return String(randomInt(0, 10 ** AUTH_OTP_LENGTH)).padStart(AUTH_OTP_LENGTH, '0');
}

/** Salted with the challenge id so equal codes never share a hash. */
function otpHash(challengeId: string, code: string): string {
  return sha256Hex(`${challengeId}.${code}`);
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// Neither subject carries the secret: subjects are listed in Logs and sent to webhooks.
function magicLinkEmail(appName: string, link: string) {
  const note = `It expires in ${AUTH_MAGIC_LINK_TTL_MINUTES} minutes and works once. If you did not ask for it, ignore this email.`;
  return {
    subject: `Sign in to ${appName}`,
    text: `Open this link to sign in to ${appName}:\n\n${link}\n\n${note}`,
    html: `<p>Open this link to sign in to <strong>${escapeHtml(appName)}</strong>.</p><p><a href="${escapeHtml(link)}">Sign in</a></p><p>${note}</p>`,
  };
}

function otpEmail(appName: string, code: string) {
  const note = `It expires in ${AUTH_OTP_TTL_MINUTES} minutes. If you did not ask for it, ignore this email.`;
  return {
    subject: `Your sign-in code for ${appName}`,
    text: `Your sign-in code for ${appName} is ${code}\n\n${note}`,
    html: `<p>Your sign-in code for <strong>${escapeHtml(appName)}</strong> is</p><p style="font-size:24px;letter-spacing:4px"><strong>${code}</strong></p><p>${note}</p>`,
  };
}

function toUser(row: AuthUserView): AuthUser {
  return {
    id: row.id,
    email: row.email,
    email_verified: row.emailVerified,
    name: row.name,
    image: row.image,
    providers: row.providers,
    created_at: row.createdAt.toISOString(),
    last_sign_in_at: row.lastSignInAt ? row.lastSignInAt.toISOString() : null,
  };
}

function toSession(row: AuthSessionRow): AuthSession {
  return {
    id: row.id,
    user_id: row.userId,
    expires_at: row.expiresAt.toISOString(),
    created_at: row.createdAt.toISOString(),
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
