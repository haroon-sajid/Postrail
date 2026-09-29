import { type Db, mailboxes, withOrg, withSystem } from '@postrail/db';
import { type MailboxProvider, type MailboxStatus } from '@postrail/shared';
import { and, asc, eq, gt, lt, sql } from 'drizzle-orm';
import { type MailboxRow } from '../../providers/types';
import { insertAuditEntry } from '../audit/repo';
import { type AuditInput } from '../audit/service';

/** Columns safe to return to clients. Token columns are deliberately absent. */
const publicColumns = {
  id: mailboxes.id,
  email: mailboxes.email,
  provider: mailboxes.provider,
  status: mailboxes.status,
  dailyLimit: mailboxes.dailyLimit,
  sentToday: mailboxes.sentToday,
  createdAt: mailboxes.createdAt,
};

export interface MailboxSummary {
  id: string;
  email: string;
  provider: MailboxProvider;
  status: MailboxStatus;
  dailyLimit: number;
  sentToday: number;
  createdAt: Date;
}

export interface ConnectedMailboxInput {
  email: string;
  provider: MailboxProvider;
  refreshTokenEnc: string;
  accessTokenEnc: string | null;
  accessExpiresAt: Date | null;
}

/** Everything the service needs from the database, so it can be tested with a fake. */
export interface MailboxStore {
  list: (orgId: string) => Promise<MailboxSummary[]>;
  get: (orgId: string, id: string) => Promise<MailboxRow | undefined>;
  /** Insert or refresh the tokens of an existing (org, email) pair; audits in the same tx. */
  upsertConnected: (
    orgId: string,
    input: ConnectedMailboxInput,
    audit: AuditInput,
  ) => Promise<MailboxSummary>;
  remove: (orgId: string, id: string, audit: AuditInput) => Promise<boolean>;
  saveAccessToken: (
    orgId: string,
    id: string,
    accessTokenEnc: string,
    expiresAt: Date,
  ) => Promise<void>;
  setStatus: (orgId: string, id: string, status: MailboxStatus) => Promise<void>;
  /**
   * The mailbox to send from: `from`'s mailbox if given, else the active one with the
   * fewest sends today. Only mailboxes under their daily limit qualify.
   */
  pickForSend: (orgId: string, from?: string) => Promise<MailboxRow | undefined>;
  incrementSentToday: (orgId: string, id: string) => Promise<void>;
  /** Cross-tenant by design (the daily cron). Returns how many mailboxes were reset. */
  resetDailyCounters: () => Promise<number>;
  update: (orgId: string, id: string, patch: MailboxPatch) => Promise<MailboxSummary | undefined>;
  /** For the system mailbox, whose org is configuration rather than request context. */
  findByEmailAnyOrg: (email: string) => Promise<MailboxRow | undefined>;
}

export interface MailboxPatch {
  dailyLimit?: number;
  status?: 'active' | 'paused';
}

export function createMailboxStore(db: Db): MailboxStore {
  return {
    list: (orgId) =>
      withOrg(db, orgId, (tx) =>
        tx
          .select(publicColumns)
          .from(mailboxes)
          .where(eq(mailboxes.orgId, orgId))
          .orderBy(mailboxes.createdAt),
      ),

    get: (orgId, id) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .select()
          .from(mailboxes)
          .where(and(eq(mailboxes.orgId, orgId), eq(mailboxes.id, id)))
          .limit(1);
        return row;
      }),

    upsertConnected: (orgId, input, audit) =>
      withOrg(db, orgId, async (tx) => {
        const tokens = {
          refreshTokenEnc: input.refreshTokenEnc,
          accessTokenEnc: input.accessTokenEnc,
          accessExpiresAt: input.accessExpiresAt,
          status: 'active' as const,
        };
        const [row] = await tx
          .insert(mailboxes)
          .values({ orgId, email: input.email, provider: input.provider, ...tokens })
          .onConflictDoUpdate({
            target: [mailboxes.orgId, mailboxes.email],
            set: { ...tokens, updatedAt: new Date() },
          })
          .returning(publicColumns);
        if (!row) throw new Error('mailbox upsert returned no row');
        await insertAuditEntry(tx, orgId, { ...audit, target: row.id });
        return row;
      }),

    remove: (orgId, id, audit) =>
      withOrg(db, orgId, async (tx) => {
        const deleted = await tx
          .delete(mailboxes)
          .where(and(eq(mailboxes.orgId, orgId), eq(mailboxes.id, id)))
          .returning({ id: mailboxes.id });
        if (deleted.length === 0) return false;
        await insertAuditEntry(tx, orgId, { ...audit, target: id });
        return true;
      }),

    saveAccessToken: (orgId, id, accessTokenEnc, expiresAt) =>
      withOrg(db, orgId, async (tx) => {
        await tx
          .update(mailboxes)
          .set({ accessTokenEnc, accessExpiresAt: expiresAt })
          .where(and(eq(mailboxes.orgId, orgId), eq(mailboxes.id, id)));
      }),

    setStatus: (orgId, id, status) =>
      withOrg(db, orgId, async (tx) => {
        await tx
          .update(mailboxes)
          .set({ status })
          .where(and(eq(mailboxes.orgId, orgId), eq(mailboxes.id, id)));
      }),

    pickForSend: (orgId, from) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .select()
          .from(mailboxes)
          .where(
            and(
              eq(mailboxes.orgId, orgId),
              eq(mailboxes.status, 'active'),
              lt(mailboxes.sentToday, mailboxes.dailyLimit),
              from ? eq(mailboxes.email, from) : undefined,
            ),
          )
          .orderBy(asc(mailboxes.sentToday), asc(mailboxes.createdAt))
          .limit(1);
        return row;
      }),

    incrementSentToday: (orgId, id) =>
      withOrg(db, orgId, async (tx) => {
        await tx
          .update(mailboxes)
          .set({ sentToday: sql`${mailboxes.sentToday} + 1` })
          .where(and(eq(mailboxes.orgId, orgId), eq(mailboxes.id, id)));
      }),

    update: (orgId, id, patch) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .update(mailboxes)
          .set({ ...patch, updatedAt: new Date() })
          .where(and(eq(mailboxes.orgId, orgId), eq(mailboxes.id, id)))
          .returning(publicColumns);
        return row;
      }),

    // withSystem: SYSTEM_MAILBOX_EMAIL names a mailbox, not an org.
    findByEmailAnyOrg: (email) =>
      withSystem(db, async (tx) => {
        const [row] = await tx.select().from(mailboxes).where(eq(mailboxes.email, email)).limit(1);
        return row;
      }),

    // withSystem: Cloud Scheduler calls this once a day for every tenant at once.
    resetDailyCounters: () =>
      withSystem(db, async (tx) => {
        const rows = await tx
          .update(mailboxes)
          .set({ sentToday: 0 })
          .where(gt(mailboxes.sentToday, 0))
          .returning({ id: mailboxes.id });
        return rows.length;
      }),
  };
}
