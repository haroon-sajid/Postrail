import { createRoute, z } from '@hono/zod-openapi';
import {
  apiKeyCreatedSchema,
  apiKeyListResponseSchema,
  createApiKeyRequestSchema,
  uuidSchema,
} from '@postrail/shared';
import { getAuth } from '../../lib/context';
import { COOKIE_SECURITY, ERROR_RESPONSES, jsonBody, jsonContent } from '../../lib/openapi';
import { createRouter } from '../../lib/router';
import { type ApiKeyService } from './service';

const TAG = 'API keys (dashboard)';
const orgParams = z.object({ orgId: uuidSchema });
const keyParams = orgParams.extend({ id: uuidSchema });

const list = createRoute({
  method: 'get',
  path: '/app/orgs/{orgId}/api-keys',
  tags: [TAG],
  summary: 'List API keys',
  security: COOKIE_SECURITY,
  request: { params: orgParams },
  responses: {
    200: jsonContent(apiKeyListResponseSchema, 'Keys, newest first'),
    ...ERROR_RESPONSES,
  },
});

const create = createRoute({
  method: 'post',
  path: '/app/orgs/{orgId}/api-keys',
  tags: [TAG],
  summary: 'Create an API key (admin). The key is returned once.',
  security: COOKIE_SECURITY,
  request: { params: orgParams, body: jsonBody(createApiKeyRequestSchema, 'A name for the key') },
  responses: {
    201: jsonContent(apiKeyCreatedSchema, 'Created, with the raw key'),
    ...ERROR_RESPONSES,
  },
});

const revoke = createRoute({
  method: 'delete',
  path: '/app/orgs/{orgId}/api-keys/{id}',
  tags: [TAG],
  summary: 'Revoke an API key (admin)',
  security: COOKIE_SECURITY,
  request: { params: keyParams },
  responses: { 204: { description: 'Revoked' }, ...ERROR_RESPONSES },
});

export function apiKeyRoutes(service: ApiKeyService) {
  return createRouter()
    .openapi(list, async (c) => c.json({ data: await service.list(getAuth(c)) }, 200))
    .openapi(create, async (c) =>
      c.json(await service.create(getAuth(c), c.req.valid('json').name), 201),
    )
    .openapi(revoke, async (c) => {
      await service.revoke(getAuth(c), c.req.valid('param').id);
      return c.body(null, 204);
    });
}
