import { z } from 'zod';
import { MAILBOX_PROVIDERS, MAILBOX_STATUSES } from '../constants';
import { uuidSchema } from './common';

/** GET /api/google/connect?org=... */
export const googleConnectQuerySchema = z.object({ org: uuidSchema });

/** GET /api/google/callback: Google sends either code+state or error+state. */
export const googleCallbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1),
  error: z.string().min(1).optional(),
});
export type GoogleCallbackQuery = z.infer<typeof googleCallbackQuerySchema>;

/** What the signed OAuth state carries. */
export const oauthStateSchema = z.object({ orgId: uuidSchema });
export type OauthState = z.infer<typeof oauthStateSchema>;

/** Public shape of a mailbox (snake_case on the wire). Token columns never appear here. */
export const mailboxSchema = z.object({
  id: uuidSchema,
  email: z.email(),
  provider: z.enum(MAILBOX_PROVIDERS),
  status: z.enum(MAILBOX_STATUSES),
  daily_limit: z.number().int(),
  sent_today: z.number().int(),
  last_used_at: z.iso.datetime().nullable(),
  created_at: z.iso.datetime(),
});
export type Mailbox = z.infer<typeof mailboxSchema>;

export const mailboxListResponseSchema = z.object({ data: z.array(mailboxSchema) });
export type MailboxListResponse = z.infer<typeof mailboxListResponseSchema>;

/** Dashboard edits: cap the daily limit and pause or resume. Disconnected is not settable. */
export const updateMailboxRequestSchema = z
  .object({
    daily_limit: z.number().int().min(1).max(10_000).optional(),
    status: z.enum(['active', 'paused']).optional(),
  })
  .refine((p) => p.daily_limit !== undefined || p.status !== undefined, {
    message: 'nothing to update',
  });
export type UpdateMailboxRequest = z.infer<typeof updateMailboxRequestSchema>;

export const connectUrlResponseSchema = z.object({ url: z.url() });

/** Header names a caller may set on an outbound message. Everything structural is ours. */
export const customHeaderNameSchema = z
  .string()
  .regex(/^[A-Za-z0-9-]{1,64}$/, 'header names are letters, digits and dashes')
  .refine((name) => !RESERVED_HEADERS.has(name.toLowerCase()), 'header is reserved');

export const RESERVED_HEADERS = new Set([
  'from',
  'to',
  'cc',
  'bcc',
  'subject',
  'date',
  'message-id',
  'reply-to',
  'mime-version',
  'content-type',
  'content-transfer-encoding',
  'return-path',
  'sender',
]);

export const customHeadersSchema = z.record(
  customHeaderNameSchema,
  z
    .string()
    .max(998)
    .regex(/^[^\r\n]*$/, 'header values cannot contain line breaks'),
);

/** What a provider is asked to send. The From address is always the mailbox's own. */
export const outboundMessageSchema = z
  .object({
    to: z.email(),
    subject: z.string().min(1).max(998),
    text: z.string().optional(),
    html: z.string().optional(),
    replyTo: z.email().optional(),
    headers: customHeadersSchema.optional(),
  })
  .refine((m) => m.text !== undefined || m.html !== undefined, {
    message: 'text or html is required',
  });
export type OutboundMessage = z.infer<typeof outboundMessageSchema>;
