import { createRoute, z } from '@hono/zod-openapi';
import { getAuth } from '../../lib/context';
import { BEARER_SECURITY, ERROR_RESPONSES, jsonBody, jsonContent } from '../../lib/openapi';
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

const TAG = 'Emails';

const sendRoute = createRoute({
  method: 'post',
  path: '/v1/emails',
  tags: [TAG],
  summary: 'Send one email',
  description:
    "Sends through one of the org's connected mailboxes. Set Idempotency-Key to make retries safe: a repeated key returns the original message without sending again.",
  security: BEARER_SECURITY,
  request: {
    headers: z.object({ 'idempotency-key': idempotencyKeySchema.optional() }),
    body: jsonBody(sendEmailRequestSchema, 'The email to send'),
  },
  responses: {
    201: jsonContent(sendEmailResponseSchema, 'Message created and delivery attempted'),
    200: jsonContent(sendEmailResponseSchema, 'Idempotent replay of an earlier request'),
    ...ERROR_RESPONSES,
  },
});

const batchRoute = createRoute({
  method: 'post',
  path: '/v1/emails/batch',
  tags: [TAG],
  summary: 'Send up to 100 emails',
  description: 'Each item succeeds or fails on its own; the response lists one result per index.',
  security: BEARER_SECURITY,
  request: { body: jsonBody(sendEmailBatchRequestSchema, 'Up to 100 emails') },
  responses: {
    200: jsonContent(sendEmailBatchResponseSchema, 'One result per input item'),
    ...ERROR_RESPONSES,
  },
});

const getRoute = createRoute({
  method: 'get',
  path: '/v1/emails/{id}',
  tags: [TAG],
  summary: 'Get one email',
  security: BEARER_SECURITY,
  request: { params: idParamSchema },
  responses: {
    200: jsonContent(emailSchema, 'The email'),
    ...ERROR_RESPONSES,
  },
});

const listRoute = createRoute({
  method: 'get',
  path: '/v1/emails',
  tags: [TAG],
  summary: 'List emails',
  description: 'Newest first. Pass next_cursor from the previous page to continue.',
  security: BEARER_SECURITY,
  request: { query: emailListQuerySchema },
  responses: {
    200: jsonContent(emailListResponseSchema, 'A page of emails'),
    ...ERROR_RESPONSES,
  },
});

export function emailRoutes(service: EmailService) {
  return createRouter()
    .openapi(sendRoute, async (c) => {
      const auth = getAuth(c);
      const key = c.req.valid('header')['idempotency-key'];
      const outcome = await service.send(auth, c.req.valid('json'), key);
      const body = { id: outcome.id, status: outcome.status };
      return outcome.replayed ? c.json(body, 200) : c.json(body, 201);
    })

    .openapi(batchRoute, async (c) => {
      const auth = getAuth(c);
      const results = await service.sendBatch(auth, c.req.valid('json').emails);
      return c.json({ results }, 200);
    })

    .openapi(getRoute, async (c) => {
      const email = await service.get(getAuth(c), c.req.valid('param').id);
      return c.json(email, 200);
    })

    .openapi(listRoute, async (c) => {
      const { data, nextCursor } = await service.list(getAuth(c), c.req.valid('query'));
      return c.json({ data, next_cursor: nextCursor }, 200);
    });
}
