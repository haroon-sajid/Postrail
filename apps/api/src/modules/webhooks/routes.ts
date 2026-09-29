import { createRoute } from '@hono/zod-openapi';
import { getAuth } from '../../lib/context';
import { BEARER_SECURITY, ERROR_RESPONSES, jsonBody, jsonContent } from '../../lib/openapi';
import { createRouter } from '../../lib/router';
import {
  createWebhookRequestSchema,
  idParamSchema,
  updateWebhookRequestSchema,
  webhookCreatedSchema,
  webhookDeliveryListQuerySchema,
  webhookDeliveryListResponseSchema,
  webhookListResponseSchema,
  webhookSchema,
} from './schemas';
import { type WebhookService } from './service';

const TAG = 'Webhooks';

const createRouteDef = createRoute({
  method: 'post',
  path: '/v1/webhooks',
  tags: [TAG],
  summary: 'Create a webhook endpoint',
  description:
    'Returns the signing secret once. Deliveries carry Postrail-Signature (v1=HMAC-SHA256 hex over "timestamp.body") and Postrail-Timestamp headers.',
  security: BEARER_SECURITY,
  request: { body: jsonBody(createWebhookRequestSchema, 'Endpoint URL and subscribed events') },
  responses: {
    201: jsonContent(webhookCreatedSchema, 'Created, with the secret'),
    ...ERROR_RESPONSES,
  },
});

const listRouteDef = createRoute({
  method: 'get',
  path: '/v1/webhooks',
  tags: [TAG],
  summary: 'List webhook endpoints',
  security: BEARER_SECURITY,
  responses: { 200: jsonContent(webhookListResponseSchema, 'Endpoints'), ...ERROR_RESPONSES },
});

const getRouteDef = createRoute({
  method: 'get',
  path: '/v1/webhooks/{id}',
  tags: [TAG],
  summary: 'Get a webhook endpoint',
  security: BEARER_SECURITY,
  request: { params: idParamSchema },
  responses: { 200: jsonContent(webhookSchema, 'The endpoint'), ...ERROR_RESPONSES },
});

const updateRouteDef = createRoute({
  method: 'patch',
  path: '/v1/webhooks/{id}',
  tags: [TAG],
  summary: 'Update a webhook endpoint',
  security: BEARER_SECURITY,
  request: {
    params: idParamSchema,
    body: jsonBody(updateWebhookRequestSchema, 'Fields to change'),
  },
  responses: { 200: jsonContent(webhookSchema, 'The updated endpoint'), ...ERROR_RESPONSES },
});

const deleteRouteDef = createRoute({
  method: 'delete',
  path: '/v1/webhooks/{id}',
  tags: [TAG],
  summary: 'Delete a webhook endpoint',
  security: BEARER_SECURITY,
  request: { params: idParamSchema },
  responses: { 204: { description: 'Deleted' }, ...ERROR_RESPONSES },
});

const deliveriesRouteDef = createRoute({
  method: 'get',
  path: '/v1/webhooks/{id}/deliveries',
  tags: [TAG],
  summary: 'List recent deliveries for an endpoint',
  security: BEARER_SECURITY,
  request: { params: idParamSchema, query: webhookDeliveryListQuerySchema },
  responses: {
    200: jsonContent(webhookDeliveryListResponseSchema, 'Newest first'),
    ...ERROR_RESPONSES,
  },
});

export function webhookRoutes(service: WebhookService) {
  return createRouter()
    .openapi(createRouteDef, async (c) =>
      c.json(await service.create(getAuth(c), c.req.valid('json')), 201),
    )
    .openapi(listRouteDef, async (c) => c.json({ data: await service.list(getAuth(c).orgId) }, 200))
    .openapi(getRouteDef, async (c) =>
      c.json(await service.get(getAuth(c).orgId, c.req.valid('param').id), 200),
    )
    .openapi(updateRouteDef, async (c) =>
      c.json(await service.update(getAuth(c), c.req.valid('param').id, c.req.valid('json')), 200),
    )
    .openapi(deleteRouteDef, async (c) => {
      await service.remove(getAuth(c), c.req.valid('param').id);
      return c.body(null, 204);
    })
    .openapi(deliveriesRouteDef, async (c) => {
      const { id } = c.req.valid('param');
      const { limit } = c.req.valid('query');
      return c.json({ data: await service.listDeliveries(getAuth(c).orgId, id, limit) }, 200);
    });
}
