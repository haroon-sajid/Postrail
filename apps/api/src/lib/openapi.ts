import { errorResponseSchema, uuidSchema } from '@postrail/shared';
import { z, type ZodType } from 'zod';

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
  401: errorContent('Missing, invalid or revoked credentials'),
  403: errorContent('Not allowed for this role'),
  404: errorContent('Not found'),
  409: errorContent('Conflict with an existing resource'),
  422: errorContent('Request understood but cannot be fulfilled'),
  429: errorContent('Rate limited; see Retry-After'),
  500: errorContent('Internal error'),
};

export const BEARER_SECURITY = [{ bearerAuth: [] }];
export const COOKIE_SECURITY = [{ cookieAuth: [] }];

/**
 * The same resource routes are mounted twice: under `/v1` for API keys and under
 * `/app/orgs/{orgId}` for dashboard sessions. A RouteBase supplies the prefix, the extra
 * path parameter and the security scheme so each route file is written once.
 */
export interface RouteBase {
  prefix: string;
  security: Array<Record<string, string[]>>;
  /** Adds `orgId` to a params schema when the base needs it. Typed as the input for ergonomics. */
  params: <S extends z.ZodObject>(schema?: S) => S;
  /** OpenAPI tag suffix so the two mounts are distinguishable in the document. */
  tagSuffix: string;
}

const empty = z.object({});

export const V1_BASE: RouteBase = {
  prefix: '/v1',
  security: BEARER_SECURITY,
  params: <S extends z.ZodObject>(schema?: S) => schema ?? (empty as unknown as S),
  tagSuffix: '',
};

export const APP_BASE: RouteBase = {
  prefix: '/app/orgs/{orgId}',
  security: COOKIE_SECURITY,
  params: <S extends z.ZodObject>(schema?: S) =>
    (schema ?? empty).extend({ orgId: uuidSchema }) as unknown as S,
  tagSuffix: ' (dashboard)',
};
