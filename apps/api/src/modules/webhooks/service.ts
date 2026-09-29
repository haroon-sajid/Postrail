import { randomBytes, randomUUID } from 'node:crypto';
import { type TokenCipher, WEBHOOK_EVENTS, type WebhookEvent } from '@postrail/shared';
import { type AuthContext, requireRole } from '../../lib/context';
import { AppError } from '../../lib/errors';
import { type EventBus } from '../../lib/events';
import { type Queue } from '../../queue/types';
import { type AuditStore } from '../audit/repo';
import { type DeliveryRow, type EndpointRow, type WebhookStore } from './repo';
import {
  type CreateWebhookRequest,
  type UpdateWebhookRequest,
  type Webhook,
  type WebhookCreated,
  type WebhookDelivery,
  type WebhookPayload,
} from './schemas';

export interface WebhookServiceDeps {
  store: WebhookStore;
  cipher: TokenCipher;
  queue: Queue;
  audit?: AuditStore;
  now?: () => Date;
}

export interface WebhookService extends EventBus {
  create: (auth: AuthContext, input: CreateWebhookRequest) => Promise<WebhookCreated>;
  list: (orgId: string) => Promise<Webhook[]>;
  get: (orgId: string, id: string) => Promise<Webhook>;
  update: (auth: AuthContext, id: string, patch: UpdateWebhookRequest) => Promise<Webhook>;
  remove: (auth: AuthContext, id: string) => Promise<void>;
  listDeliveries: (orgId: string, endpointId: string, limit: number) => Promise<WebhookDelivery[]>;
  /** Puts a delivery back on the queue right now, whatever its state. */
  retryDelivery: (
    auth: AuthContext,
    endpointId: string,
    deliveryId: string,
  ) => Promise<WebhookDelivery>;
  /** Sends a sample event to one endpoint so the receiver can be checked. */
  sendTest: (auth: AuthContext, endpointId: string) => Promise<{ deliveryId: string }>;
  /** Mints a new secret; the old one stops verifying immediately. Returned once. */
  rotateSecret: (auth: AuthContext, id: string) => Promise<WebhookCreated>;
}

export function createWebhookService(deps: WebhookServiceDeps): WebhookService {
  const { store, cipher, queue, audit } = deps;
  const now = deps.now ?? (() => new Date());

  // 192 bits, shown once. Stored encrypted because we need it back to sign deliveries.
  const newSecret = () => `whsec_${randomBytes(24).toString('base64url')}`;

  async function endpointOr404(orgId: string, id: string): Promise<EndpointRow> {
    const row = await store.getEndpoint(orgId, id);
    if (!row) throw AppError.notFound('webhook');
    return row;
  }

  async function enqueueDelivery(
    orgId: string,
    endpoint: EndpointRow,
    event: WebhookEvent,
    data: Record<string, unknown>,
  ) {
    const id = randomUUID();
    const payload: WebhookPayload = { id, event, created_at: now().toISOString(), data };
    const messageId = typeof data.id === 'string' && event.startsWith('email.') ? data.id : null;
    await store.createDelivery(orgId, { id, endpointId: endpoint.id, messageId, event, payload });
    await queue.enqueue({ kind: 'deliver-webhook', orgId, deliveryId: id }, { taskId: id });
    return id;
  }

  return {
    async create(auth, input) {
      requireRole(auth, 'admin');
      const secret = newSecret();
      const row = await store.createEndpoint(auth.orgId, {
        url: input.url,
        events: input.events,
        secretEnc: cipher.encrypt(secret),
      });
      await audit?.record(auth.orgId, {
        actor: auth.actor,
        action: 'webhook.created',
        target: row.id,
        meta: { url: input.url },
      });
      return { ...toWebhook(row), secret };
    },

    async list(orgId) {
      return (await store.listEndpoints(orgId)).map(toWebhook);
    },

    async get(orgId, id) {
      return toWebhook(await endpointOr404(orgId, id));
    },

    async update(auth, id, patch) {
      requireRole(auth, 'admin');
      const row = await store.updateEndpoint(auth.orgId, id, {
        ...(patch.url !== undefined ? { url: patch.url } : {}),
        ...(patch.events !== undefined ? { events: patch.events } : {}),
      });
      if (!row) throw AppError.notFound('webhook');
      await audit?.record(auth.orgId, {
        actor: auth.actor,
        action: 'webhook.updated',
        target: id,
        meta: { ...patch },
      });
      return toWebhook(row);
    },

    async remove(auth, id) {
      requireRole(auth, 'admin');
      if (!(await store.deleteEndpoint(auth.orgId, id))) throw AppError.notFound('webhook');
      await audit?.record(auth.orgId, { actor: auth.actor, action: 'webhook.deleted', target: id });
    },

    async listDeliveries(orgId, endpointId, limit) {
      await endpointOr404(orgId, endpointId);
      return (await store.listDeliveries(orgId, endpointId, limit)).map(toDelivery);
    },

    async retryDelivery(auth, endpointId, deliveryId) {
      const delivery = await store.getDelivery(auth.orgId, deliveryId);
      if (!delivery || delivery.endpointId !== endpointId) throw AppError.notFound('delivery');
      await store.requeueDelivery(auth.orgId, deliveryId);
      // A unique task name per manual retry; Cloud Tasks remembers earlier ones.
      await queue.enqueue(
        { kind: 'deliver-webhook', orgId: auth.orgId, deliveryId },
        { taskId: `${deliveryId}-manual-${now().getTime()}` },
      );
      return toDelivery({ ...delivery, status: 'pending', nextRetryAt: null });
    },

    async sendTest(auth, endpointId) {
      const endpoint = await endpointOr404(auth.orgId, endpointId);
      const event = endpoint.events.find(isWebhookEvent) ?? 'email.sent';
      const deliveryId = await enqueueDelivery(
        auth.orgId,
        endpoint,
        event,
        sampleData(event, now()),
      );
      return { deliveryId };
    },

    async rotateSecret(auth, id) {
      requireRole(auth, 'admin');
      const row = await endpointOr404(auth.orgId, id);
      const secret = newSecret();
      await store.updateSecret(auth.orgId, id, cipher.encrypt(secret));
      await audit?.record(auth.orgId, {
        actor: auth.actor,
        action: 'webhook.secret_rotated',
        target: id,
      });
      return { ...toWebhook(row), secret };
    },

    /** One delivery row and one task per subscribed endpoint. Payloads are frozen here. */
    async emit(orgId, event, data) {
      for (const endpoint of await store.listEndpointsForEvent(orgId, event)) {
        await enqueueDelivery(orgId, endpoint, event, data);
      }
    },
  };
}

/** Clearly-marked fake data so a receiver under development can see the real shape. */
function sampleData(event: WebhookEvent, now: Date): Record<string, unknown> {
  const at = now.toISOString();
  if (event === 'mailbox.disconnected') {
    return {
      test: true,
      id: randomUUID(),
      email: 'sender@example.com',
      provider: 'google',
      status: 'disconnected',
    };
  }
  return {
    test: true,
    id: randomUUID(),
    status: event === 'email.sent' ? 'sent' : 'failed',
    to: 'recipient@example.com',
    from: 'sender@example.com',
    subject: 'Postrail test event',
    mailbox_id: randomUUID(),
    idempotency_key: null,
    provider_message_id: event === 'email.sent' ? 'test-provider-id' : null,
    error: event === 'email.failed' ? 'test failure' : null,
    attempts: 1,
    created_at: at,
    sent_at: event === 'email.sent' ? at : null,
  };
}

function toWebhook(row: EndpointRow): Webhook {
  return {
    id: row.id,
    url: row.url,
    events: row.events.filter(isWebhookEvent),
    created_at: row.createdAt.toISOString(),
  };
}

function isWebhookEvent(value: string): value is WebhookEvent {
  return (WEBHOOK_EVENTS as readonly string[]).includes(value);
}

export function toDelivery(row: DeliveryRow): WebhookDelivery {
  return {
    id: row.id,
    endpoint_id: row.endpointId,
    event: isWebhookEvent(row.event) ? row.event : 'email.sent',
    status: row.status,
    attempts: row.attempts,
    response_code: row.responseCode,
    error: row.error,
    next_retry_at: row.nextRetryAt ? row.nextRetryAt.toISOString() : null,
    message_id: row.messageId,
    created_at: row.createdAt.toISOString(),
  };
}
