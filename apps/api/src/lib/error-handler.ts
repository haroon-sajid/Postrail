import { type ErrorCode, type ErrorResponse } from '@postrail/shared';
import { type ErrorHandler, type NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { type ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';
import { type AppEnv } from './context';
import { AppError } from './errors';
import { type Logger } from './logger';

function envelope(code: ErrorCode, message: string): ErrorResponse {
  return { error: { code, message } };
}

/** "field: rule" per issue, joined. Zod messages describe the rule, not the input value. */
export function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
    .join('; ');
}

function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
      return 'VALIDATION_ERROR';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'RATE_LIMITED';
    default:
      return 'INTERNAL_ERROR';
  }
}

/** Every error leaves the API through here, so clients see exactly one shape. */
export function createErrorHandler(baseLogger: Logger): ErrorHandler<AppEnv> {
  return (error, c) => {
    if (error instanceof AppError) {
      return c.json(envelope(error.code, error.message), error.status);
    }
    if (error instanceof ZodError) {
      return c.json(envelope('VALIDATION_ERROR', formatZodError(error)), 400);
    }
    if (error instanceof HTTPException) {
      const status: ContentfulStatusCode = error.status;
      return c.json(envelope(codeForStatus(status), error.message), status);
    }
    // Unknown failure: keep the details for us, give the client nothing to work with.
    const logger = c.var.logger ?? baseLogger;
    logger.error({ err: error, method: c.req.method, path: c.req.path }, 'unhandled error');
    return c.json(envelope('INTERNAL_ERROR', 'Internal server error'), 500);
  };
}

export const notFoundHandler: NotFoundHandler<AppEnv> = (c) =>
  c.json(envelope('NOT_FOUND', `No route for ${c.req.method} ${c.req.path}`), 404);
