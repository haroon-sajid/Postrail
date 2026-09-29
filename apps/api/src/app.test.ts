import { describe, expect, it } from 'vitest';
import { InMemoryTokenBucket } from './lib/rate-limit';
import { REQUEST_ID_HEADER } from './lib/request-logging';
import { createTestApp } from './test/app';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('OpenAPI', () => {
  it('serves a 3.1 document generated from the zod schemas', async () => {
    const { app } = createTestApp();
    const res = await app.request('/openapi.json');
    expect(res.status).toBe(200);
    const doc = (await res.json()) as {
      openapi: string;
      paths: Record<string, Record<string, { security?: unknown[] }>>;
      components: { securitySchemes: Record<string, unknown> };
    };
    expect(doc.openapi).toBe('3.1.0');
    // Internal endpoints are deliberately absent.
    expect(Object.keys(doc.paths).sort()).toEqual([
      '/v1/emails',
      '/v1/emails/batch',
      '/v1/emails/{id}',
      '/v1/mailboxes',
      '/v1/mailboxes/{id}',
      '/v1/suppressions',
      '/v1/suppressions/{email}',
      '/v1/templates',
      '/v1/templates/{id}',
      '/v1/webhooks',
      '/v1/webhooks/{id}',
      '/v1/webhooks/{id}/deliveries',
    ]);
    expect(doc.paths['/v1/emails']?.post?.security).toEqual([{ bearerAuth: [] }]);
    expect(doc.components.securitySchemes.bearerAuth).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
  });

  it('serves Swagger UI at /docs', async () => {
    const { app } = createTestApp();
    const res = await app.request('/docs');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('/openapi.json');
  });
});

describe('request ids', () => {
  it('generates one per request and echoes a supplied one', async () => {
    const { app } = createTestApp();
    const fresh = await app.request('/');
    expect(fresh.headers.get(REQUEST_ID_HEADER)).toMatch(/^[0-9a-f-]{36}$/);

    const echoed = await app.request('/', { headers: { [REQUEST_ID_HEADER]: 'trace-123' } });
    expect(echoed.headers.get(REQUEST_ID_HEADER)).toBe('trace-123');
  });
});

describe('rate limiting', () => {
  it('returns 429 with Retry-After once a key exhausts its bucket', async () => {
    const limiter = new InMemoryTokenBucket({ capacity: 2, refillPerSecond: 1, now: () => 0 });
    const { app, authHeaders } = createTestApp({ rateLimiter: limiter });
    const headers = authHeaders(ORG);

    expect((await app.request('/v1/mailboxes', { headers })).status).toBe(200);
    const second = await app.request('/v1/mailboxes', { headers });
    expect(second.status).toBe(200);
    expect(second.headers.get('RateLimit-Remaining')).toBe('0');

    const limited = await app.request('/v1/mailboxes', { headers });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('1');
    expect(((await limited.json()) as { error: { code: string } }).error.code).toBe('RATE_LIMITED');

    // A different key has its own bucket.
    expect((await app.request('/v1/mailboxes', { headers: authHeaders(ORG) })).status).toBe(200);
  });
});
