import { createRoute } from '@hono/zod-openapi';
import { testWebhookResponseSchema, uuidSchema, webhookDeliverySchema } from '@postrail/shared';
import { getAuth } from '../../lib/context';
import { ERROR_RESPONSES, jsonBody, jsonContent, type RouteBase } from '../../lib/openapi';
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

const deliveryParams = idParamSchema.extend({ deliveryId: uuidSchema });

export function webhookRoutes(service: WebhookService, base: RouteBase) {
  const tags = [`Webhooks${base.tagSuffix}`];
  const security = base.security;
  const path = (p: string) => `${base.prefix}${p}`;

  const create = createRoute({
    method: 'post',
    path: path('/webhooks'),
    tags,
    summary: 'Create a webhook endpoint (admin)',
    description:
      'Returns the signing secret once. Deliveries carry Postrail-Signature (v1=HMAC-SHA256 hex over "timestamp.body") and Postrail-Timestamp headers.',
    security,
    request: {
      params: base.params(),
      body: jsonBody(createWebhookRequestSchema, 'Endpoint URL and subscribed events'),
    },
    responses: {
      201: jsonContent(webhookCreatedSchema, 'Created, with the secret'),
      ...ERROR_RESPONSES,
    },
  });

  const list = createRoute({
    method: 'get',
    path: path('/webhooks'),
    tags,
    summary: 'List webhook endpoints',
    security,
    request: { params: base.params() },
    responses: { 200: jsonContent(webhookListResponseSchema, 'Endpoints'), ...ERROR_RESPONSES },
  });

  const get = createRoute({
    method: 'get',
    path: path('/webhooks/{id}'),
    tags,
    summary: 'Get a webhook endpoint',
    security,
    request: { params: base.params(idParamSchema) },
    responses: { 200: jsonContent(webhookSchema, 'The endpoint'), ...ERROR_RESPONSES },
  });

  const update = createRoute({
    method: 'patch',
    path: path('/webhooks/{id}'),
    tags,
    summary: 'Update a webhook endpoint (admin)',
    security,
    request: {
      params: base.params(idParamSchema),
      body: jsonBody(updateWebhookRequestSchema, 'Fields to change'),
    },
    responses: { 200: jsonContent(webhookSchema, 'The updated endpoint'), ...ERROR_RESPONSES },
  });

  const remove = createRoute({
    method: 'delete',
    path: path('/webhooks/{id}'),
    tags,
    summary: 'Delete a webhook endpoint (admin)',
    security,
    request: { params: base.params(idParamSchema) },
    responses: { 204: { description: 'Deleted' }, ...ERROR_RESPONSES },
  });

  const deliveries = createRoute({
    method: 'get',
    path: path('/webhooks/{id}/deliveries'),
    tags,
    summary: 'List recent deliveries for an endpoint',
    security,
    request: { params: base.params(idParamSchema), query: webhookDeliveryListQuerySchema },
    responses: {
      200: jsonContent(webhookDeliveryListResponseSchema, 'Newest first'),
      ...ERROR_RESPONSES,
    },
  });

  const retry = createRoute({
    method: 'post',
    path: path('/webhooks/{id}/deliveries/{deliveryId}/retry'),
    tags,
    summary: 'Retry a delivery now',
    security,
    request: { params: base.params(deliveryParams) },
    responses: { 202: jsonContent(webhookDeliverySchema, 'Queued again'), ...ERROR_RESPONSES },
  });

  const test = createRoute({
    method: 'post',
    path: path('/webhooks/{id}/test'),
    tags,
    summary: 'Send a sample event to this endpoint',
    security,
    request: { params: base.params(idParamSchema) },
    responses: {
      202: jsonContent(testWebhookResponseSchema, 'Test delivery queued'),
      ...ERROR_RESPONSES,
    },
  });

  const rotate = createRoute({
    method: 'post',
    path: path('/webhooks/{id}/rotate-secret'),
    tags,
    summary: 'Rotate the signing secret (admin). Returned once.',
    security,
    request: { params: base.params(idParamSchema) },
    responses: {
      200: jsonContent(webhookCreatedSchema, 'The endpoint with its new secret'),
      ...ERROR_RESPONSES,
    },
  });

  return createRouter()
    .openapi(create, async (c) =>
      c.json(await service.create(getAuth(c), c.req.valid('json')), 201),
    )
    .openapi(list, async (c) => c.json({ data: await service.list(getAuth(c).orgId) }, 200))
    .openapi(get, async (c) =>
      c.json(await service.get(getAuth(c).orgId, c.req.valid('param').id), 200),
    )
    .openapi(update, async (c) =>
      c.json(await service.update(getAuth(c), c.req.valid('param').id, c.req.valid('json')), 200),
    )
    .openapi(remove, async (c) => {
      await service.remove(getAuth(c), c.req.valid('param').id);
      return c.body(null, 204);
    })
    .openapi(deliveries, async (c) => {
      const { id } = c.req.valid('param');
      const { limit } = c.req.valid('query');
      return c.json({ data: await service.listDeliveries(getAuth(c).orgId, id, limit) }, 200);
    })
    .openapi(retry, async (c) => {
      const { id, deliveryId } = c.req.valid('param');
      return c.json(await service.retryDelivery(getAuth(c), id, deliveryId), 202);
    })
    .openapi(test, async (c) => {
      const { deliveryId } = await service.sendTest(getAuth(c), c.req.valid('param').id);
      return c.json({ delivery_id: deliveryId }, 202);
    })
    .openapi(rotate, async (c) =>
      c.json(await service.rotateSecret(getAuth(c), c.req.valid('param').id), 200),
    );
}
