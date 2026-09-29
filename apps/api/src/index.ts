import { serve } from '@hono/node-server';
import { createDb } from '@postrail/db';
import {
  createTokenCipher,
  EnvError,
  getEnv,
  type Env,
  type QueueConfig,
  resolveQueueConfig,
} from '@postrail/shared';
import { createApp } from './app';
import { type InternalAuth, oidcAuth, sharedSecretAuth } from './lib/internal-auth';
import { createLogger, type Logger } from './lib/logger';
import { InMemoryTokenBucket } from './lib/rate-limit';
import { resolveVersion } from './lib/version';
import { createApiKeyStore } from './modules/api-keys/repo';
import { createApiKeyService } from './modules/api-keys/service';
import { createEmailStore } from './modules/emails/repo';
import { createEmailService } from './modules/emails/service';
import { createEmailWorker } from './modules/emails/worker';
import { createMailboxStore } from './modules/mailboxes/repo';
import { createMailboxService } from './modules/mailboxes/service';
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

  const db = createDb(env.DATABASE_URL);
  const mailboxStore = createMailboxStore(db);
  const emailStore = createEmailStore(db);
  const suppressionStore = createSuppressionStore(db);
  const webhookStore = createWebhookStore(db);

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
  });
  const webhooks = createWebhookService({ store: webhookStore, cipher, queue });
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

  const app = createApp({
    version,
    logger,
    apiKeys: createApiKeyService({ store: createApiKeyStore(db) }),
    mailboxes,
    emails: createEmailService({ messages: emailStore, mailboxes: mailboxStore, queue }),
    templates: createTemplateService(createTemplateStore(db)),
    suppressions: createSuppressionService(suppressionStore),
    webhooks,
    worker,
    webhookWorker,
    rateLimiter: new InMemoryTokenBucket(),
    internalAuth,
  });

  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info(
      { port: info.port, version, env: env.NODE_ENV, queue: queueConfig.driver },
      'api listening',
    );
  });
}

main();
