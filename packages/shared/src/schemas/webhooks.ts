import { z } from 'zod';
import { WEBHOOK_DELIVERY_STATUSES, WEBHOOK_EVENTS } from '../constants';
import { uuidSchema } from './common';

const webhookUrlSchema = z
  .url()
  .max(2048)
  .refine((url) => /^https?:$/.test(new URL(url).protocol), 'url must be http(s)');

export const createWebhookRequestSchema = z.object({
  url: webhookUrlSchema,
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
});
export type CreateWebhookRequest = z.infer<typeof createWebhookRequestSchema>;

export const updateWebhookRequestSchema = createWebhookRequestSchema.partial();
export type UpdateWebhookRequest = z.infer<typeof updateWebhookRequestSchema>;

export const webhookSchema = z.object({
  id: uuidSchema,
  url: z.string(),
  events: z.array(z.enum(WEBHOOK_EVENTS)),
  created_at: z.iso.datetime(),
});
export type Webhook = z.infer<typeof webhookSchema>;

/** Only the create response carries the signing secret. It is not retrievable later. */
export const webhookCreatedSchema = webhookSchema.extend({ secret: z.string() });
export type WebhookCreated = z.infer<typeof webhookCreatedSchema>;

export const webhookListResponseSchema = z.object({ data: z.array(webhookSchema) });

export const webhookDeliverySchema = z.object({
  id: uuidSchema,
  endpoint_id: uuidSchema,
  event: z.enum(WEBHOOK_EVENTS),
  status: z.enum(WEBHOOK_DELIVERY_STATUSES),
  attempts: z.number().int(),
  response_code: z.number().int().nullable(),
  error: z.string().nullable(),
  next_retry_at: z.iso.datetime().nullable(),
  message_id: uuidSchema.nullable(),
  created_at: z.iso.datetime(),
});
export type WebhookDelivery = z.infer<typeof webhookDeliverySchema>;

export const webhookDeliveryListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const webhookDeliveryListResponseSchema = z.object({
  data: z.array(webhookDeliverySchema),
});

/** What a receiver gets. `data` is the wire shape of the object the event is about. */
export const webhookPayloadSchema = z.object({
  id: uuidSchema,
  event: z.enum(WEBHOOK_EVENTS),
  created_at: z.iso.datetime(),
  data: z.record(z.string(), z.unknown()),
});
export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;
