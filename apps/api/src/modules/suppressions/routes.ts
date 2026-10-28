import { createRoute } from '@hono/zod-openapi';
import {
  importSuppressionsRequestSchema,
  importSuppressionsResponseSchema,
} from '@postrail/shared';
import { getAuth } from '../../lib/context';
import { ERROR_RESPONSES, jsonBody, jsonContent, type RouteBase } from '../../lib/openapi';
import { createRouter } from '../../lib/router';
import {
  createSuppressionRequestSchema,
  suppressionEmailParamSchema,
  suppressionListResponseSchema,
  suppressionSchema,
} from './schemas';
import { type SuppressionService } from './service';
import { type UnsubscribeLinks, UNSUBSCRIBE_PATH } from '../../lib/unsubscribe';

/**
 * Where the unsubscribe link in a broadcast leads. Public: the signed token says which
 * address and which org. GET only asks, because mail scanners follow links; the POST is
 * what suppresses, and it is also what a mail client's one-click unsubscribe sends.
 */
export function unsubscribeRoutes(service: SuppressionService, links: UnsubscribeLinks) {
  const router = createRouter();

  router.get(UNSUBSCRIBE_PATH, (c) => {
    const token = c.req.query('token') ?? '';
    const target = links.verify(token);
    if (!target) return c.html(page('This link is not valid', 'Nothing was changed.'), 400);
    return c.html(
      page(
        'Unsubscribe?',
        `Stop emails to <strong>${escapeHtml(target.email)}</strong> from this sender.`,
        `<form method="post" action="${UNSUBSCRIBE_PATH}?token=${encodeURIComponent(token)}"><button type="submit">Unsubscribe</button></form>`,
      ),
    );
  });

  router.post(UNSUBSCRIBE_PATH, async (c) => {
    const target = links.verify(c.req.query('token') ?? '');
    if (!target) return c.html(page('This link is not valid', 'Nothing was changed.'), 400);
    await service.add(
      { orgId: target.orgId, actor: 'unsubscribe-link' },
      { email: target.email, reason: 'unsubscribe' },
    );
    return c.html(
      page(
        'You are unsubscribed',
        `<strong>${escapeHtml(target.email)}</strong> will not get these emails again.`,
      ),
    );
  });

  return router;
}

function page(title: string, body: string, extra = ''): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#222}button{font:inherit;padding:.5rem 1rem;cursor:pointer}</style>
</head>
<body>
<h1>${title}</h1>
<p>${body}</p>
${extra}
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

export function suppressionRoutes(service: SuppressionService, base: RouteBase) {
  const tags = [`Suppressions${base.tagSuffix}`];
  const security = base.security;
  const path = (p: string) => `${base.prefix}${p}`;

  const add = createRoute({
    method: 'post',
    path: path('/suppressions'),
    tags,
    summary: 'Suppress an address',
    description:
      'Sends to a suppressed address are rejected with SUPPRESSED. Idempotent per address.',
    security,
    request: {
      params: base.params(),
      body: jsonBody(createSuppressionRequestSchema, 'Address and reason'),
    },
    responses: { 201: jsonContent(suppressionSchema, 'On the list'), ...ERROR_RESPONSES },
  });

  const importRoute = createRoute({
    method: 'post',
    path: path('/suppressions/import'),
    tags,
    summary: 'Suppress up to 1000 addresses at once',
    security,
    request: {
      params: base.params(),
      body: jsonBody(importSuppressionsRequestSchema, 'Addresses and reason'),
    },
    responses: { 200: jsonContent(importSuppressionsResponseSchema, 'Counts'), ...ERROR_RESPONSES },
  });

  const list = createRoute({
    method: 'get',
    path: path('/suppressions'),
    tags,
    summary: 'List suppressed addresses',
    security,
    request: { params: base.params() },
    responses: {
      200: jsonContent(suppressionListResponseSchema, 'Newest first'),
      ...ERROR_RESPONSES,
    },
  });

  const get = createRoute({
    method: 'get',
    path: path('/suppressions/{email}'),
    tags,
    summary: 'Check one address',
    security,
    request: { params: base.params(suppressionEmailParamSchema) },
    responses: { 200: jsonContent(suppressionSchema, 'Suppressed'), ...ERROR_RESPONSES },
  });

  const remove = createRoute({
    method: 'delete',
    path: path('/suppressions/{email}'),
    tags,
    summary: 'Remove an address from the list',
    security,
    request: { params: base.params(suppressionEmailParamSchema) },
    responses: { 204: { description: 'Removed' }, ...ERROR_RESPONSES },
  });

  return createRouter()
    .openapi(add, async (c) => c.json(await service.add(getAuth(c), c.req.valid('json')), 201))
    .openapi(importRoute, async (c) =>
      c.json(await service.importMany(getAuth(c), c.req.valid('json')), 200),
    )
    .openapi(list, async (c) => c.json({ data: await service.list(getAuth(c).orgId) }, 200))
    .openapi(get, async (c) =>
      c.json(await service.get(getAuth(c).orgId, c.req.valid('param').email), 200),
    )
    .openapi(remove, async (c) => {
      await service.remove(getAuth(c), c.req.valid('param').email);
      return c.body(null, 204);
    });
}
