import { z } from 'zod';
import { uuidSchema } from './common';

/** Payload of a send-email task. Deliberately tiny: everything else is loaded from the DB. */
export const sendEmailJobSchema = z.object({
  kind: z.literal('send-email'),
  orgId: uuidSchema,
  messageId: uuidSchema,
});
export type SendEmailJob = z.infer<typeof sendEmailJobSchema>;

export const deliverWebhookJobSchema = z.object({
  kind: z.literal('deliver-webhook'),
  orgId: uuidSchema,
  deliveryId: uuidSchema,
});
export type DeliverWebhookJob = z.infer<typeof deliverWebhookJobSchema>;

/** One round of handing a broadcast's waiting recipients to delivery. */
export const dispatchBroadcastJobSchema = z.object({
  kind: z.literal('dispatch-broadcast'),
  orgId: uuidSchema,
  broadcastId: uuidSchema,
});
export type DispatchBroadcastJob = z.infer<typeof dispatchBroadcastJobSchema>;

export const jobSchema = z.discriminatedUnion('kind', [
  sendEmailJobSchema,
  deliverWebhookJobSchema,
  dispatchBroadcastJobSchema,
]);
export type Job = z.infer<typeof jobSchema>;
export type JobKind = Job['kind'];

export const WORKER_OUTCOMES = ['sent', 'retry-scheduled', 'failed', 'skipped'] as const;
export type WorkerOutcome = (typeof WORKER_OUTCOMES)[number];

export const workerResultSchema = z.object({ outcome: z.enum(WORKER_OUTCOMES) });

export const WEBHOOK_OUTCOMES = ['delivered', 'retry-scheduled', 'failed', 'skipped'] as const;
export type WebhookOutcome = (typeof WEBHOOK_OUTCOMES)[number];

export const webhookWorkerResultSchema = z.object({ outcome: z.enum(WEBHOOK_OUTCOMES) });

/**
 * `dispatched` queued recipients and more may follow; `waiting` means no mailbox has room
 * until the daily reset; `completed` means the last recipient was handed over.
 */
export const BROADCAST_OUTCOMES = ['dispatched', 'waiting', 'completed', 'skipped'] as const;
export type BroadcastOutcome = (typeof BROADCAST_OUTCOMES)[number];

export const broadcastWorkerResultSchema = z.object({ outcome: z.enum(BROADCAST_OUTCOMES) });

/** `resumed` is how many broadcasts were set going again with the day's fresh capacity. */
export const resetCountersResponseSchema = z.object({
  reset: z.number().int(),
  resumed: z.number().int(),
});
