import { type Db, messageBodies, messages, suppressions, templates, withOrg } from '@postrail/db';
import { and, desc, eq, gte, ilike, lt, or, sql } from 'drizzle-orm';

/** Users search literal text; `%` and `_` in it must not become wildcards. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export type MessageRow = typeof messages.$inferSelect;
export type MessageBodyRow = typeof messageBodies.$inferSelect;
export type TemplateRow = typeof templates.$inferSelect;

export interface NewMessageBody {
  html: string | null;
  text: string | null;
  replyTo: string | null;
  headers: Record<string, string> | null;
}

export interface NewMessage {
  mailboxId: string;
  idempotencyKey: string | null;
  toEmail: string;
  fromEmail: string;
  subject: string;
  body: NewMessageBody;
}

export interface ListCursor {
  createdAt: Date;
  id: string;
}

export interface EmailListFilters {
  status?: MessageRow['status'];
  mailboxId?: string;
  from?: Date;
  to?: Date;
  /** Substring, case-insensitive, against to_email and subject. */
  q?: string;
}

export interface EmailStore {
  findByIdempotencyKey: (orgId: string, key: string) => Promise<MessageRow | undefined>;
  /** `created: false` means another request with the same idempotency key got there first. */
  insert: (orgId: string, input: NewMessage) => Promise<{ row: MessageRow; created: boolean }>;
  /**
   * Atomically moves queued -> sending and bumps attempts. Returns undefined when the
   * message is already sent, failed, or being sent by someone else within the lease.
   */
  claimForSending: (
    orgId: string,
    id: string,
    leaseMs: number,
    now: Date,
  ) => Promise<MessageRow | undefined>;
  getBody: (orgId: string, id: string) => Promise<MessageBodyRow | undefined>;
  /** Terminal: records the provider id. The body is kept for preview and resend (ADR 0007). */
  markSent: (orgId: string, id: string, providerMessageId: string, sentAt: Date) => Promise<void>;
  /** Terminal: records the reason. */
  markFailed: (orgId: string, id: string, error: string) => Promise<void>;
  /** Back to queued with the last error kept for visibility. */
  scheduleRetry: (orgId: string, id: string, error: string, now: Date) => Promise<void>;
  get: (orgId: string, id: string) => Promise<MessageRow | undefined>;
  /** Newest first. Returns up to `limit` rows strictly after `cursor`, matching `filters`. */
  list: (
    orgId: string,
    limit: number,
    cursor?: ListCursor,
    filters?: EmailListFilters,
  ) => Promise<MessageRow[]>;
  isSuppressed: (orgId: string, email: string) => Promise<boolean>;
  findTemplate: (orgId: string, slug: string) => Promise<TemplateRow | undefined>;
}

export function createEmailStore(db: Db): EmailStore {
  const scoped = (orgId: string, id: string) => and(eq(messages.orgId, orgId), eq(messages.id, id));

  return {
    findByIdempotencyKey: (orgId, key) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .select()
          .from(messages)
          .where(and(eq(messages.orgId, orgId), eq(messages.idempotencyKey, key)))
          .limit(1);
        return row;
      }),

    insert: (orgId, { body, ...input }) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .insert(messages)
          .values({ orgId, ...input, status: 'queued' })
          .onConflictDoNothing({ target: [messages.orgId, messages.idempotencyKey] })
          .returning();
        if (!row) {
          // Lost the race on the idempotency key: hand back the winner.
          const [existing] = await tx
            .select()
            .from(messages)
            .where(
              and(
                eq(messages.orgId, orgId),
                eq(messages.idempotencyKey, input.idempotencyKey ?? ''),
              ),
            )
            .limit(1);
          if (!existing) throw new Error('message insert conflicted but no row was found');
          return { row: existing, created: false };
        }
        await tx.insert(messageBodies).values({ messageId: row.id, orgId, ...body });
        return { row, created: true };
      }),

    claimForSending: (orgId, id, leaseMs, now) =>
      withOrg(db, orgId, async (tx) => {
        const staleBefore = new Date(now.getTime() - leaseMs);
        const [row] = await tx
          .update(messages)
          .set({ status: 'sending', attempts: sql`${messages.attempts} + 1`, updatedAt: now })
          .where(
            and(
              scoped(orgId, id),
              or(
                eq(messages.status, 'queued'),
                and(eq(messages.status, 'sending'), lt(messages.updatedAt, staleBefore)),
              ),
            ),
          )
          .returning();
        return row;
      }),

    getBody: (orgId, id) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .select()
          .from(messageBodies)
          .where(and(eq(messageBodies.orgId, orgId), eq(messageBodies.messageId, id)))
          .limit(1);
        return row;
      }),

    markSent: (orgId, id, providerMessageId, sentAt) =>
      withOrg(db, orgId, async (tx) => {
        await tx
          .update(messages)
          .set({ status: 'sent', providerMessageId, sentAt, error: null })
          .where(scoped(orgId, id));
      }),

    markFailed: (orgId, id, error) =>
      withOrg(db, orgId, async (tx) => {
        await tx.update(messages).set({ status: 'failed', error }).where(scoped(orgId, id));
      }),

    scheduleRetry: (orgId, id, error, now) =>
      withOrg(db, orgId, async (tx) => {
        await tx
          .update(messages)
          .set({ status: 'queued', error, updatedAt: now })
          .where(scoped(orgId, id));
      }),

    get: (orgId, id) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx.select().from(messages).where(scoped(orgId, id)).limit(1);
        return row;
      }),

    list: (orgId, limit, cursor, filters = {}) =>
      withOrg(db, orgId, (tx) =>
        tx
          .select()
          .from(messages)
          .where(
            and(
              eq(messages.orgId, orgId),
              // Keyset on (created_at, id) so the org+created index does all the work.
              cursor
                ? or(
                    lt(messages.createdAt, cursor.createdAt),
                    and(eq(messages.createdAt, cursor.createdAt), lt(messages.id, cursor.id)),
                  )
                : undefined,
              filters.status ? eq(messages.status, filters.status) : undefined,
              filters.mailboxId ? eq(messages.mailboxId, filters.mailboxId) : undefined,
              filters.from ? gte(messages.createdAt, filters.from) : undefined,
              filters.to ? lt(messages.createdAt, filters.to) : undefined,
              filters.q
                ? or(
                    ilike(messages.toEmail, `%${escapeLike(filters.q)}%`),
                    ilike(messages.subject, `%${escapeLike(filters.q)}%`),
                  )
                : undefined,
            ),
          )
          .orderBy(desc(messages.createdAt), desc(messages.id))
          .limit(limit),
      ),

    isSuppressed: (orgId, email) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .select({ email: suppressions.email })
          .from(suppressions)
          .where(and(eq(suppressions.orgId, orgId), eq(suppressions.email, email.toLowerCase())))
          .limit(1);
        return row !== undefined;
      }),

    findTemplate: (orgId, slug) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .select()
          .from(templates)
          .where(and(eq(templates.orgId, orgId), eq(templates.slug, slug)))
          .limit(1);
        return row;
      }),
  };
}
