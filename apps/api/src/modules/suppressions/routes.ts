import { createRoute } from '@hono/zod-openapi';
import { getAuth } from '../../lib/context';
import { BEARER_SECURITY, ERROR_RESPONSES, jsonBody, jsonContent } from '../../lib/openapi';
import { createRouter } from '../../lib/router';
import {
  createSuppressionRequestSchema,
  suppressionEmailParamSchema,
  suppressionListResponseSchema,
  suppressionSchema,
} from './schemas';
import { type SuppressionService } from './service';

const TAG = 'Suppressions';

const addDef = createRoute({
  method: 'post',
  path: '/v1/suppressions',
  tags: [TAG],
  summary: 'Suppress an address',
  description:
    'Sends to a suppressed address are rejected with SUPPRESSED. Idempotent per address.',
  security: BEARER_SECURITY,
  request: { body: jsonBody(createSuppressionRequestSchema, 'Address and reason') },
  responses: { 201: jsonContent(suppressionSchema, 'On the list'), ...ERROR_RESPONSES },
});

const listDef = createRoute({
  method: 'get',
  path: '/v1/suppressions',
  tags: [TAG],
  summary: 'List suppressed addresses',
  security: BEARER_SECURITY,
  responses: {
    200: jsonContent(suppressionListResponseSchema, 'Newest first'),
    ...ERROR_RESPONSES,
  },
});

const getDef = createRoute({
  method: 'get',
  path: '/v1/suppressions/{email}',
  tags: [TAG],
  summary: 'Check one address',
  security: BEARER_SECURITY,
  request: { params: suppressionEmailParamSchema },
  responses: { 200: jsonContent(suppressionSchema, 'Suppressed'), ...ERROR_RESPONSES },
});

const deleteDef = createRoute({
  method: 'delete',
  path: '/v1/suppressions/{email}',
  tags: [TAG],
  summary: 'Remove an address from the list',
  security: BEARER_SECURITY,
  request: { params: suppressionEmailParamSchema },
  responses: { 204: { description: 'Removed' }, ...ERROR_RESPONSES },
});

export function suppressionRoutes(service: SuppressionService) {
  return createRouter()
    .openapi(addDef, async (c) => c.json(await service.add(getAuth(c), c.req.valid('json')), 201))
    .openapi(listDef, async (c) => c.json({ data: await service.list(getAuth(c).orgId) }, 200))
    .openapi(getDef, async (c) =>
      c.json(await service.get(getAuth(c).orgId, c.req.valid('param').email), 200),
    )
    .openapi(deleteDef, async (c) => {
      await service.remove(getAuth(c), c.req.valid('param').email);
      return c.body(null, 204);
    });
}
