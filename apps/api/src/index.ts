import { serve } from '@hono/node-server';
import { createDb } from '@postrail/db';
import {
  createTokenCipher,
  EnvError,
  getEnv,
  type Env,
  type QueueConfig,
  resolveBrowserOrigins,
  resolveQueueConfig,
} from '@postrail/shared';
import { createApp } from './app';
import { createAuthServer, sessionResolverFor } from './lib/auth-server';
import { type InternalAuth, oidcAuth, sharedSecretAuth } from './lib/internal-auth';
import { createLogger, type Logger } from './lib/logger';
import { createOriginMatcher } from './lib/origins';
import { InMemoryTokenBucket } from './lib/rate-limit';
import { createSystemMailer } from './lib/system-mailer';
import { resolveVersion } from './lib/version';
import { createApiKeyStore } from './modules/api-keys/repo';
import { createApiKeyService } from './modules/api-keys/service';
import { createAuditStore } from './modules/audit/repo';
import { createEmailStore } from './modules/emails/repo';
import { createEmailService } from './modules/emails/service';
import { createEmailWorker } from './modules/emails/worker';
import { createMailboxStore } from './modules/mailboxes/repo';
import { createMailboxService } from './modules/mailboxes/service';
import { createOrgStore } from './modules/orgs/repo';
import { createOrgService } from './modules/orgs/service';
import { createOverviewStore } from './modules/overview/repo';
import { createOverviewService } from './modules/overview/service';
import { createSuppressionStore } from './modules/suppressions/repo';
import { createSuppressionService } from './modules/suppressions/service';
import { createTemplateStore } from './modules/templates/repo';
import { createTemplateService } from './modules/templates/service';
import { createWebhookStore } from './modules/webhooks/repo';
import { createWebhookService } from './modules/webhooks/service';
import { createWebhookWorker } from './modules/webhooks/worker';
import { createGoogleClient } from './providers/google-client';
import { CloudTasksQueue, googleAccessTokenProvider } from './queue/cloud-tasks';
import { LocalQueue } from './queue/local';
import { type Queue } from './queue/types';

function readEnvOrExit(): Env {
  try {
    return getEnv();
  } catch (error) {
    if (error instanceof EnvError) {
      // The logger depends on env, so this is the one place plain stderr is allowed.
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

function buildQueue(
  config: QueueConfig,
  logger: Logger,
): { queue: Queue; internalAuth: InternalAuth; local?: LocalQueue } {
  if (config.driver === 'local') {
    const local = new LocalQueue({ logger });
    return { queue: local, local, internalAuth: sharedSecretAuth(config.internalSecret) };
  }
  return {
    queue: new CloudTasksQueue(config, { getAccessToken: googleAccessTokenProvider() }),
    internalAuth: oidcAuth({
      workerUrl: config.workerUrl,
      serviceAccountEmail: config.serviceAccountEmail,
    }),
  };
}

function main(): void {
  const env = readEnvOrExit();
  const logger = createLogger(env.LOG_LEVEL);
  const version = resolveVersion(env);
  const queueConfig = resolveQueueConfig(env);
  const cipher = createTokenCipher(env.TOKEN_ENCRYPTION_KEY);
  const browserOrigins = resolveBrowserOrigins(env);

  const db = createDb(env.DATABASE_URL);
  const audit = createAuditStore(db);
  const mailboxStore = createMailboxStore(db);
  const emailStore = createEmailStore(db);
  const suppressionStore = createSuppressionStore(db);
  const webhookStore = createWebhookStore(db);
  const orgStore = createOrgStore(db);

  const { queue, internalAuth, local } = buildQueue(queueConfig, logger);

  const mailboxes = createMailboxService({
    store: mailboxStore,
    google: createGoogleClient({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: env.GOOGLE_REDIRECT_URI,
    }),
    cipher,
    stateSecret: env.TOKEN_ENCRYPTION_KEY,
    audit,
  });
  const emails = createEmailService({ messages: emailStore, mailboxes: mailboxStore, queue });
  const webhooks = createWebhookService({ store: webhookStore, cipher, queue, audit });
  const webhookWorker = createWebhookWorker({ store: webhookStore, cipher, queue, logger });
  const worker = createEmailWorker({
    messages: emailStore,
    mailboxes: mailboxStore,
    suppressions: suppressionStore,
    events: webhooks,
    providerFor: mailboxes.providerFor,
    queue,
    logger,
  });
  // In local mode the same process is the worker.
  local?.setHandler((job) =>
    job.kind === 'send-email' ? worker.processSendJob(job) : webhookWorker.processDelivery(job),
  );

  const mailer = createSystemMailer({
    mailboxes: mailboxStore,
    emails,
    systemEmail: env.SYSTEM_MAILBOX_EMAIL,
  });
  const orgs = createOrgService({
    store: orgStore,
    audit,
    mailer,
    dashboardOrigin: env.DASHBOARD_ORIGIN,
  });

  const auth = createAuthServer({
    db,
    env,
    trustedOrigins: [...browserOrigins.origins, ...browserOrigins.patterns],
    sendMagicLink: (email, url) =>
      mailer.send({
        to: email,
        subject: 'Sign in to Postrail',
        text: `Open this link to sign in: ${url}\n\nIt expires in 10 minutes. If you did not request it, ignore this email.`,
        html: `<p><a href="${url}">Sign in to Postrail</a></p><p>The link expires in 10 minutes. If you did not request it, ignore this email.</p>`,
      }),
    onUserCreated: (user) => orgs.ensureDefaultOrg(user),
  });

  const app = createApp({
    version,
    logger,
    apiKeys: createApiKeyService({ store: createApiKeyStore(db), audit }),
    mailboxes,
    emails,
    templates: createTemplateService({ store: createTemplateStore(db), emails }),
    suppressions: createSuppressionService(suppressionStore),
    webhooks,
    orgs,
    orgStore,
    overview: createOverviewService(createOverviewStore(db)),
    worker,
    webhookWorker,
    rateLimiter: new InMemoryTokenBucket(),
    internalAuth,
    sessionResolver: sessionResolverFor(auth),
    authHandler: (request) => auth.handler(request),
    isAllowedOrigin: createOriginMatcher(browserOrigins),
    corsEnabled: env.NODE_ENV !== 'production',
  });

  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info(
      { port: info.port, version, env: env.NODE_ENV, queue: queueConfig.driver },
      'api listening',
    );
  });
}

main();
