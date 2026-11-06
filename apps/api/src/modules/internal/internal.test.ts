import { errorResponseSchema, workerResultSchema } from '@postrail/shared';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../../test/app';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('/internal auth', () => {
  it('rejects missing, wrong and public-API credentials', async () => {
    const { app, authHeaders } = createTestApp();
    for (const headers of [
      {},
      { authorization: 'Bearer nope' },
      { authorization: 'Bearer test-internal-secret-012345678' },
      authHeaders(ORG),
    ]) {
      const res = await app.request('/internal/cron/reset-daily-counters', {
        method: 'POST',
        headers,
      });
      expect(res.status).toBe(401);
      const body: unknown = await res.json();
      expect(errorResponseSchema.parse(body).error.code).toBe('UNAUTHORIZED');
    }
  });
});

describe('POST /internal/tasks/send-email', () => {
  it('runs the worker for a valid job', async () => {
    const t = createTestApp();
    t.store.add(ORG);
    const created = await t.app.request('/v1/emails', {
      method: 'POST',
      headers: t.authHeaders(ORG),
      body: JSON.stringify({ to: 'a@example.org', subject: 's', text: 'b' }),
    });
    const { id } = (await created.json()) as { id: string };

    const res = await t.app.request('/internal/tasks/send-email', {
      method: 'POST',
      headers: t.internalHeaders,
      body: JSON.stringify({ kind: 'send-email', orgId: ORG, messageId: id }),
    });
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect(workerResultSchema.parse(body)).toEqual({ outcome: 'sent' });
    expect(t.emailStore.rows[0]?.status).toBe('sent');

    const again = await t.app.request('/internal/tasks/send-email', {
      method: 'POST',
      headers: t.internalHeaders,
      body: JSON.stringify({ kind: 'send-email', orgId: ORG, messageId: id }),
    });
    expect(((await again.json()) as { outcome: string }).outcome).toBe('skipped');
  });

  it('rejects a malformed job', async () => {
    const t = createTestApp();
    const res = await t.app.request('/internal/tasks/send-email', {
      method: 'POST',
      headers: t.internalHeaders,
      body: JSON.stringify({ messageId: 'nope' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('the cron secret', () => {
  it('opens /internal/cron/* and nothing else under /internal', async () => {
    const t = createTestApp();
    const tick = await t.app.request('/internal/cron/tick', {
      method: 'POST',
      headers: t.cronHeaders,
    });
    expect(tick.status).toBe(200);

    const task = await t.app.request('/internal/tasks/send-email', {
      method: 'POST',
      headers: { ...t.cronHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'send-email', orgId: ORG, messageId: ORG }),
    });
    expect(task.status).toBe(401);
  });
});
