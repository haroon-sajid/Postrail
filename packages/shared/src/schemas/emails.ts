import { z } from 'zod';
import {
  DEFAULT_PAGE_SIZE,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  MAX_BATCH_SIZE,
  MAX_BODY_CHARS,
  MAX_PAGE_SIZE,
  MESSAGE_STATUSES,
} from '../constants';
import { uuidSchema } from './common';
import { customHeadersSchema } from './mailboxes';

export const templateVariablesSchema = z.record(
  z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'variable names are identifiers'),
  z.union([z.string(), z.number(), z.boolean()]),
);
export type TemplateVariables = z.infer<typeof templateVariablesSchema>;

/** Fields of POST /v1/emails. Snake_case on the wire; the service maps to camelCase. */
export const sendEmailFieldsSchema = z.object({
  to: z.email(),
  subject: z.string().min(1).max(998).optional(),
  html: z.string().max(MAX_BODY_CHARS).optional(),
  text: z.string().max(MAX_BODY_CHARS).optional(),
  /** Slug of a stored template. Supplies subject and html; body fields must then be absent. */
  template: z.string().min(1).max(100).optional(),
  variables: templateVariablesSchema.optional(),
  /** Address of one of the org's mailboxes. Omit to let Postrail pick the least used one. */
  from: z.email().optional(),
  reply_to: z.email().optional(),
  headers: customHeadersSchema.optional(),
});

function hasDeliverableContent(m: z.infer<typeof sendEmailFieldsSchema>): boolean {
  if (m.template) return true;
  return m.subject !== undefined && (m.html !== undefined || m.text !== undefined);
}

const CONTENT_RULE = { message: 'provide template, or subject with html or text' };

export const sendEmailRequestSchema = sendEmailFieldsSchema.refine(
  hasDeliverableContent,
  CONTENT_RULE,
);
export type SendEmailRequest = z.infer<typeof sendEmailRequestSchema>;

export const idempotencyKeySchema = z.string().min(1).max(IDEMPOTENCY_KEY_MAX_LENGTH);

export const batchEmailItemSchema = sendEmailFieldsSchema
  .extend({ idempotency_key: idempotencyKeySchema.optional() })
  .refine(hasDeliverableContent, CONTENT_RULE);
export type BatchEmailItem = z.infer<typeof batchEmailItemSchema>;

export const sendEmailBatchRequestSchema = z.object({
  emails: z.array(batchEmailItemSchema).min(1).max(MAX_BATCH_SIZE),
});
export type SendEmailBatchRequest = z.infer<typeof sendEmailBatchRequestSchema>;

export const sendEmailResponseSchema = z.object({
  id: uuidSchema,
  status: z.enum(MESSAGE_STATUSES),
});
export type SendEmailResponse = z.infer<typeof sendEmailResponseSchema>;

export const batchItemResultSchema = z.union([
  z.object({ index: z.number().int(), id: uuidSchema, status: z.enum(MESSAGE_STATUSES) }),
  z.object({
    index: z.number().int(),
    error: z.object({ code: z.string(), message: z.string() }),
  }),
]);
export type BatchItemResult = z.infer<typeof batchItemResultSchema>;

export const sendEmailBatchResponseSchema = z.object({
  results: z.array(batchItemResultSchema),
});
export type SendEmailBatchResponse = z.infer<typeof sendEmailBatchResponseSchema>;

/** Public shape of a message (snake_case on the wire). Bodies are never stored or returned. */
export const emailSchema = z.object({
  id: uuidSchema,
  status: z.enum(MESSAGE_STATUSES),
  to: z.email(),
  from: z.email(),
  subject: z.string(),
  mailbox_id: uuidSchema.nullable(),
  idempotency_key: z.string().nullable(),
  provider_message_id: z.string().nullable(),
  error: z.string().nullable(),
  attempts: z.number().int(),
  created_at: z.iso.datetime(),
  sent_at: z.iso.datetime().nullable(),
});
export type Email = z.infer<typeof emailSchema>;

export const emailListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  cursor: z.string().min(1).optional(),
  status: z.enum(MESSAGE_STATUSES).optional(),
  mailbox_id: uuidSchema.optional(),
  /** Inclusive lower bound on created_at. */
  from: z.iso.datetime({ offset: true }).optional(),
  /** Exclusive upper bound on created_at. */
  to: z.iso.datetime({ offset: true }).optional(),
  /** Case-insensitive substring match on the recipient or the subject. */
  q: z.string().trim().min(1).max(200).optional(),
});
export type EmailListQuery = z.infer<typeof emailListQuerySchema>;

export const emailListResponseSchema = z.object({
  data: z.array(emailSchema),
  next_cursor: z.string().nullable(),
});
export type EmailListResponse = z.infer<typeof emailListResponseSchema>;
