import { errorResponseSchema } from '@postrail/shared';
import { type ZodType } from 'zod';

export function jsonContent<T extends ZodType>(schema: T, description: string) {
  return { content: { 'application/json': { schema } }, description };
}

export function jsonBody<T extends ZodType>(schema: T, description: string) {
  return { content: { 'application/json': { schema } }, description, required: true };
}

function errorContent(description: string) {
  return jsonContent(errorResponseSchema, description);
}

/** Spread into every route's `responses` so the envelope is documented once. */
export const ERROR_RESPONSES = {
  400: errorContent('Validation error'),
  401: errorContent('Missing, invalid or revoked API key'),
  404: errorContent('Not found'),
  409: errorContent('Conflict with an existing resource'),
  422: errorContent('Request understood but cannot be fulfilled'),
  429: errorContent('Rate limited; see Retry-After'),
  500: errorContent('Internal error'),
};

export const BEARER_SECURITY = [{ bearerAuth: [] }];
