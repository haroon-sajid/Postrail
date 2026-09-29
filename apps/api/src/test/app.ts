import { createApp } from '../app';
import { type SessionUser } from '../lib/context';
import { sharedSecretAuth } from '../lib/internal-auth';
import { silentLogger } from '../lib/logger';
import { InMemoryTokenBucket, type RateLimiter } from '../lib/rate-limit';
import { createApiKeyService } from '../modules/api-keys/service';
import { createEmailService } from '../modules/emails/service';
import { createEmailWorker } from '../modules/emails/worker';
import { createMailboxService, type MailboxServiceDeps } from '../modules/mailboxes/service';
import { createOrgService } from '../modules/orgs/service';
import { createOverviewService } from '../modules/overview/service';
import { createSuppressionService } from '../modules/suppressions/service';
import { createTemplateService } from '../modules/templates/service';
import { createWebhookService } from '../modules/webhooks/service';
import { createWebhookWorker } from '../modules/webhooks/worker';
import { type GoogleClient } from '../providers/google-client';
import { LocalQueue } from '../queue/local';
import {
  fakeGoogleClient,
  fakeMailer,
  fakeWebhookReceiver,
  type InMemoryApiKeyStore,
  type InMemoryEmailStore,
  type InMemoryMailboxStore,
  type InMemoryOrgStore,
  type InMemoryWebhookStore,
  inMemoryApiKeyStore,
  inMemoryAuditStore,
  inMemoryEmailStore,
  inMemoryMailboxStore,
  inMemoryOrgStore,
  inMemoryOverviewStore,
  inMemorySuppressionStore,
  inMemoryTemplateStore,
  inMemoryWebhookStore,
  TEST_DASHBOARD_ORIGIN,
  testCipher,
  TEST_INTERNAL_SECRET,
  TEST_KEY_HEX,
} from './fakes';

export interface TestAppOverrides {
  store?: InMemoryMailboxStore;
  emails?: InMemoryEmailStore;
  apiKeys?: InMemoryApiKeyStore;
  webhooks?: InMemoryWebhookStore;
  orgs?: InMemoryOrgStore;
  google?: GoogleClient;
  rateLimiter?: RateLimiter;
  now?: MailboxServiceDeps['now'];
  /** HTTP status the fake webhook receiver answers with. */
  webhookStatus?: number;
  /** Replaces the header-based test session (the e2e server reads a cookie instead). */
  sessionResolver?: (headers: Headers) => Promise<SessionUser | null>;
  dashboardOrigin?: string;
}

/** Test sessions: the user is passed as a header instead of a Better Auth cookie. */
export const TEST_SESSION_HEADER = 'x-test-user';

/**
 * An app wired to in-memory fakes and a LocalQueue in drain mode: POST /v1/emails only
 * queues, and `queue.drain()` runs the workers. Tests reach into the stores to assert.
 */
export function createTestApp(overrides: TestAppOverrides = {}) {
  const store = overrides.store ?? inMemoryMailboxStore();
  const emailStore = overrides.emails ?? inMemoryEmailStore();
  const apiKeyStore = overrides.apiKeys ?? inMemoryApiKeyStore();
  const webhookStore = overrides.webhooks ?? inMemoryWebhookStore();
  const orgStore = overrides.orgs ?? inMemoryOrgStore();
  // Templates and suppressions share rows with the email store so CRUD affects sending.
  const templateStore = inMemoryTemplateStore(emailStore.templates);
  const suppressionStore = inMemorySuppressionStore(emailStore.suppressions);
  const google = overrides.google ?? fakeGoogleClient();
  const now = overrides.now ?? (() => new Date());
  const logger = silentLogger();
  const receiver = fakeWebhookReceiver(overrides.webhookStatus);
  const audit = inMemoryAuditStore();
  const mailer = fakeMailer();

  const mailboxes = createMailboxService({
    store,
    google,
    cipher: testCipher,
    stateSecret: TEST_KEY_HEX,
    audit,
    now,
  });
  const queue = new LocalQueue({ autoRun: false });
  const webhooks = createWebhookService({
    store: webhookStore,
    cipher: testCipher,
    queue,
    audit,
    now,
  });
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
  const apiKeys = createApiKeyService({ store: apiKeyStore, audit, now });
  const orgs = createOrgService({
    store: orgStore,
    audit,
    mailer,
    dashboardOrigin: TEST_DASHBOARD_ORIGIN,
    now,
  });

  const app = createApp({
    version: 'test',
    logger,
    apiKeys,
    mailboxes,
    emails,
    templates: createTemplateService({ store: templateStore, emails }),
    suppressions: createSuppressionService(suppressionStore),
    webhooks,
    orgs,
    orgStore,
    overview: createOverviewService(inMemoryOverviewStore(emailStore, store), now),
    worker,
    webhookWorker,
    rateLimiter:
      overrides.rateLimiter ?? new InMemoryTokenBucket({ capacity: 10_000, refillPerSecond: 1000 }),
    internalAuth: sharedSecretAuth(TEST_INTERNAL_SECRET),
    sessionResolver:
      overrides.sessionResolver ??
      ((headers) => {
        const raw = headers.get(TEST_SESSION_HEADER);
        return Promise.resolve(raw ? (JSON.parse(raw) as SessionUser) : null);
      }),
    dashboardOrigin: overrides.dashboardOrigin ?? TEST_DASHBOARD_ORIGIN,
  });

  /** Mints a key for `orgId` and returns the headers a client would send. */
  const authHeaders = (orgId: string): Record<string, string> => ({
    authorization: `Bearer ${apiKeyStore.create0(orgId).raw}`,
    'content-type': 'application/json',
  });

  /** Headers for a dashboard request by `user`, including the Origin CSRF needs. */
  const sessionHeaders = (user: SessionUser): Record<string, string> => ({
    [TEST_SESSION_HEADER]: JSON.stringify(user),
    origin: TEST_DASHBOARD_ORIGIN,
    'content-type': 'application/json',
  });

  /** Registers a user and makes them a member of `orgId` with `role`. */
  const member = (
    orgId: string,
    role: 'owner' | 'admin' | 'member',
    email?: string,
  ): SessionUser => {
    const id = `10000000-0000-4000-8000-${String(orgStore.users.size + 1).padStart(12, '0')}`;
    const user = {
      id,
      email: email ?? `${role}-${id.slice(-4)}@example.com`,
      name: role,
      image: null,
    };
    orgStore.addUser(id, user.email, role);
    if (!orgStore.orgs.some((o) => o.id === orgId)) {
      orgStore.orgs.push({
        id: orgId,
        name: 'Test Org',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    orgStore.addMember(orgId, id, role);
    return user;
  };

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
    orgStore,
    audit,
    mailer,
    google,
    mailboxes,
    emails,
    orgs,
    worker,
    webhookWorker,
    webhooks,
    queue,
    receiver,
    authHeaders,
    sessionHeaders,
    member,
    internalHeaders,
  };
}
