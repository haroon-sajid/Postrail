import { randomBytes, randomUUID } from 'node:crypto';
import { type TokenCipher, WEBHOOK_EVENTS, type WebhookEvent } from '@postrail/shared';
import { type AuthContext } from '../../lib/context';
import { AppError } from '../../lib/errors';
import { type EventBus } from '../../lib/events';
import { type Queue } from '../../queue/types';
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
  now?: () => Date;
}

export interface WebhookService extends EventBus {
  create: (auth: AuthContext, input: CreateWebhookRequest) => Promise<WebhookCreated>;
  list: (orgId: string) => Promise<Webhook[]>;
  get: (orgId: string, id: string) => Promise<Webhook>;
  update: (auth: AuthContext, id: string, patch: UpdateWebhookRequest) => Promise<Webhook>;
  remove: (auth: AuthContext, id: string) => Promise<void>;
  listDeliveries: (orgId: string, endpointId: string, limit: number) => Promise<WebhookDelivery[]>;
}

export function createWebhookService(deps: WebhookServiceDeps): WebhookService {
  const { store, cipher, queue } = deps;
  const now = deps.now ?? (() => new Date());

  return {
    async create(auth, input) {
      // 192 bits, shown once. Stored encrypted because we need it back to sign deliveries.
      const secret = `whsec_${randomBytes(24).toString('base64url')}`;
      const row = await store.createEndpoint(auth.orgId, {
        url: input.url,
        events: input.events,
        secretEnc: cipher.encrypt(secret),
      });
      return { ...toWebhook(row), secret };
    },

    async list(orgId) {
      return (await store.listEndpoints(orgId)).map(toWebhook);
    },

    async get(orgId, id) {
      const row = await store.getEndpoint(orgId, id);
      if (!row) throw AppError.notFound('webhook');
      return toWebhook(row);
    },

    async update(auth, id, patch) {
      const row = await store.updateEndpoint(auth.orgId, id, {
        ...(patch.url !== undefined ? { url: patch.url } : {}),
        ...(patch.events !== undefined ? { events: patch.events } : {}),
      });
      if (!row) throw AppError.notFound('webhook');
      return toWebhook(row);
    },

    async remove(auth, id) {
      if (!(await store.deleteEndpoint(auth.orgId, id))) throw AppError.notFound('webhook');
    },

    async listDeliveries(orgId, endpointId, limit) {
      if (!(await store.getEndpoint(orgId, endpointId))) throw AppError.notFound('webhook');
      return (await store.listDeliveries(orgId, endpointId, limit)).map(toDelivery);
    },

    /** One delivery row and one task per subscribed endpoint. Payloads are frozen here. */
    async emit(orgId, event, data) {
      const endpoints = await store.listEndpointsForEvent(orgId, event);
      for (const endpoint of endpoints) {
        const id = randomUUID();
        const payload: WebhookPayload = { id, event, created_at: now().toISOString(), data };
        const messageId =
          typeof data.id === 'string' && event.startsWith('email.') ? data.id : null;
        await store.createDelivery(orgId, {
          id,
          endpointId: endpoint.id,
          messageId,
          event,
          payload,
        });
        await queue.enqueue({ kind: 'deliver-webhook', orgId, deliveryId: id }, { taskId: id });
      }
    },
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
