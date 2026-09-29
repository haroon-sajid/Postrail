import { randomUUID } from 'node:crypto';
import { type MiddlewareHandler } from 'hono';
import { type AppEnv } from './context';
import { type Logger } from './logger';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Gives every request an id (honouring one from a trusted proxy), a child logger that
 * carries it, and one access-log line per request. Never logs headers or bodies.
 */
export function requestLogging(base: Logger): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const requestId = c.req.header(REQUEST_ID_HEADER) ?? randomUUID();
    const logger = base.child({ requestId });
    c.set('requestId', requestId);
    c.set('logger', logger);
    c.header(REQUEST_ID_HEADER, requestId);

    const started = performance.now();
    await next();

    // Auth runs later and may have replaced the logger with one that knows the org.
    (c.var.logger ?? logger).info(
      {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        durationMs: Math.round(performance.now() - started),
      },
      'request',
    );
  };
}
