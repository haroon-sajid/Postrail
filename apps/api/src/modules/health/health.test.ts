import { describe, expect, it } from 'vitest';
import { createTestApp } from '../../test/app';
import { healthResponseSchema } from './schemas';
import { getHealth } from './service';

describe('health', () => {
  it('service reports ok with the given version', () => {
    expect(getHealth('1.2.3')).toEqual({ ok: true, version: '1.2.3' });
  });

  it('GET / returns { ok: true, version }', async () => {
    const { app } = createTestApp();
    const res = await app.request('/');
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect(healthResponseSchema.parse(body)).toEqual({ ok: true, version: 'test' });
  });
});
