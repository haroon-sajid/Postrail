import { describe, expect, it } from 'vitest';
import { signWebhook, verifyWebhookSignature, webhookSignatureHeader } from './webhooks';

const secret = 'whsec_test';
const body = '{"id":"d1","event":"email.sent"}';
const ts = 1_790_000_000;
const now = () => ts * 1000 + 5_000;

describe('webhook signatures', () => {
  it('signs timestamp.body with HMAC-SHA256 hex', () => {
    expect(signWebhook(secret, ts, body)).toMatch(/^[0-9a-f]{64}$/);
    expect(webhookSignatureHeader(secret, ts, body)).toBe(`v1=${signWebhook(secret, ts, body)}`);
  });

  it('verifies a genuine header within the tolerance window', () => {
    const signature = webhookSignatureHeader(secret, ts, body);
    expect(verifyWebhookSignature({ secret, body, timestamp: String(ts), signature, now })).toBe(
      true,
    );
  });

  it('rejects a tampered body, a wrong secret, a stale timestamp and missing headers', () => {
    const signature = webhookSignatureHeader(secret, ts, body);
    const base = { secret, body, timestamp: String(ts), signature, now };
    expect(verifyWebhookSignature({ ...base, body: body.replace('sent', 'failed') })).toBe(false);
    expect(verifyWebhookSignature({ ...base, secret: 'other' })).toBe(false);
    expect(verifyWebhookSignature({ ...base, now: () => (ts + 301) * 1000 })).toBe(false);
    expect(verifyWebhookSignature({ ...base, timestamp: undefined })).toBe(false);
    expect(verifyWebhookSignature({ ...base, signature: undefined })).toBe(false);
    expect(verifyWebhookSignature({ ...base, signature: 'v0=abc' })).toBe(false);
    expect(verifyWebhookSignature({ ...base, signature: 'v1=zz' })).toBe(false);
  });
});
