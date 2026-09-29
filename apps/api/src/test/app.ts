import { createApp } from '../app';
import { sharedSecretAuth } from '../lib/internal-auth';
import { silentLogger } from '../lib/logger';
import { InMemoryTokenBucket, type RateLimiter } from '../lib/rate-limit';
import { createApiKeyService } from '../modules/api-keys/service';
import { createEmailService } from '../modules/emails/service';
import { createEmailWorker } from '../modules/emails/worker';
import { createMailboxService, type MailboxServiceDeps } from '../modules/mailboxes/service';
import { createSuppressionService } from '../modules/suppressions/service';
import { createTemplateService } from '../modules/templates/service';
import { createWebhookService } from '../modules/webhooks/service';
import { createWebhookWorker } from '../modules/webhooks/worker';
import { type GoogleClient } from '../providers/google-client';
import { LocalQueue } from '../queue/local';
import {
  fakeGoogleClient,
  fakeWebhookReceiver,
  type InMemoryApiKeyStore,
  type InMemoryEmailStore,
  type InMemoryMailboxStore,
  type InMemoryWebhookStore,
  inMemoryApiKeyStore,
  inMemoryEmailStore,
  inMemoryMailboxStore,
  inMemorySuppressionStore,
  inMemoryTemplateStore,
  inMemoryWebhookStore,
  testCipher,
  TEST_INTERNAL_SECRET,
  TEST_KEY_HEX,
} from './fakes';

export interface TestAppOverrides {
  store?: InMemoryMailboxStore;
  emails?: InMemoryEmailStore;
  apiKeys?: InMemoryApiKeyStore;
  webhooks?: InMemoryWebhookStore;
  google?: GoogleClient;
  rateLimiter?: RateLimiter;
  now?: MailboxServiceDeps['now'];
  /** HTTP status the fake webhook receiver answers with. */
  webhookStatus?: number;
}

/**
 * An app wired to in-memory fakes and a LocalQueue in drain mode: POST /v1/emails only
 * queues, and `queue.drain()` runs the workers. Tests reach into the stores to assert.
 */
export function createTestApp(overrides: TestAppOverrides = {}) {
  const store = overrides.store ?? inMemoryMailboxStore();
  const emailStore = overrides.emails ?? inMemoryEmailStore();
  const apiKeyStore = overrides.apiKeys ?? inMemoryApiKeyStore();
  const webhookStore = overrides.webhooks ?? inMemoryWebhookStore();
  // Templates and suppressions share rows with the email store so CRUD affects sending.
  const templateStore = inMemoryTemplateStore(emailStore.templates);
  const suppressionStore = inMemorySuppressionStore(emailStore.suppressions);
  const google = overrides.google ?? fakeGoogleClient();
  const now = overrides.now ?? (() => new Date());
  const logger = silentLogger();
  const receiver = fakeWebhookReceiver(overrides.webhookStatus);

  const mailboxes = createMailboxService({
    store,
    google,
    cipher: testCipher,
    stateSecret: TEST_KEY_HEX,
    now,
  });
  const queue = new LocalQueue({ autoRun: false });
  const webhooks = createWebhookService({ store: webhookStore, cipher: testCipher, queue, now });
  const webhookWorker = createWebhookWorker({
    store: webhookStore,
    cipher: testCipher,
    queue,
    logger,
    fetchImpl: receiver.fetchImpl,
    now,
  });
  const worker = createEmailWorker({
    messages: emailStore,
    mailboxes: store,
    suppressions: suppressionStore,
    events: webhooks,
    providerFor: mailboxes.providerFor,
    queue,
    logger,
    now,
  });
  queue.setHandler((job) =>
    job.kind === 'send-email' ? worker.processSendJob(job) : webhookWorker.processDelivery(job),
  );

  const emails = createEmailService({ messages: emailStore, mailboxes: store, queue });
  const apiKeys = createApiKeyService({ store: apiKeyStore, now });
  const app = createApp({
    version: 'test',
    logger,
    apiKeys,
    mailboxes,
    emails,
    templates: createTemplateService(templateStore),
    suppressions: createSuppressionService(suppressionStore),
    webhooks,
    worker,
    webhookWorker,
    rateLimiter:
      overrides.rateLimiter ?? new InMemoryTokenBucket({ capacity: 10_000, refillPerSecond: 1000 }),
    internalAuth: sharedSecretAuth(TEST_INTERNAL_SECRET),
  });

  /** Mints a key for `orgId` and returns the headers a client would send. */
  const authHeaders = (orgId: string): Record<string, string> => ({
    authorization: `Bearer ${apiKeyStore.create(orgId).raw}`,
    'content-type': 'application/json',
  });

  const internalHeaders: Record<string, string> = {
    authorization: `Bearer ${TEST_INTERNAL_SECRET}`,
    'content-type': 'application/json',
  };

  return {
    app,
    store,
    emailStore,
    apiKeyStore,
    webhookStore,
    templateStore,
    suppressionStore,
    google,
    mailboxes,
    emails,
    worker,
    webhookWorker,
    webhooks,
    queue,
    receiver,
    authHeaders,
    internalHeaders,
  };
}
