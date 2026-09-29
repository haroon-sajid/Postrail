import { type Db, suppressions, withOrg } from '@postrail/db';
import { and, desc, eq } from 'drizzle-orm';

export type SuppressionRow = typeof suppressions.$inferSelect;

/** Addresses are stored lowercase so lookups and the (org_id, email) key are case-insensitive. */
export interface SuppressionStore {
  upsert: (orgId: string, email: string, reason: string) => Promise<SuppressionRow>;
  list: (orgId: string, limit: number) => Promise<SuppressionRow[]>;
  get: (orgId: string, email: string) => Promise<SuppressionRow | undefined>;
  remove: (orgId: string, email: string) => Promise<boolean>;
  /** Inserts the new ones, skips the ones already listed. Returns how many were added. */
  upsertMany: (orgId: string, emails: string[], reason: string) => Promise<number>;
}

export function createSuppressionStore(db: Db): SuppressionStore {
  const scoped = (orgId: string, email: string) =>
    and(eq(suppressions.orgId, orgId), eq(suppressions.email, email));

  return {
    upsert: (orgId, email, reason) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .insert(suppressions)
          .values({ orgId, email, reason })
          // An address already on the list keeps its original reason and date.
          .onConflictDoNothing({ target: [suppressions.orgId, suppressions.email] })
          .returning();
        if (row) return row;
        const [existing] = await tx
          .select()
          .from(suppressions)
          .where(scoped(orgId, email))
          .limit(1);
        if (!existing) throw new Error('suppression upsert conflicted but no row was found');
        return existing;
      }),

    list: (orgId, limit) =>
      withOrg(db, orgId, (tx) =>
        tx
          .select()
          .from(suppressions)
          .where(eq(suppressions.orgId, orgId))
          .orderBy(desc(suppressions.createdAt))
          .limit(limit),
      ),

    get: (orgId, email) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx.select().from(suppressions).where(scoped(orgId, email)).limit(1);
        return row;
      }),

    upsertMany: (orgId, emails, reason) =>
      withOrg(db, orgId, async (tx) => {
        if (emails.length === 0) return 0;
        const rows = await tx
          .insert(suppressions)
          .values(emails.map((email) => ({ orgId, email, reason })))
          .onConflictDoNothing({ target: [suppressions.orgId, suppressions.email] })
          .returning({ email: suppressions.email });
        return rows.length;
      }),

    remove: (orgId, email) =>
      withOrg(db, orgId, async (tx) => {
        const rows = await tx
          .delete(suppressions)
          .where(scoped(orgId, email))
          .returning({ email: suppressions.email });
        return rows.length > 0;
      }),
  };
}
