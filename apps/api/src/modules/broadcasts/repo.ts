import {
  broadcastRecipients,
  broadcasts,
  contactListMembers,
  contactLists,
  contacts,
  type Db,
  mailboxes,
  messages,
  type OrgDb,
  templates,
  withOrg,
  withSystem,
} from '@postrail/db';
import {
  BROADCAST_CAPACITY_SHARE,
  type BroadcastRecipientState,
  type BroadcastRecipientStatus,
  type MessageStatus,
} from '@postrail/shared';
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gt,
  inArray,
  lt,
  ne,
  or,
  sql,
} from 'drizzle-orm';

export type BroadcastRow = typeof broadcasts.$inferSelect;
export type RecipientRow = typeof broadcastRecipients.$inferSelect;

/** A broadcast with the names of what it points at, for display. */
export interface BroadcastView extends BroadcastRow {
  templateSlug: string | null;
  listName: string | null;
}

export interface RecipientCounts {
  total: number;
  pending: number;
  queued: number;
  sent: number;
  failed: number;
  skipped: number;
}

export interface RecipientView {
  id: string;
  email: string;
  status: BroadcastRecipientStatus;
  messageId: string | null;
  error: string | null;
}

/** How many more messages a broadcast may put on a mailbox today. */
export interface MailboxRoom {
  email: string;
  remaining: number;
}

export type RecipientOutcome =
  { state: 'queued'; messageId: string } | { state: 'skipped' | 'failed'; error: string };

/**
 * What the API reports for a recipient: our own state until it is handed to delivery,
 * then whatever became of the message.
 */
export function recipientStatus(
  state: BroadcastRecipientState,
  messageStatus: MessageStatus | null,
): BroadcastRecipientStatus {
  if (state === 'pending' || state === 'dispatching') return 'pending';
  if (state === 'skipped' || state === 'failed') return state;
  if (messageStatus === 'sent' || messageStatus === 'failed') return messageStatus;
  return 'queued';
}

/**
 * Room a broadcast may still use on one mailbox: its share of the daily limit, less what
 * went out today and what is already queued. The rest is kept for application email.
 */
export function broadcastRoom(dailyLimit: number, sentToday: number, inFlight: number): number {
  return Math.max(0, Math.floor(dailyLimit * BROADCAST_CAPACITY_SHARE) - sentToday - inFlight);
}

/** Everything the service and worker need from the database, so both can be tested with a fake. */
export interface BroadcastStore {
  create: (
    orgId: string,
    input: { name: string; templateId: string; listId: string },
  ) => Promise<BroadcastView>;
  /** Newest first. */
  list: (orgId: string) => Promise<BroadcastView[]>;
  get: (orgId: string, id: string) => Promise<BroadcastView | undefined>;
  /** Undefined when the broadcast does not exist or is no longer a draft. */
  updateDraft: (
    orgId: string,
    id: string,
    patch: { name?: string; templateId?: string; listId?: string },
  ) => Promise<BroadcastView | undefined>;
  /** Never removes one that is sending; cancel it first. */
  remove: (orgId: string, id: string) => Promise<boolean>;
  /**
   * draft -> sending, in one transaction: freezes the content and copies the list into
   * recipients. Returns how many, or undefined when it was not a draft, so a repeated
   * request cannot start it twice.
   */
  start: (
    orgId: string,
    id: string,
    content: { subject: string; html: string },
    now: Date,
  ) => Promise<number | undefined>;
  /** sending -> canceled; recipients still waiting become skipped. */
  cancel: (orgId: string, id: string, now: Date) => Promise<boolean>;
  /** sending -> sent. */
  complete: (orgId: string, id: string, now: Date) => Promise<void>;
  counts: (orgId: string, ids: string[]) => Promise<Map<string, RecipientCounts>>;

  /**
   * Atomically takes up to `limit` waiting recipients for this worker. A claim older than
   * `leaseMs` belongs to a worker that died and may be taken again.
   */
  claimRecipients: (
    orgId: string,
    broadcastId: string,
    limit: number,
    leaseMs: number,
    now: Date,
  ) => Promise<RecipientRow[]>;
  settleRecipient: (orgId: string, id: string, outcome: RecipientOutcome) => Promise<void>;
  /** Hands claimed recipients back untouched, for a later round. */
  releaseRecipients: (orgId: string, ids: string[]) => Promise<void>;
  /** Recipients not yet handed to delivery or given up on. */
  countWaiting: (orgId: string, broadcastId: string) => Promise<number>;
  mailboxRoom: (orgId: string) => Promise<MailboxRoom[]>;
  /** By address. Returns up to `limit` rows after `afterEmail`. */
  recipients: (
    orgId: string,
    broadcastId: string,
    limit: number,
    afterEmail?: string,
  ) => Promise<RecipientView[]>;
  /** Cross-tenant by design: the daily job sets every unfinished broadcast going again. */
  listSending: () => Promise<Array<{ orgId: string; id: string }>>;
}

const viewColumns = {
  ...getTableColumns(broadcasts),
  templateSlug: templates.slug,
  listName: contactLists.name,
};

function views(tx: OrgDb, orgId: string, id?: string) {
  return tx
    .select(viewColumns)
    .from(broadcasts)
    .leftJoin(templates, eq(templates.id, broadcasts.templateId))
    .leftJoin(contactLists, eq(contactLists.id, broadcasts.listId))
    .where(and(eq(broadcasts.orgId, orgId), id ? eq(broadcasts.id, id) : undefined))
    .orderBy(desc(broadcasts.createdAt));
}

const state = broadcastRecipients.state;
const delivered = sql`${state} = 'queued' and ${messages.status} = 'sent'`;
const bounced = sql`${state} = 'failed' or (${state} = 'queued' and ${messages.status} = 'failed')`;
const tally = (condition: unknown) => sql<number>`(count(*) filter (where ${condition}))::int`;

export function createBroadcastStore(db: Db): BroadcastStore {
  const broadcast = (orgId: string, id: string) =>
    and(eq(broadcasts.orgId, orgId), eq(broadcasts.id, id));
  const recipient = (orgId: string, id: string) =>
    and(eq(broadcastRecipients.orgId, orgId), eq(broadcastRecipients.id, id));
  const recipientsOf = (orgId: string, broadcastId: string) =>
    and(eq(broadcastRecipients.orgId, orgId), eq(broadcastRecipients.broadcastId, broadcastId));
  const waiting = inArray(state, ['pending', 'dispatching']);

  const get: BroadcastStore['get'] = (orgId, id) =>
    withOrg(db, orgId, async (tx) => (await views(tx, orgId, id))[0]);

  return {
    create: async (orgId, input) => {
      const id = await withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .insert(broadcasts)
          .values({ orgId, ...input })
          .returning({ id: broadcasts.id });
        if (!row) throw new Error('broadcast insert returned no row');
        return row.id;
      });
      const view = await get(orgId, id);
      if (!view) throw new Error('broadcast vanished after insert');
      return view;
    },

    list: (orgId) => withOrg(db, orgId, (tx) => views(tx, orgId)),
    get,

    updateDraft: async (orgId, id, patch) => {
      const updated = await withOrg(db, orgId, async (tx) => {
        const rows = await tx
          .update(broadcasts)
          .set({ ...patch, updatedAt: new Date() })
          .where(and(broadcast(orgId, id), eq(broadcasts.status, 'draft')))
          .returning({ id: broadcasts.id });
        return rows.length > 0;
      });
      return updated ? get(orgId, id) : undefined;
    },

    remove: (orgId, id) =>
      withOrg(db, orgId, async (tx) => {
        const rows = await tx
          .delete(broadcasts)
          .where(and(broadcast(orgId, id), ne(broadcasts.status, 'sending')))
          .returning({ id: broadcasts.id });
        return rows.length > 0;
      }),

    start: (orgId, id, content, now) =>
      withOrg(db, orgId, async (tx) => {
        // The status check is the guard: only one caller can move a draft to sending.
        const [row] = await tx
          .update(broadcasts)
          .set({ ...content, status: 'sending', startedAt: now, updatedAt: now })
          .where(and(broadcast(orgId, id), eq(broadcasts.status, 'draft')))
          .returning({ listId: broadcasts.listId });
        if (!row) return undefined;
        if (!row.listId) return 0;
        // Copy the list as it is now. Later changes to it do not change who gets this.
        const copied = await tx.execute(sql`
          insert into ${broadcastRecipients} (org_id, broadcast_id, contact_id, email, properties)
          select ${orgId}::uuid, ${id}::uuid, ${contacts.id}, ${contacts.email}, ${contacts.properties}
          from ${contactListMembers}
          join ${contacts} on ${contacts.id} = ${contactListMembers.contactId}
          where ${contactListMembers.orgId} = ${orgId} and ${contactListMembers.listId} = ${row.listId}
          returning 1
        `);
        return copied.length;
      }),

    cancel: (orgId, id, now) =>
      withOrg(db, orgId, async (tx) => {
        const rows = await tx
          .update(broadcasts)
          .set({ status: 'canceled', completedAt: now, updatedAt: now })
          .where(and(broadcast(orgId, id), eq(broadcasts.status, 'sending')))
          .returning({ id: broadcasts.id });
        if (rows.length === 0) return false;
        await tx
          .update(broadcastRecipients)
          .set({ state: 'skipped', error: 'broadcast canceled', updatedAt: now })
          .where(and(recipientsOf(orgId, id), waiting));
        return true;
      }),

    complete: (orgId, id, now) =>
      withOrg(db, orgId, async (tx) => {
        await tx
          .update(broadcasts)
          .set({ status: 'sent', completedAt: now, updatedAt: now })
          .where(and(broadcast(orgId, id), eq(broadcasts.status, 'sending')));
      }),

    counts: (orgId, ids) =>
      withOrg(db, orgId, async (tx) => {
        const byId = new Map<string, RecipientCounts>();
        if (ids.length === 0) return byId;
        const rows = await tx
          .select({
            broadcastId: broadcastRecipients.broadcastId,
            total: count(),
            pending: tally(sql`${state} in ('pending', 'dispatching')`),
            sent: tally(delivered),
            failed: tally(bounced),
            skipped: tally(sql`${state} = 'skipped'`),
          })
          .from(broadcastRecipients)
          .leftJoin(
            messages,
            and(eq(messages.id, broadcastRecipients.messageId), eq(messages.orgId, orgId)),
          )
          .where(
            and(
              eq(broadcastRecipients.orgId, orgId),
              inArray(broadcastRecipients.broadcastId, ids),
            ),
          )
          .groupBy(broadcastRecipients.broadcastId);
        for (const { broadcastId, ...row } of rows) {
          // Whatever is neither waiting nor finished is on its way.
          const queued = row.total - row.pending - row.sent - row.failed - row.skipped;
          byId.set(broadcastId, { ...row, queued });
        }
        return byId;
      }),

    claimRecipients: (orgId, broadcastId, limit, leaseMs, now) =>
      withOrg(db, orgId, (tx) => {
        const staleBefore = new Date(now.getTime() - leaseMs);
        // SKIP LOCKED: two workers on the same broadcast take different rows, not the same.
        const next = tx
          .select({ id: broadcastRecipients.id })
          .from(broadcastRecipients)
          .where(
            and(
              recipientsOf(orgId, broadcastId),
              or(
                eq(state, 'pending'),
                and(eq(state, 'dispatching'), lt(broadcastRecipients.updatedAt, staleBefore)),
              ),
            ),
          )
          .orderBy(asc(broadcastRecipients.email))
          .limit(limit)
          .for('update', { skipLocked: true });
        return tx
          .update(broadcastRecipients)
          .set({ state: 'dispatching', updatedAt: now })
          .where(inArray(broadcastRecipients.id, next))
          .returning();
      }),

    settleRecipient: (orgId, id, outcome) =>
      withOrg(db, orgId, async (tx) => {
        await tx
          .update(broadcastRecipients)
          .set(
            outcome.state === 'queued'
              ? { state: 'queued', messageId: outcome.messageId, error: null }
              : { state: outcome.state, error: outcome.error },
          )
          .where(recipient(orgId, id));
      }),

    releaseRecipients: (orgId, ids) =>
      withOrg(db, orgId, async (tx) => {
        if (ids.length === 0) return;
        await tx
          .update(broadcastRecipients)
          .set({ state: 'pending' })
          .where(
            and(
              eq(broadcastRecipients.orgId, orgId),
              inArray(broadcastRecipients.id, ids),
              eq(state, 'dispatching'),
            ),
          );
      }),

    countWaiting: (orgId, broadcastId) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .select({ n: count() })
          .from(broadcastRecipients)
          .where(and(recipientsOf(orgId, broadcastId), waiting));
        return row?.n ?? 0;
      }),

    mailboxRoom: (orgId) =>
      withOrg(db, orgId, async (tx) => {
        const boxes = await tx
          .select({
            id: mailboxes.id,
            email: mailboxes.email,
            dailyLimit: mailboxes.dailyLimit,
            sentToday: mailboxes.sentToday,
          })
          .from(mailboxes)
          .where(and(eq(mailboxes.orgId, orgId), eq(mailboxes.status, 'active')));
        // Queued messages do not count towards sent_today until the worker sends them,
        // so without this a burst would be planned against room that is already spoken for.
        const inFlight = await tx
          .select({ mailboxId: messages.mailboxId, n: count() })
          .from(messages)
          .where(and(eq(messages.orgId, orgId), inArray(messages.status, ['queued', 'sending'])))
          .groupBy(messages.mailboxId);
        const busy = new Map(inFlight.map((row) => [row.mailboxId, row.n]));
        return boxes
          .map((box) => ({
            email: box.email,
            remaining: broadcastRoom(box.dailyLimit, box.sentToday, busy.get(box.id) ?? 0),
          }))
          .filter((box) => box.remaining > 0);
      }),

    recipients: (orgId, broadcastId, limit, afterEmail) =>
      withOrg(db, orgId, async (tx) => {
        const rows = await tx
          .select({
            id: broadcastRecipients.id,
            email: broadcastRecipients.email,
            state,
            messageId: broadcastRecipients.messageId,
            error: broadcastRecipients.error,
            messageStatus: messages.status,
            messageError: messages.error,
          })
          .from(broadcastRecipients)
          .leftJoin(
            messages,
            and(eq(messages.id, broadcastRecipients.messageId), eq(messages.orgId, orgId)),
          )
          .where(
            and(
              recipientsOf(orgId, broadcastId),
              afterEmail ? gt(broadcastRecipients.email, afterEmail) : undefined,
            ),
          )
          .orderBy(asc(broadcastRecipients.email))
          .limit(limit);
        return rows.map((row) => ({
          id: row.id,
          email: row.email,
          status: recipientStatus(row.state, row.messageStatus),
          messageId: row.messageId,
          error: row.error ?? row.messageError,
        }));
      }),

    // withSystem: Cloud Scheduler calls this once a day for every tenant at once.
    listSending: () =>
      withSystem(db, (tx) =>
        tx
          .select({ orgId: broadcasts.orgId, id: broadcasts.id })
          .from(broadcasts)
          .where(eq(broadcasts.status, 'sending')),
      ),
  };
}
