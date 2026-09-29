import { createRoute } from '@hono/zod-openapi';
import { getAuth } from '../../lib/context';
import { BEARER_SECURITY, ERROR_RESPONSES, jsonContent } from '../../lib/openapi';
import { createRouter } from '../../lib/router';
import {
  googleCallbackQuerySchema,
  googleConnectQuerySchema,
  idParamSchema,
  mailboxListResponseSchema,
} from './schemas';
import { type MailboxService } from './service';

const TAG = 'Mailboxes';

const listRoute = createRoute({
  method: 'get',
  path: '/v1/mailboxes',
  tags: [TAG],
  summary: 'List connected mailboxes',
  security: BEARER_SECURITY,
  responses: {
    200: jsonContent(mailboxListResponseSchema, "The org's mailboxes"),
    ...ERROR_RESPONSES,
  },
});

const deleteRoute = createRoute({
  method: 'delete',
  path: '/v1/mailboxes/{id}',
  tags: [TAG],
  summary: 'Disconnect a mailbox',
  description: 'Removes the mailbox and its stored tokens. Sent messages keep their history.',
  security: BEARER_SECURITY,
  request: { params: idParamSchema },
  responses: {
    204: { description: 'Mailbox removed' },
    ...ERROR_RESPONSES,
  },
});

export function mailboxRoutes(service: MailboxService) {
  const router = createRouter();

  // Browser-driven OAuth flow. Not part of the JSON API, so not in the OpenAPI document.
  router.get('/api/google/connect', (c) => {
    const { org } = googleConnectQuerySchema.parse(c.req.query());
    return c.redirect(service.googleConnectUrl(org), 302);
  });

  router.get('/api/google/callback', async (c) => {
    const query = googleCallbackQuerySchema.parse(c.req.query());
    const { mailbox } = await service.completeGoogleConnect(query);
    return c.html(successPage(mailbox.email));
  });

  return router
    .openapi(listRoute, async (c) => {
      const data = await service.list(getAuth(c).orgId);
      return c.json({ data }, 200);
    })

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
<p>You can close this window.</p>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
