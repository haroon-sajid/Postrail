import { type ErrorCode } from '@postrail/shared';
import { type ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * The only error services should throw on purpose. The error handler maps it 1:1 to the
 * `{ error: { code, message } }` envelope with the given HTTP status.
 */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: ContentfulStatusCode,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static notFound(what: string): AppError {
    return new AppError('NOT_FOUND', `${what} not found`, 404);
  }

  static validation(message: string): AppError {
    return new AppError('VALIDATION_ERROR', message, 400);
  }

  static unauthorized(message = 'Unauthorized'): AppError {
    return new AppError('UNAUTHORIZED', message, 401);
  }

  static forbidden(message = 'Forbidden'): AppError {
    return new AppError('FORBIDDEN', message, 403);
  }

  static conflict(message: string): AppError {
    return new AppError('CONFLICT', message, 409);
  }

  static suppressed(email: string): AppError {
    return new AppError('SUPPRESSED', `${email} is on the suppression list`, 422);
  }

  static noMailbox(reason: string): AppError {
    return new AppError('NO_MAILBOX', reason, 422);
  }

  static rateLimited(retryAfterSeconds: number): AppError {
    return new AppError('RATE_LIMITED', `rate limit exceeded, retry in ${retryAfterSeconds}s`, 429);
  }
}
