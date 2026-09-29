import { errorResponseSchema } from '@postrail/shared';
import { HTTPException } from 'hono/http-exception';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createTestApp } from '../test/app';
import { AppError } from './errors';

function appWithFailingRoutes() {
  const { app } = createTestApp();
  app.get('/app-error', () => {
    throw AppError.conflict('already exists');
  });
  app.get('/zod-error', () => {
    z.object({ email: z.string().email() }).parse({ email: 'nope' });
    return new Response('unreachable');
  });
  app.get('/http-exception', () => {
    throw new HTTPException(401, { message: 'token required' });
  });
  app.get('/boom', () => {
    throw new Error('secret internal detail');
  });
  return app;
}

async function envelopeOf(res: Response) {
  const body: unknown = await res.json();
  return errorResponseSchema.parse(body).error;
}

describe('error handler', () => {
  const app = appWithFailingRoutes();

  it('maps AppError to its code and status', async () => {
    const res = await app.request('/app-error');
    expect(res.status).toBe(409);
    expect(await envelopeOf(res)).toEqual({ code: 'CONFLICT', message: 'already exists' });
  });

  it('maps ZodError to VALIDATION_ERROR 400 with the field name', async () => {
    const res = await app.request('/zod-error');
    expect(res.status).toBe(400);
    const error = await envelopeOf(res);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.message).toContain('email');
  });

  it('maps HTTPException to the matching code', async () => {
    const res = await app.request('/http-exception');
    expect(res.status).toBe(401);
    expect(await envelopeOf(res)).toEqual({ code: 'UNAUTHORIZED', message: 'token required' });
  });

  it('hides unknown error details behind INTERNAL_ERROR', async () => {
    const res = await app.request('/boom');
    expect(res.status).toBe(500);
    const error = await envelopeOf(res);
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.message).not.toContain('secret');
  });

  it('returns the envelope for unknown routes', async () => {
    const res = await app.request('/does-not-exist');
    expect(res.status).toBe(404);
    expect((await envelopeOf(res)).code).toBe('NOT_FOUND');
  });
});
