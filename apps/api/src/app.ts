import { swaggerUI } from '@hono/swagger-ui';
import { cors } from 'hono/cors';
import { requireApiKey } from './lib/auth';
import { csrfProtection } from './lib/csrf';
import { createErrorHandler, notFoundHandler } from './lib/error-handler';
import { type InternalAuth, requireInternalAuth } from './lib/internal-auth';
import { type Logger } from './lib/logger';
import { type OriginMatcher } from './lib/origins';
import { APP_BASE, V1_BASE } from './lib/openapi';
import { rateLimit, type RateLimiter } from './lib/rate-limit';
import { requestLogging } from './lib/request-logging';
import { createRouter } from './lib/router';
import { requireOrgMember, requireSession, type SessionResolver } from './lib/session';
import { apiKeyRoutes } from './modules/api-keys/routes';
import { type ApiKeyService } from './modules/api-keys/service';
import { emailRoutes } from './modules/emails/routes';
import { type EmailService } from './modules/emails/service';
import { type EmailWorker } from './modules/emails/worker';
import { healthRoutes } from './modules/health/routes';
import { internalRoutes } from './modules/internal/routes';
import { googleCallbackRoutes, mailboxRoutes } from './modules/mailboxes/routes';
import { type MailboxService } from './modules/mailboxes/service';
import { type OrgStore } from './modules/orgs/repo';
import { accountRoutes, orgRoutes } from './modules/orgs/routes';
import { type OrgService } from './modules/orgs/service';
import { overviewRoutes } from './modules/overview/routes';
import { type OverviewService } from './modules/overview/service';
import { suppressionRoutes } from './modules/suppressions/routes';
import { type SuppressionService } from './modules/suppressions/service';
import { templateRoutes } from './modules/templates/routes';
import { type TemplateService } from './modules/templates/service';
import { webhookRoutes } from './modules/webhooks/routes';
import { type WebhookService } from './modules/webhooks/service';
import { type WebhookWorker } from './modules/webhooks/worker';

export interface AppDeps {
  version: string;
  logger: Logger;
  apiKeys: ApiKeyService;
  mailboxes: MailboxService;
  emails: EmailService;
  templates: TemplateService;
  suppressions: SuppressionService;
  webhooks: WebhookService;
  orgs: OrgService;
  orgStore: OrgStore;
  overview: OverviewService;
  worker: EmailWorker;
  webhookWorker: WebhookWorker;
  rateLimiter: RateLimiter;
  internalAuth: InternalAuth;
  /** Turns request headers into the signed-in user, or null. */
  sessionResolver: SessionResolver;
  /** Better Auth's request handler for /api/auth/*. Absent in tests. */
  authHandler?: (request: Request) => Promise<Response>;
  /** Browser origins allowed to call /app and /api/auth with cookies. See lib/origins.ts. */
  isAllowedOrigin: OriginMatcher;
}

/** Builds the HTTP app from explicit dependencies so tests never touch real env or DB. */
export function createApp(deps: AppDeps) {
  const app = createRouter();
  // Echo the origin back only when it is trusted; anything else gets no CORS headers.
  const browser = cors({
    origin: (origin) => (deps.isAllowedOrigin(origin) ? origin : null),
    credentials: true,
  });

  app.use(requestLogging(deps.logger));
  app.onError(createErrorHandler(deps.logger));
  app.notFound(notFoundHandler);

  // Sign-in, sign-out, OAuth callbacks and magic-link verification, all owned by Better Auth.
  app.use('/api/auth/*', browser);
  if (deps.authHandler) {
    const handler = deps.authHandler;
    app.on(['GET', 'POST'], '/api/auth/*', (c) => handler(c.req.raw));
  }

  // Everything under /v1 is the authenticated, rate-limited public API.
  app.use('/v1/*', requireApiKey(deps.apiKeys), rateLimit(deps.rateLimiter));

  // Everything under /app is the dashboard: cookie session, trusted origins only, CSRF-checked.
  app.use(
    '/app/*',
    browser,
    csrfProtection(deps.isAllowedOrigin),
    requireSession(deps.sessionResolver),
    rateLimit(deps.rateLimiter),
  );
  app.use('/app/orgs/:orgId', requireOrgMember(deps.orgStore));
  app.use('/app/orgs/:orgId/*', requireOrgMember(deps.orgStore));

  // Everything under /internal is for Cloud Tasks and Cloud Scheduler only.
  app.use('/internal/*', requireInternalAuth(deps.internalAuth));

  app.route('/', healthRoutes({ version: deps.version }));
  app.route('/', googleCallbackRoutes(deps.mailboxes));
  app.route('/', accountRoutes(deps.orgs));
  app.route('/', orgRoutes(deps.orgs));
  app.route('/', apiKeyRoutes(deps.apiKeys));
  app.route('/', overviewRoutes(deps.overview));
  for (const base of [V1_BASE, APP_BASE]) {
    app.route('/', mailboxRoutes(deps.mailboxes, base));
    app.route('/', emailRoutes(deps.emails, base));
    app.route('/', templateRoutes(deps.templates, base));
    app.route('/', suppressionRoutes(deps.suppressions, base));
    app.route('/', webhookRoutes(deps.webhooks, base));
  }
  app.route(
    '/',
    internalRoutes({
      worker: deps.worker,
      webhookWorker: deps.webhookWorker,
      mailboxes: deps.mailboxes,
    }),
  );

  app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    description: 'API key, e.g. `Authorization: Bearer pr_live_...`',
  });
  app.openAPIRegistry.registerComponent('securitySchemes', 'cookieAuth', {
    type: 'apiKey',
    in: 'cookie',
    name: 'better-auth.session_token',
    description: 'Dashboard session cookie set by /api/auth/*',
  });
  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'Postrail API',
      version: deps.version,
      description:
        'Send application email through your own Gmail or Outlook mailboxes. `/v1` takes API keys; `/app` is the dashboard and takes the session cookie. Errors always have the shape `{ error: { code, message } }`.',
    },
  });
  app.get('/docs', swaggerUI({ url: '/openapi.json' }));

  return app;
}

export type App = ReturnType<typeof createApp>;
