import { swaggerUI } from '@hono/swagger-ui';
import { requireApiKey } from './lib/auth';
import { createErrorHandler, notFoundHandler } from './lib/error-handler';
import { type InternalAuth, requireInternalAuth } from './lib/internal-auth';
import { type Logger } from './lib/logger';
import { rateLimit, type RateLimiter } from './lib/rate-limit';
import { requestLogging } from './lib/request-logging';
import { createRouter } from './lib/router';
import { type ApiKeyService } from './modules/api-keys/service';
import { emailRoutes } from './modules/emails/routes';
import { type EmailService } from './modules/emails/service';
import { type EmailWorker } from './modules/emails/worker';
import { healthRoutes } from './modules/health/routes';
import { internalRoutes } from './modules/internal/routes';
import { mailboxRoutes } from './modules/mailboxes/routes';
import { type MailboxService } from './modules/mailboxes/service';
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
  worker: EmailWorker;
  webhookWorker: WebhookWorker;
  rateLimiter: RateLimiter;
  internalAuth: InternalAuth;
}

/** Builds the HTTP app from explicit dependencies so tests never touch real env or DB. */
export function createApp(deps: AppDeps) {
  const app = createRouter();

  app.use(requestLogging(deps.logger));
  app.onError(createErrorHandler(deps.logger));
  app.notFound(notFoundHandler);

  // Everything under /v1 is the authenticated, rate-limited public API.
  app.use('/v1/*', requireApiKey(deps.apiKeys), rateLimit(deps.rateLimiter));
  // Everything under /internal is for Cloud Tasks and Cloud Scheduler only.
  app.use('/internal/*', requireInternalAuth(deps.internalAuth));

  app.route('/', healthRoutes({ version: deps.version }));
  app.route('/', mailboxRoutes(deps.mailboxes));
  app.route('/', emailRoutes(deps.emails));
  app.route('/', templateRoutes(deps.templates));
  app.route('/', suppressionRoutes(deps.suppressions));
  app.route('/', webhookRoutes(deps.webhooks));
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
  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'Postrail API',
      version: deps.version,
      description:
        'Send application email through your own Gmail or Outlook mailboxes. Errors always have the shape `{ error: { code, message } }`.',
    },
  });
  app.get('/docs', swaggerUI({ url: '/openapi.json' }));

  return app;
}

export type App = ReturnType<typeof createApp>;
