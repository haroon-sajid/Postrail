import createClient from 'openapi-fetch';
import type { paths } from './schema';

export const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? 'http://localhost:8080';

/** Typed client generated from the API's own OpenAPI document. Cookies ride along. */
export const api = createClient<paths>({ baseUrl: API_ORIGIN, credentials: 'include' });

export interface ErrorEnvelope {
  error: { code: string; message: string };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function isEnvelope(value: unknown): value is ErrorEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof value.error === 'object'
  );
}

/**
 * openapi-fetch returns `{ data, error, response }`; the console wants either the data
 * or a thrown ApiError carrying the API's stable code.
 */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.response.ok) return result.data as T;
  const body = result.error;
  if (isEnvelope(body)) {
    throw new ApiError(result.response.status, body.error.code, body.error.message);
  }
  throw new ApiError(
    result.response.status,
    'INTERNAL_ERROR',
    `request failed (${result.response.status})`,
  );
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}
