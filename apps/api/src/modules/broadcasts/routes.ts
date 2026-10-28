import { createRoute } from '@hono/zod-openapi';
import { getAuth } from '../../lib/context';
import { ERROR_RESPONSES, jsonBody, jsonContent, type RouteBase } from '../../lib/openapi';
import { createRouter } from '../../lib/router';
import {
  broadcastListResponseSchema,
  broadcastRecipientsQuerySchema,
  broadcastRecipientsResponseSchema,
  broadcastSchema,
  createBroadcastRequestSchema,
  idParamSchema,
  updateBroadcastRequestSchema,
} from './schemas';
import { type BroadcastService } from './service';

export function broadcastRoutes(service: BroadcastService, base: RouteBase) {
  const tags = [`Broadcasts${base.tagSuffix}`];
  const security = base.security;
  const path = (p: string) => `${base.prefix}${p}`;

  const listRoute = createRoute({
    method: 'get',
    path: path('/broadcasts'),
    tags,
    summary: 'List broadcasts',
    description: 'Newest first, each with where its recipients stand.',
    security,
    request: { params: base.params() },
    responses: { 200: jsonContent(broadcastListResponseSchema, 'Broadcasts'), ...ERROR_RESPONSES },
  });

  const createBroadcastRoute = createRoute({
    method: 'post',
    path: path('/broadcasts'),
    tags,
    summary: 'Create a draft broadcast',
    description: 'Nothing is sent until you call `/broadcasts/{id}/send`.',
    security,
    request: {
      params: base.params(),
      body: jsonBody(createBroadcastRequestSchema, 'A name, a template and a contact list'),
    },
    responses: { 201: jsonContent(broadcastSchema, 'Draft created'), ...ERROR_RESPONSES },
  });

  const getRoute = createRoute({
    method: 'get',
    path: path('/broadcasts/{id}'),
    tags,
    summary: 'Get one broadcast',
    security,
    request: { params: base.params(idParamSchema) },
    responses: { 200: jsonContent(broadcastSchema, 'The broadcast'), ...ERROR_RESPONSES },
  });

  const updateRoute = createRoute({
    method: 'patch',
    path: path('/broadcasts/{id}'),
    tags,
    summary: 'Change a draft broadcast',
    security,
    request: {
      params: base.params(idParamSchema),
      body: jsonBody(updateBroadcastRequestSchema, 'Fields to change'),
    },
    responses: { 200: jsonContent(broadcastSchema, 'The updated draft'), ...ERROR_RESPONSES },
  });

  const deleteRoute = createRoute({
    method: 'delete',
    path: path('/broadcasts/{id}'),
    tags,
    summary: 'Delete a broadcast (admin)',
    description: 'Not while it is sending; cancel it first. Messages it already sent stay in Logs.',
    security,
    request: { params: base.params(idParamSchema) },
    responses: { 204: { description: 'Broadcast deleted' }, ...ERROR_RESPONSES },
  });

  const sendRoute = createRoute({
    method: 'post',
    path: path('/broadcasts/{id}/send'),
    tags,
    summary: 'Start sending a draft (admin)',
    description:
      'Freezes the template and the list as they are now, then sends as fast as the mailboxes allow. A broadcast uses at most 80% of each mailbox’s daily limit, so a large list is spread over several days and application email keeps flowing. Suppressed addresses are skipped, and every email carries an unsubscribe link.',
    security,
    request: { params: base.params(idParamSchema) },
    responses: { 200: jsonContent(broadcastSchema, 'Now sending'), ...ERROR_RESPONSES },
  });

  const cancelRoute = createRoute({
    method: 'post',
    path: path('/broadcasts/{id}/cancel'),
    tags,
    summary: 'Stop a broadcast that is sending (admin)',
    description: 'Recipients still waiting are skipped. Messages already queued go out.',
    security,
    request: { params: base.params(idParamSchema) },
    responses: { 200: jsonContent(broadcastSchema, 'Canceled'), ...ERROR_RESPONSES },
  });

  const recipientsRoute = createRoute({
    method: 'get',
    path: path('/broadcasts/{id}/recipients'),
    tags,
    summary: 'List a broadcast’s recipients and what happened to each',
    description: 'By address. `message_id` is the message in `/emails` once one exists.',
    security,
    request: { params: base.params(idParamSchema), query: broadcastRecipientsQuerySchema },
    responses: {
      200: jsonContent(broadcastRecipientsResponseSchema, 'A page of recipients'),
      ...ERROR_RESPONSES,
    },
  });

  return createRouter()
    .openapi(listRoute, async (c) => c.json({ data: await service.list(getAuth(c)) }, 200))
    .openapi(createBroadcastRoute, async (c) =>
      c.json(await service.create(getAuth(c), c.req.valid('json')), 201),
    )
    .openapi(getRoute, async (c) =>
      c.json(await service.get(getAuth(c), c.req.valid('param').id), 200),
    )
    .openapi(updateRoute, async (c) =>
      c.json(await service.update(getAuth(c), c.req.valid('param').id, c.req.valid('json')), 200),
    )
    .openapi(deleteRoute, async (c) => {
      await service.remove(getAuth(c), c.req.valid('param').id);
      return c.body(null, 204);
    })
    .openapi(sendRoute, async (c) =>
      c.json(await service.send(getAuth(c), c.req.valid('param').id), 200),
    )
    .openapi(cancelRoute, async (c) =>
      c.json(await service.cancel(getAuth(c), c.req.valid('param').id), 200),
    )
    .openapi(recipientsRoute, async (c) => {
      const { data, nextCursor } = await service.recipients(
        getAuth(c),
        c.req.valid('param').id,
        c.req.valid('query'),
      );
      return c.json({ data, next_cursor: nextCursor }, 200);
    });
}
