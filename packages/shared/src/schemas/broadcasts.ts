import { z } from 'zod';
import {
  BROADCAST_RECIPIENT_STATUSES,
  BROADCAST_STATUSES,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '../constants';
import { uuidSchema } from './common';

/** Where a broadcast's recipients stand. For a draft only `total` is known. */
export const broadcastStatsSchema = z.object({
  total: z.number().int(),
  /** Waiting for mailbox capacity. */
  pending: z.number().int(),
  /** Handed to delivery, not yet accepted by the provider. */
  queued: z.number().int(),
  sent: z.number().int(),
  failed: z.number().int(),
  /** Never attempted: suppressed, or the broadcast was canceled first. */
  skipped: z.number().int(),
});
export type BroadcastStats = z.infer<typeof broadcastStatsSchema>;

/** One message to a whole list (snake_case on the wire). */
export const broadcastSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  status: z.enum(BROADCAST_STATUSES),
  /** Null when the template or list was deleted after the broadcast was created. */
  template: z.object({ id: uuidSchema, slug: z.string() }).nullable(),
  list: z.object({ id: uuidSchema, name: z.string() }).nullable(),
  /** The subject as it was when sending started. Null for a draft. */
  subject: z.string().nullable(),
  stats: broadcastStatsSchema,
  created_at: z.iso.datetime(),
  started_at: z.iso.datetime().nullable(),
  completed_at: z.iso.datetime().nullable(),
});
export type Broadcast = z.infer<typeof broadcastSchema>;

export const broadcastListResponseSchema = z.object({ data: z.array(broadcastSchema) });

export const createBroadcastRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  template_id: uuidSchema,
  list_id: uuidSchema,
});
export type CreateBroadcastRequest = z.infer<typeof createBroadcastRequestSchema>;

/** Only a draft can be changed. */
export const updateBroadcastRequestSchema = createBroadcastRequestSchema
  .partial()
  .refine((p) => Object.values(p).some((v) => v !== undefined), { message: 'nothing to update' });
export type UpdateBroadcastRequest = z.infer<typeof updateBroadcastRequestSchema>;

export const broadcastRecipientSchema = z.object({
  id: uuidSchema,
  email: z.email(),
  status: z.enum(BROADCAST_RECIPIENT_STATUSES),
  /** The message in Logs, once the recipient was handed to delivery. */
  message_id: uuidSchema.nullable(),
  /** Why it was skipped or failed. */
  error: z.string().nullable(),
});
export type BroadcastRecipient = z.infer<typeof broadcastRecipientSchema>;

export const broadcastRecipientsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  cursor: z.string().min(1).optional(),
});
export type BroadcastRecipientsQuery = z.infer<typeof broadcastRecipientsQuerySchema>;

export const broadcastRecipientsResponseSchema = z.object({
  data: z.array(broadcastRecipientSchema),
  next_cursor: z.string().nullable(),
});
