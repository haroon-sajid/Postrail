import { createRoute } from '@hono/zod-openapi';
import { connectUrlResponseSchema, updateMailboxRequestSchema } from '@postrail/shared';
import { getAuth } from '../../lib/context';
import { ERROR_RESPONSES, jsonBody, jsonContent, type RouteBase } from '../../lib/openapi';
import { createRouter } from '../../lib/router';
import {
  googleCallbackQuerySchema,
  idParamSchema,
  mailboxListResponseSchema,
  mailboxSchema,
} from './schemas';
import { type MailboxService } from './service';

/** The OAuth callback is browser-driven and public (the signed state carries the org). */
export function googleCallbackRoutes(service: MailboxService) {
  const router = createRouter();
  router.get('/api/google/callback', async (c) => {
    const query = googleCallbackQuerySchema.parse(c.req.query());
    const { mailbox } = await service.completeGoogleConnect(query);
    return c.html(successPage(mailbox.email));
  });
  return router;
}

export function mailboxRoutes(service: MailboxService, base: RouteBase) {
  const tags = [`Mailboxes${base.tagSuffix}`];
  const security = base.security;
  const path = (p: string) => `${base.prefix}${p}`;

  const listRoute = createRoute({
    method: 'get',
    path: path('/mailboxes'),
    tags,
    summary: 'List connected mailboxes',
    security,
    request: { params: base.params() },
    responses: {
      200: jsonContent(mailboxListResponseSchema, "The org's mailboxes"),
      ...ERROR_RESPONSES,
    },
  });

  const connectUrlRoute = createRoute({
    method: 'get',
    path: path('/mailboxes/google/connect-url'),
    tags,
    summary: 'Get the Google consent URL to connect (or reconnect) a mailbox (admin)',
    security,
    request: { params: base.params() },
    responses: {
      200: jsonContent(connectUrlResponseSchema, 'Open this in a browser'),
      ...ERROR_RESPONSES,
    },
  });

  const updateRoute = createRoute({
    method: 'patch',
    path: path('/mailboxes/{id}'),
    tags,
    summary: 'Change the daily limit or pause/resume',
    security,
    request: {
      params: base.params(idParamSchema),
      body: jsonBody(updateMailboxRequestSchema, 'Fields to change'),
    },
    responses: { 200: jsonContent(mailboxSchema, 'The updated mailbox'), ...ERROR_RESPONSES },
  });

  const deleteRoute = createRoute({
    method: 'delete',
    path: path('/mailboxes/{id}'),
    tags,
    summary: 'Disconnect a mailbox (admin)',
    description: 'Removes the mailbox and its stored tokens. Sent messages keep their history.',
    security,
    request: { params: base.params(idParamSchema) },
    responses: { 204: { description: 'Mailbox removed' }, ...ERROR_RESPONSES },
  });

  return createRouter()
    .openapi(listRoute, async (c) => c.json({ data: await service.list(getAuth(c).orgId) }, 200))
    .openapi(connectUrlRoute, (c) => c.json({ url: service.googleConnectUrl(getAuth(c)) }, 200))
    .openapi(updateRoute, async (c) =>
      c.json(await service.update(getAuth(c), c.req.valid('param').id, c.req.valid('json')), 200),
    )
    .openapi(deleteRoute, async (c) => {
      await service.remove(getAuth(c), c.req.valid('param').id);
      return c.body(null, 204);
    });
}

function successPage(email: string): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Mailbox connected</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#222}</style>
</head>
<body>
<h1>Mailbox connected</h1>
<p><strong>${escapeHtml(email)}</strong> can now send email through Postrail.</p>
<p>You can close this window and return to the dashboard.</p>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
