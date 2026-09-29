import { createRoute } from '@hono/zod-openapi';
import { sendEmailResponseSchema, sendTestTemplateRequestSchema } from '@postrail/shared';
import { getAuth } from '../../lib/context';
import { ERROR_RESPONSES, jsonBody, jsonContent, type RouteBase } from '../../lib/openapi';
import { createRouter } from '../../lib/router';
import {
  createTemplateRequestSchema,
  idParamSchema,
  templateListResponseSchema,
  templateSchema,
  updateTemplateRequestSchema,
} from './schemas';
import { type TemplateService } from './service';

export function templateRoutes(service: TemplateService, base: RouteBase) {
  const tags = [`Templates${base.tagSuffix}`];
  const security = base.security;
  const path = (p: string) => `${base.prefix}${p}`;

  const create = createRoute({
    method: 'post',
    path: path('/templates'),
    tags,
    summary: 'Create a template',
    description:
      'Placeholders are written as {{name}}. The response lists the variables every send must supply. Rendering is plain substitution; values are HTML-escaped in the body.',
    security,
    request: {
      params: base.params(),
      body: jsonBody(createTemplateRequestSchema, 'Slug, subject and html'),
    },
    responses: { 201: jsonContent(templateSchema, 'Created'), ...ERROR_RESPONSES },
  });

  const list = createRoute({
    method: 'get',
    path: path('/templates'),
    tags,
    summary: 'List templates',
    security,
    request: { params: base.params() },
    responses: { 200: jsonContent(templateListResponseSchema, 'Templates'), ...ERROR_RESPONSES },
  });

  const get = createRoute({
    method: 'get',
    path: path('/templates/{id}'),
    tags,
    summary: 'Get a template',
    security,
    request: { params: base.params(idParamSchema) },
    responses: { 200: jsonContent(templateSchema, 'The template'), ...ERROR_RESPONSES },
  });

  const update = createRoute({
    method: 'patch',
    path: path('/templates/{id}'),
    tags,
    summary: 'Update a template',
    security,
    request: {
      params: base.params(idParamSchema),
      body: jsonBody(updateTemplateRequestSchema, 'Subject and/or html'),
    },
    responses: { 200: jsonContent(templateSchema, 'The updated template'), ...ERROR_RESPONSES },
  });

  const remove = createRoute({
    method: 'delete',
    path: path('/templates/{id}'),
    tags,
    summary: 'Delete a template',
    security,
    request: { params: base.params(idParamSchema) },
    responses: { 204: { description: 'Deleted' }, ...ERROR_RESPONSES },
  });

  const test = createRoute({
    method: 'post',
    path: path('/templates/{id}/test'),
    tags,
    summary: 'Send a test email rendered from this template',
    security,
    request: {
      params: base.params(idParamSchema),
      body: jsonBody(sendTestTemplateRequestSchema, 'Recipient and variables'),
    },
    responses: { 201: jsonContent(sendEmailResponseSchema, 'Queued'), ...ERROR_RESPONSES },
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
    .openapi(test, async (c) =>
      c.json(await service.sendTest(getAuth(c), c.req.valid('param').id, c.req.valid('json')), 201),
    );
}
