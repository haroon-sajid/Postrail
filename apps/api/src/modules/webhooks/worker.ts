import {
  MAX_WEBHOOK_ATTEMPTS,
  type TokenCipher,
  WEBHOOK_DELIVERY_ID_HEADER,
  WEBHOOK_EVENT_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  type WebhookOutcome,
  webhookSignatureHeader,
} from '@postrail/shared';
import { type Logger } from '../../lib/logger';
import { type Queue } from '../../queue/types';
import { type DeliveryRow, type WebhookStore } from './repo';

/** Delay before attempt n+1, indexed by n. Seven gaps for eight attempts, ~13h in total. */
export const WEBHOOK_RETRY_DELAYS_SECONDS = [30, 60, 300, 900, 3600, 10800, 21600];
export const WEBHOOK_LEASE_MS = 5 * 60_000;
export const WEBHOOK_TIMEOUT_MS = 10_000;

const MAX_STORED_ERROR_CHARS = 300;

export interface WebhookWorkerDeps {
  store: WebhookStore;
  cipher: TokenCipher;
  queue: Queue;
  logger: Logger;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export interface WebhookWorker {
  processDelivery: (job: { orgId: string; deliveryId: string }) => Promise<WebhookOutcome>;
}

export function createWebhookWorker(deps: WebhookWorkerDeps): WebhookWorker {
  const { store, cipher, queue, logger } = deps;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => new Date());

  async function fail(
    row: DeliveryRow,
    reason: string,
    code: number | null,
  ): Promise<WebhookOutcome> {
    await store.markDeliveryFailed(
      row.orgId,
      row.id,
      reason.slice(0, MAX_STORED_ERROR_CHARS),
      code,
    );
    logger.warn(
      { deliveryId: row.id, orgId: row.orgId, attempts: row.attempts, reason },
      'webhook failed',
    );
    return 'failed';
  }

  async function retryOrFail(
    row: DeliveryRow,
    reason: string,
    code: number | null,
  ): Promise<WebhookOutcome> {
    if (row.attempts >= MAX_WEBHOOK_ATTEMPTS) {
      return fail(row, `${reason} (gave up after ${row.attempts} attempts)`, code);
    }
    const delaySeconds =
      WEBHOOK_RETRY_DELAYS_SECONDS[row.attempts - 1] ?? WEBHOOK_RETRY_DELAYS_SECONDS.at(-1) ?? 0;
    const nextRetryAt = new Date(now().getTime() + delaySeconds * 1000);
    await store.scheduleDeliveryRetry(
      row.orgId,
      row.id,
      reason.slice(0, MAX_STORED_ERROR_CHARS),
      code,
      nextRetryAt,
    );
    await queue.enqueue(
      { kind: 'deliver-webhook', orgId: row.orgId, deliveryId: row.id },
      { taskId: `${row.id}-${row.attempts}`, delaySeconds },
    );
    logger.info(
      { deliveryId: row.id, orgId: row.orgId, attempts: row.attempts, delaySeconds },
      'webhook retry scheduled',
    );
    return 'retry-scheduled';
  }

  return {
    async processDelivery({ orgId, deliveryId }) {
      const row = await store.claimDelivery(orgId, deliveryId, WEBHOOK_LEASE_MS, now());
      if (!row) return 'skipped';

      const endpoint = await store.getEndpoint(orgId, row.endpointId);
      if (!endpoint) return fail(row, 'endpoint no longer exists', null);

      // The stored payload is the body, byte for byte, so every retry verifies identically.
      const body = JSON.stringify(row.payload);
      const timestamp = Math.floor(now().getTime() / 1000);
      const headers = {
        'content-type': 'application/json',
        'user-agent': 'Postrail-Webhooks/1',
        [WEBHOOK_TIMESTAMP_HEADER]: String(timestamp),
        [WEBHOOK_SIGNATURE_HEADER]: webhookSignatureHeader(
          cipher.decrypt(endpoint.secret),
          timestamp,
          body,
        ),
        [WEBHOOK_EVENT_HEADER]: row.event,
        [WEBHOOK_DELIVERY_ID_HEADER]: row.id,
      };

      let status: number;
      try {
        const res = await fetchImpl(endpoint.url, {
          method: 'POST',
          headers,
          body,
          redirect: 'manual',
          signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
        });
        status = res.status;
      } catch (error) {
        return retryOrFail(row, error instanceof Error ? error.message : 'request failed', null);
      }

      if (status >= 200 && status < 300) {
        await store.markDelivered(orgId, row.id, status);
        logger.info(
          { deliveryId: row.id, orgId, attempts: row.attempts, status },
          'webhook delivered',
        );
        return 'delivered';
      }
      return retryOrFail(row, `endpoint responded ${status}`, status);
    },
  };
}
