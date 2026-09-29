import { createRoute, z } from '@hono/zod-openapi';
import { getAuth } from '../../lib/context';
import { ERROR_RESPONSES, jsonBody, jsonContent, type RouteBase } from '../../lib/openapi';
import { createRouter } from '../../lib/router';
import {
  emailListQuerySchema,
  emailListResponseSchema,
  emailSchema,
  idempotencyKeySchema,
  idParamSchema,
  sendEmailBatchRequestSchema,
  sendEmailBatchResponseSchema,
  sendEmailRequestSchema,
  sendEmailResponseSchema,
} from './schemas';
import { type EmailService } from './service';

const bodyPreviewSchema = z.object({ html: z.string().nullable(), text: z.string().nullable() });

export function emailRoutes(service: EmailService, base: RouteBase) {
  const tags = [`Emails${base.tagSuffix}`];
  const security = base.security;
  const path = (p: string) => `${base.prefix}${p}`;

  const sendRoute = createRoute({
    method: 'post',
    path: path('/emails'),
    tags,
    summary: 'Send one email',
    description:
      "Queues the message through one of the org's connected mailboxes and returns immediately. Set Idempotency-Key to make retries safe: a repeated key returns the original message without queueing again.",
    security,
    request: {
      params: base.params(),
      headers: z.object({ 'idempotency-key': idempotencyKeySchema.optional() }),
      body: jsonBody(sendEmailRequestSchema, 'The email to send'),
    },
    responses: {
      201: jsonContent(sendEmailResponseSchema, 'Message queued for delivery'),
      200: jsonContent(sendEmailResponseSchema, 'Idempotent replay of an earlier request'),
      ...ERROR_RESPONSES,
    },
  });

  const batchRoute = createRoute({
    method: 'post',
    path: path('/emails/batch'),
    tags,
    summary: 'Send up to 100 emails',
    description: 'Each item succeeds or fails on its own; the response lists one result per index.',
    security,
    request: {
      params: base.params(),
      body: jsonBody(sendEmailBatchRequestSchema, 'Up to 100 emails'),
    },
    responses: {
      200: jsonContent(sendEmailBatchResponseSchema, 'One result per input item'),
      ...ERROR_RESPONSES,
    },
  });

  const getRoute = createRoute({
    method: 'get',
    path: path('/emails/{id}'),
    tags,
    summary: 'Get one email',
    security,
    request: { params: base.params(idParamSchema) },
    responses: { 200: jsonContent(emailSchema, 'The email'), ...ERROR_RESPONSES },
  });

  const listRoute = createRoute({
    method: 'get',
    path: path('/emails'),
    tags,
    summary: 'List emails',
    description: 'Newest first. Pass next_cursor from the previous page to continue.',
    security,
    request: { params: base.params(), query: emailListQuerySchema },
    responses: {
      200: jsonContent(emailListResponseSchema, 'A page of emails'),
      ...ERROR_RESPONSES,
    },
  });

  const resendRoute = createRoute({
    method: 'post',
    path: path('/emails/{id}/resend'),
    tags,
    summary: 'Queue a fresh copy of an earlier email',
    security,
    request: { params: base.params(idParamSchema) },
    responses: {
      201: jsonContent(sendEmailResponseSchema, 'New message queued'),
      ...ERROR_RESPONSES,
    },
  });

  const bodyRoute = createRoute({
    method: 'get',
    path: path('/emails/{id}/body'),
    tags,
    summary: 'Stored html/text of an email, for preview',
    security,
    request: { params: base.params(idParamSchema) },
    responses: {
      200: jsonContent(bodyPreviewSchema, 'The content, or nulls when purged'),
      ...ERROR_RESPONSES,
    },
  });

  return createRouter()
    .openapi(sendRoute, async (c) => {
      const auth = getAuth(c);
      const key = c.req.valid('header')['idempotency-key'];
      const outcome = await service.send(auth, c.req.valid('json'), key);
      const body = { id: outcome.id, status: outcome.status };
      return outcome.replayed ? c.json(body, 200) : c.json(body, 201);
    })
    .openapi(batchRoute, async (c) =>
      c.json({ results: await service.sendBatch(getAuth(c), c.req.valid('json').emails) }, 200),
    )
    .openapi(getRoute, async (c) =>
      c.json(await service.get(getAuth(c), c.req.valid('param').id), 200),
    )
    .openapi(listRoute, async (c) => {
      const { data, nextCursor } = await service.list(getAuth(c), c.req.valid('query'));
      return c.json({ data, next_cursor: nextCursor }, 200);
    })
    .openapi(resendRoute, async (c) =>
      c.json(await service.resend(getAuth(c), c.req.valid('param').id), 201),
    )
    .openapi(bodyRoute, async (c) => {
      const body = await service.getBody(getAuth(c), c.req.valid('param').id);
      return c.json(body ?? { html: null, text: null }, 200);
    });
}
