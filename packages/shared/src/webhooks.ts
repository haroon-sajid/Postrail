import { createHmac, timingSafeEqual } from 'node:crypto';
import { WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS } from './constants';

export const WEBHOOK_SIGNATURE_VERSION = 'v1';
export const WEBHOOK_SIGNATURE_HEADER = 'Postrail-Signature';
export const WEBHOOK_TIMESTAMP_HEADER = 'Postrail-Timestamp';
export const WEBHOOK_EVENT_HEADER = 'Postrail-Event';
export const WEBHOOK_DELIVERY_ID_HEADER = 'Postrail-Delivery-Id';

/** HMAC-SHA256 over `${timestamp}.${body}`, hex. The timestamp is unix seconds. */
export function signWebhook(secret: string, timestamp: number | string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/** Value of the Postrail-Signature header: `v1=<hex>`. */
export function webhookSignatureHeader(
  secret: string,
  timestamp: number | string,
  body: string,
): string {
  return `${WEBHOOK_SIGNATURE_VERSION}=${signWebhook(secret, timestamp, body)}`;
}

export interface VerifyWebhookOptions {
  secret: string;
  /** Raw request body exactly as received. Re-serialising JSON breaks the signature. */
  body: string;
  timestamp: string | undefined;
  signature: string | undefined;
  /** Unix milliseconds. */
  now?: () => number;
  toleranceSeconds?: number;
}

/**
 * Receiver-side check, safe to use with untrusted input. Constant-time comparison and a
 * timestamp window so a captured request cannot be replayed later.
 */
export function verifyWebhookSignature(options: VerifyWebhookOptions): boolean {
  const { secret, body, timestamp, signature } = options;
  if (!timestamp || !signature) return false;
  const provided = signature
    .split(',')
    .find((part) => part.startsWith(`${WEBHOOK_SIGNATURE_VERSION}=`));
  if (!provided) return false;

  const ts = Number(timestamp);
  const nowSeconds = Math.floor((options.now?.() ?? Date.now()) / 1000);
  const tolerance = options.toleranceSeconds ?? WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS;
  if (!Number.isInteger(ts) || Math.abs(nowSeconds - ts) > tolerance) return false;

  const expected = Buffer.from(signWebhook(secret, timestamp, body), 'hex');
  const actual = Buffer.from(provided.slice(WEBHOOK_SIGNATURE_VERSION.length + 1), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
