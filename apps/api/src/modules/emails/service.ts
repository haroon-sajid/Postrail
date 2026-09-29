import { renderTemplate, TemplateRenderError } from '@postrail/shared';
import { type AuthContext } from '../../lib/context';
import { AppError } from '../../lib/errors';
import { type MailboxRow } from '../../providers/types';
import { type Queue } from '../../queue/types';
import { type MailboxStore } from '../mailboxes/repo';
import { type EmailStore, type ListCursor, type MessageRow, type NewMessage } from './repo';
import {
  type BatchEmailItem,
  type BatchItemResult,
  type Email,
  type EmailListQuery,
  type SendEmailRequest,
  type SendEmailResponse,
} from './schemas';

export interface EmailServiceDeps {
  messages: EmailStore;
  mailboxes: MailboxStore;
  queue: Queue;
}

export interface SendOutcome extends SendEmailResponse {
  /** True when an idempotency key matched an earlier request and nothing new was queued. */
  replayed: boolean;
}

export interface EmailService {
  send: (
    auth: AuthContext,
    input: SendEmailRequest,
    idempotencyKey?: string,
  ) => Promise<SendOutcome>;
  sendBatch: (auth: AuthContext, items: BatchEmailItem[]) => Promise<BatchItemResult[]>;
  get: (auth: AuthContext, id: string) => Promise<Email>;
  list: (
    auth: AuthContext,
    query: EmailListQuery,
  ) => Promise<{ data: Email[]; nextCursor: string | null }>;
  /** Queues a fresh copy of an earlier message (same recipient and content). */
  resend: (auth: AuthContext, id: string) => Promise<SendEmailResponse>;
  /** Rendered content for the dashboard preview. Null when the body is no longer stored. */
  getBody: (
    auth: AuthContext,
    id: string,
  ) => Promise<{ html: string | null; text: string | null } | null>;
}

interface ResolvedContent {
  subject: string;
  html?: string;
  text?: string;
}

/**
 * Accepts, validates and queues. Nothing here talks to a provider: delivery happens in
 * the worker (worker.ts) so the request returns in milliseconds and retries are durable.
 */
export function createEmailService(deps: EmailServiceDeps): EmailService {
  const { messages, mailboxes, queue } = deps;

  async function resolveContent(orgId: string, input: SendEmailRequest): Promise<ResolvedContent> {
    if (!input.template) {
      // The schema guarantees subject and a body when there is no template.
      return {
        subject: input.subject ?? '',
        ...(input.html !== undefined ? { html: input.html } : {}),
        ...(input.text !== undefined ? { text: input.text } : {}),
      };
    }
    if (input.subject !== undefined || input.html !== undefined || input.text !== undefined) {
      throw AppError.validation('template cannot be combined with subject, html or text');
    }
    const template = await messages.findTemplate(orgId, input.template);
    if (!template) throw AppError.notFound(`template "${input.template}"`);
    try {
      return renderTemplate(template, input.variables ?? {});
    } catch (error) {
      if (error instanceof TemplateRenderError) throw AppError.validation(error.message);
      throw error;
    }
  }

  async function pickMailbox(orgId: string, from: string | undefined): Promise<MailboxRow> {
    const mailbox = await mailboxes.pickForSend(orgId, from);
    if (mailbox) return mailbox;
    throw AppError.noMailbox(
      from
        ? `no active mailbox for ${from} with sends remaining today`
        : 'no active mailbox with sends remaining today; connect one or wait for the daily reset',
    );
  }

  /** Inserts and enqueues; the caller has already validated content and picked a mailbox. */
  async function queueMessage(orgId: string, input: NewMessage): Promise<SendOutcome> {
    const { row, created } = await messages.insert(orgId, input);
    if (!created) return { id: row.id, status: row.status, replayed: true };
    try {
      await queue.enqueue({ kind: 'send-email', orgId, messageId: row.id }, { taskId: row.id });
    } catch (error) {
      // Without a task the row would sit in `queued` forever; make the failure visible.
      await messages.markFailed(orgId, row.id, 'could not enqueue for delivery');
      throw error;
    }
    return { id: row.id, status: 'queued', replayed: false };
  }

  const service: EmailService = {
    async send(auth, input, idempotencyKey) {
      const { orgId } = auth;
      if (idempotencyKey) {
        const seen = await messages.findByIdempotencyKey(orgId, idempotencyKey);
        if (seen) return { id: seen.id, status: seen.status, replayed: true };
      }

      const content = await resolveContent(orgId, input);
      if (await messages.isSuppressed(orgId, input.to)) throw AppError.suppressed(input.to);
      const mailbox = await pickMailbox(orgId, input.from);

      return queueMessage(orgId, {
        mailboxId: mailbox.id,
        idempotencyKey: idempotencyKey ?? null,
        toEmail: input.to,
        fromEmail: mailbox.email,
        subject: content.subject,
        body: {
          html: content.html ?? null,
          text: content.text ?? null,
          replyTo: input.reply_to ?? null,
          headers: input.headers ?? null,
        },
      });
    },

    async sendBatch(auth, items) {
      // Sequential: each item is validated and queued on its own; failures do not stop the rest.
      const results: BatchItemResult[] = [];
      for (const [index, item] of items.entries()) {
        const { idempotency_key: key, ...input } = item;
        try {
          const outcome = await service.send(auth, input, key);
          results.push({ index, id: outcome.id, status: outcome.status });
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
          results.push({ index, error: { code: error.code, message: error.message } });
        }
      }
      return results;
    },

    async get(auth, id) {
      const row = await messages.get(auth.orgId, id);
      if (!row) throw AppError.notFound('email');
      return toEmail(row);
    },

    async list(auth, query) {
      const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
      const rows = await messages.list(auth.orgId, query.limit + 1, cursor);
      const page = rows.slice(0, query.limit);
      const last = page.at(-1);
      const nextCursor = rows.length > query.limit && last ? encodeCursor(last) : null;
      return { data: page.map(toEmail), nextCursor };
    },

    async resend(auth, id) {
      const { orgId } = auth;
      const original = await messages.get(orgId, id);
      if (!original) throw AppError.notFound('email');
      const body = await messages.getBody(orgId, id);
      if (!body) throw AppError.validation('the original content is no longer stored');
      if (await messages.isSuppressed(orgId, original.toEmail))
        throw AppError.suppressed(original.toEmail);
      // Prefer the same mailbox; fall back to any that can send if it is gone or paused.
      const mailbox =
        (await mailboxes.pickForSend(orgId, original.fromEmail)) ??
        (await pickMailbox(orgId, undefined));
      const outcome = await queueMessage(orgId, {
        mailboxId: mailbox.id,
        idempotencyKey: null,
        toEmail: original.toEmail,
        fromEmail: mailbox.email,
        subject: original.subject,
        body: { html: body.html, text: body.text, replyTo: body.replyTo, headers: body.headers },
      });
      return { id: outcome.id, status: outcome.status };
    },

    async getBody(auth, id) {
      const row = await messages.get(auth.orgId, id);
      if (!row) throw AppError.notFound('email');
      const body = await messages.getBody(auth.orgId, id);
      return body ? { html: body.html, text: body.text } : null;
    },
  };
  return service;
}

/** Internal row to the snake_case wire shape. Shared with the worker for webhook payloads. */
export function toEmail(row: MessageRow): Email {
  return {
    id: row.id,
    status: row.status,
    to: row.toEmail,
    from: row.fromEmail,
    subject: row.subject,
    mailbox_id: row.mailboxId,
    idempotency_key: row.idempotencyKey,
    provider_message_id: row.providerMessageId,
    error: row.error,
    attempts: row.attempts,
    created_at: row.createdAt.toISOString(),
    sent_at: row.sentAt ? row.sentAt.toISOString() : null,
  };
}

export function encodeCursor(row: Pick<MessageRow, 'createdAt' | 'id'>): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): ListCursor {
  const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const createdAt = new Date(iso ?? '');
  if (!id || Number.isNaN(createdAt.getTime())) throw AppError.validation('invalid cursor');
  return { createdAt, id };
}
