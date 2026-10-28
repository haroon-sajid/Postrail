import { createRoute } from '@hono/zod-openapi';
import { AUTH_PROVIDERS, type AuthProvider } from '@postrail/shared';
import { getAuth } from '../../lib/context';
import { AppError } from '../../lib/errors';
import {
  BEARER_SECURITY,
  ERROR_RESPONSES,
  jsonBody,
  jsonContent,
  type RouteBase,
} from '../../lib/openapi';
import { createRouter } from '../../lib/router';
import {
  authSettingsSchema,
  authUserListQuerySchema,
  authUserListResponseSchema,
  authUserSchema,
  createAuthUserRequestSchema,
  exchangeCodeRequestSchema,
  googleCallbackQuerySchema,
  idParamSchema,
  magicLinkRequestSchema,
  oauthSignInRequestSchema,
  oauthSignInResponseSchema,
  otpRequestSchema,
  otpVerifyRequestSchema,
  refreshSessionResponseSchema,
  revokeSessionsResponseSchema,
  sessionTokenRequestSchema,
  signInEmailSentSchema,
  signInResponseSchema,
  updateAuthSettingsRequestSchema,
  uuidSchema,
  verifySessionResponseSchema,
} from './schemas';
import { type AuthService, jwksPath, oauthCallbackPath } from './service';

const PROVIDER_NAME: Record<AuthProvider, string> = { google: 'Google', github: 'GitHub' };

/**
 * Routes with no credentials at all. A provider sends the end user's browser to its
 * callback, where the signed state carries the org and the tenant URL to go on to. The
 * JWKS document is public keys, which is what lets tenants verify tokens offline.
 */
export function authPublicRoutes(service: AuthService) {
  const router = createRouter();
  for (const provider of AUTH_PROVIDERS) {
    router.get(oauthCallbackPath(provider), async (c) => {
      // Every OAuth provider answers with the same three parameters.
      const query = googleCallbackQuerySchema.parse(c.req.query());
      return c.redirect(await service.completeOAuthSignIn(provider, query), 302);
    });
  }
  router.get(jwksPath(':orgId'), async (c) => {
    const orgId = uuidSchema.safeParse(c.req.param('orgId'));
    if (!orgId.success) throw AppError.notFound('key set');
    // Keys are only ever added, so a verifier may cache this for a few minutes.
    c.header('cache-control', 'public, max-age=300');
    return c.json(await service.jwks(orgId.data), 200);
  });
  return router;
}

const TAG = 'Auth';
const security = BEARER_SECURITY;

const oauthRoute = (provider: AuthProvider) =>
  createRoute({
    method: 'post',
    path: `/v1/auth/sign-in/${provider}`,
    tags: [TAG],
    summary: `Start a ${PROVIDER_NAME[provider]} sign-in`,
    description: `Returns a ${PROVIDER_NAME[provider]} consent URL. Redirect the browser to it; the user comes back to \`redirect_url\` with \`?code=...\`, which you swap at \`/v1/auth/exchange\`, or with \`?error=...\`. \`state\` comes back unchanged so you can tie the redirect to the browser that started it.`,
    security,
    request: { body: jsonBody(oauthSignInRequestSchema, 'Where to return the user') },
    responses: {
      200: jsonContent(oauthSignInResponseSchema, 'Redirect the browser here'),
      ...ERROR_RESPONSES,
    },
  });

const magicLinkRoute = createRoute({
  method: 'post',
  path: '/v1/auth/sign-in/magic-link',
  tags: [TAG],
  summary: 'Email a sign-in link',
  description:
    'Sends a link to `redirect_url?code=...` from one of your connected mailboxes. Swap the code at `/v1/auth/exchange`. The link works once and expires after 15 minutes.',
  security,
  request: { body: jsonBody(magicLinkRequestSchema, 'Who to email and where the link leads') },
  responses: { 202: jsonContent(signInEmailSentSchema, 'Email queued'), ...ERROR_RESPONSES },
});

const otpRoute = createRoute({
  method: 'post',
  path: '/v1/auth/sign-in/otp',
  tags: [TAG],
  summary: 'Email a six-digit sign-in code',
  description:
    'Sends a code from one of your connected mailboxes. It expires after 10 minutes and a newer code replaces it.',
  security,
  request: { body: jsonBody(otpRequestSchema, 'Who to email') },
  responses: { 202: jsonContent(signInEmailSentSchema, 'Email queued'), ...ERROR_RESPONSES },
});

const otpVerifyRoute = createRoute({
  method: 'post',
  path: '/v1/auth/sign-in/otp/verify',
  tags: [TAG],
  summary: 'Check an emailed code and sign the user in',
  description: 'Five wrong guesses retire the code.',
  security,
  request: { body: jsonBody(otpVerifyRequestSchema, 'The address and the code the user typed') },
  responses: { 200: jsonContent(signInResponseSchema, 'Signed in'), ...ERROR_RESPONSES },
});

const exchangeRoute = createRoute({
  method: 'post',
  path: '/v1/auth/exchange',
  tags: [TAG],
  summary: 'Swap a redirect code for a user and a session',
  description:
    'Finishes an OAuth or magic-link sign-in. Codes are single use. Returns the session token, which is never shown again, and a short-lived access token (a JWT) you can verify without calling Postrail.',
  security,
  request: { body: jsonBody(exchangeCodeRequestSchema, 'The `code` query parameter') },
  responses: { 200: jsonContent(signInResponseSchema, 'Signed in'), ...ERROR_RESPONSES },
});

const verifySessionRoute = createRoute({
  method: 'post',
  path: '/v1/auth/sessions/verify',
  tags: [TAG],
  summary: 'Check a session token',
  description:
    'Answers `active: false` for an expired, revoked or unknown token; that is not an error. For checks on every request, verify the access token against the JWKS instead.',
  security,
  request: { body: jsonBody(sessionTokenRequestSchema, 'The session token') },
  responses: {
    200: jsonContent(verifySessionResponseSchema, 'Whether the session is live, and whose it is'),
    ...ERROR_RESPONSES,
  },
});

const refreshSessionRoute = createRoute({
  method: 'post',
  path: '/v1/auth/sessions/refresh',
  tags: [TAG],
  summary: 'Get a fresh access token for a session',
  description:
    'Call this when the access token is about to expire. A session that was revoked or expired answers `active: false` and no token, which is how sign-out reaches a tenant that verifies offline.',
  security,
  request: { body: jsonBody(sessionTokenRequestSchema, 'The session token') },
  responses: {
    200: jsonContent(refreshSessionResponseSchema, 'A new access token, or `active: false`'),
    ...ERROR_RESPONSES,
  },
});

const revokeSessionRoute = createRoute({
  method: 'post',
  path: '/v1/auth/sessions/revoke',
  tags: [TAG],
  summary: 'End a session (sign out)',
  security,
  request: { body: jsonBody(sessionTokenRequestSchema, 'The session token') },
  responses: { 204: { description: 'Session ended, or already was' }, ...ERROR_RESPONSES },
});

/** The sign-in flows. For the tenant's backend only, so they exist under /v1 and nowhere else. */
export function authFlowRoutes(service: AuthService) {
  const router = createRouter();
  for (const provider of AUTH_PROVIDERS) {
    router.openapi(oauthRoute(provider), async (c) =>
      c.json({ url: await service.oauthSignInUrl(getAuth(c), provider, c.req.valid('json')) }, 200),
    );
  }
  return router
    .openapi(magicLinkRoute, async (c) =>
      c.json(await service.sendMagicLink(getAuth(c), c.req.valid('json')), 202),
    )
    .openapi(otpRoute, async (c) =>
      c.json(await service.sendOtp(getAuth(c), c.req.valid('json')), 202),
    )
    .openapi(otpVerifyRoute, async (c) =>
      c.json(await service.verifyOtp(getAuth(c), c.req.valid('json')), 200),
    )
    .openapi(exchangeRoute, async (c) =>
      c.json(await service.exchangeCode(getAuth(c), c.req.valid('json').code), 200),
    )
    .openapi(verifySessionRoute, async (c) =>
      c.json(await service.verifySession(getAuth(c), c.req.valid('json').token), 200),
    )
    .openapi(refreshSessionRoute, async (c) =>
      c.json(await service.refreshSession(getAuth(c), c.req.valid('json').token), 200),
    )
    .openapi(revokeSessionRoute, async (c) => {
      await service.revokeSession(getAuth(c), c.req.valid('json').token);
      return c.body(null, 204);
    });
}

/** End users and sign-in settings: resources, so mounted for API keys and the dashboard. */
export function authAdminRoutes(service: AuthService, base: RouteBase) {
  const tags = [`Auth users${base.tagSuffix}`];
  const security = base.security;
  const path = (p: string) => `${base.prefix}${p}`;

  const listRoute = createRoute({
    method: 'get',
    path: path('/auth/users'),
    tags,
    summary: 'List end users',
    description: 'Newest first. Pass next_cursor from the previous page to continue.',
    security,
    request: { params: base.params(), query: authUserListQuerySchema },
    responses: {
      200: jsonContent(authUserListResponseSchema, 'A page of users'),
      ...ERROR_RESPONSES,
    },
  });

  const createUserRoute = createRoute({
    method: 'post',
    path: path('/auth/users'),
    tags,
    summary: 'Add an end user (admin)',
    description:
      'Creates a user who has not signed in yet. This is how people get in while sign-ups are closed.',
    security,
    request: {
      params: base.params(),
      body: jsonBody(createAuthUserRequestSchema, 'Who to add'),
    },
    responses: { 201: jsonContent(authUserSchema, 'The new user'), ...ERROR_RESPONSES },
  });

  const getRoute = createRoute({
    method: 'get',
    path: path('/auth/users/{id}'),
    tags,
    summary: 'Get one end user',
    security,
    request: { params: base.params(idParamSchema) },
    responses: { 200: jsonContent(authUserSchema, 'The user'), ...ERROR_RESPONSES },
  });

  const deleteRoute = createRoute({
    method: 'delete',
    path: path('/auth/users/{id}'),
    tags,
    summary: 'Delete an end user (admin)',
    description: 'Removes the user, their linked providers and every session.',
    security,
    request: { params: base.params(idParamSchema) },
    responses: { 204: { description: 'User deleted' }, ...ERROR_RESPONSES },
  });

  const revokeSessionsRoute = createRoute({
    method: 'post',
    path: path('/auth/users/{id}/revoke-sessions'),
    tags,
    summary: 'Sign a user out everywhere (admin)',
    security,
    request: { params: base.params(idParamSchema) },
    responses: {
      200: jsonContent(revokeSessionsResponseSchema, 'How many sessions were ended'),
      ...ERROR_RESPONSES,
    },
  });

  const getSettingsRoute = createRoute({
    method: 'get',
    path: path('/auth/settings'),
    tags,
    summary: 'Get sign-in settings',
    security,
    request: { params: base.params() },
    responses: { 200: jsonContent(authSettingsSchema, 'Current settings'), ...ERROR_RESPONSES },
  });

  const updateSettingsRoute = createRoute({
    method: 'patch',
    path: path('/auth/settings'),
    tags,
    summary: 'Change sign-in settings (admin)',
    description:
      'Send only what changes. `redirect_urls` replaces the whole list. `google: null` returns to the shared Google client; `github: null` removes the GitHub OAuth app.',
    security,
    request: {
      params: base.params(),
      body: jsonBody(updateAuthSettingsRequestSchema, 'Fields to change'),
    },
    responses: { 200: jsonContent(authSettingsSchema, 'Updated settings'), ...ERROR_RESPONSES },
  });

  return createRouter()
    .openapi(listRoute, async (c) => {
      const { data, nextCursor } = await service.listUsers(getAuth(c), c.req.valid('query'));
      return c.json({ data, next_cursor: nextCursor }, 200);
    })
    .openapi(createUserRoute, async (c) =>
      c.json(await service.createUser(getAuth(c), c.req.valid('json')), 201),
    )
    .openapi(getRoute, async (c) =>
      c.json(await service.getUser(getAuth(c), c.req.valid('param').id), 200),
    )
    .openapi(deleteRoute, async (c) => {
      await service.deleteUser(getAuth(c), c.req.valid('param').id);
      return c.body(null, 204);
    })
    .openapi(revokeSessionsRoute, async (c) =>
      c.json(
        { revoked: await service.revokeUserSessions(getAuth(c), c.req.valid('param').id) },
        200,
      ),
    )
    .openapi(getSettingsRoute, async (c) => c.json(await service.getSettings(getAuth(c)), 200))
    .openapi(updateSettingsRoute, async (c) =>
      c.json(await service.updateSettings(getAuth(c), c.req.valid('json')), 200),
    );
}
