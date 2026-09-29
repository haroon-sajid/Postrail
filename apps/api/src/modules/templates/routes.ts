import { createRoute } from '@hono/zod-openapi';
import { getAuth } from '../../lib/context';
import { BEARER_SECURITY, ERROR_RESPONSES, jsonBody, jsonContent } from '../../lib/openapi';
import { createRouter } from '../../lib/router';
import {
  createTemplateRequestSchema,
  idParamSchema,
  templateListResponseSchema,
  templateSchema,
  updateTemplateRequestSchema,
} from './schemas';
import { type TemplateService } from './service';

const TAG = 'Templates';

const createDef = createRoute({
  method: 'post',
  path: '/v1/templates',
  tags: [TAG],
  summary: 'Create a template',
  description:
    'Placeholders are written as {{name}}. The response lists the variables every send must supply. Rendering is plain substitution; values are HTML-escaped in the body.',
  security: BEARER_SECURITY,
  request: { body: jsonBody(createTemplateRequestSchema, 'Slug, subject and html') },
  responses: {
    201: jsonContent(templateSchema, 'Created'),
    ...ERROR_RESPONSES,
  },
});

const listDef = createRoute({
  method: 'get',
  path: '/v1/templates',
  tags: [TAG],
  summary: 'List templates',
  security: BEARER_SECURITY,
  responses: { 200: jsonContent(templateListResponseSchema, 'Templates'), ...ERROR_RESPONSES },
});

const getDef = createRoute({
  method: 'get',
  path: '/v1/templates/{id}',
  tags: [TAG],
  summary: 'Get a template',
  security: BEARER_SECURITY,
  request: { params: idParamSchema },
  responses: { 200: jsonContent(templateSchema, 'The template'), ...ERROR_RESPONSES },
});

const updateDef = createRoute({
  method: 'patch',
  path: '/v1/templates/{id}',
  tags: [TAG],
  summary: 'Update a template',
  security: BEARER_SECURITY,
  request: {
    params: idParamSchema,
    body: jsonBody(updateTemplateRequestSchema, 'Subject and/or html'),
  },
  responses: { 200: jsonContent(templateSchema, 'The updated template'), ...ERROR_RESPONSES },
});

const deleteDef = createRoute({
  method: 'delete',
  path: '/v1/templates/{id}',
  tags: [TAG],
  summary: 'Delete a template',
  security: BEARER_SECURITY,
  request: { params: idParamSchema },
  responses: { 204: { description: 'Deleted' }, ...ERROR_RESPONSES },
});

export function templateRoutes(service: TemplateService) {
  return createRouter()
    .openapi(createDef, async (c) =>
      c.json(await service.create(getAuth(c), c.req.valid('json')), 201),
    )
    .openapi(listDef, async (c) => c.json({ data: await service.list(getAuth(c).orgId) }, 200))
    .openapi(getDef, async (c) =>
      c.json(await service.get(getAuth(c).orgId, c.req.valid('param').id), 200),
    )
    .openapi(updateDef, async (c) =>
      c.json(await service.update(getAuth(c), c.req.valid('param').id, c.req.valid('json')), 200),
    )
    .openapi(deleteDef, async (c) => {
      await service.remove(getAuth(c), c.req.valid('param').id);
      return c.body(null, 204);
    });
}
