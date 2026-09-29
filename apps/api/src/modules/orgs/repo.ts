import { type Db, invites, members, orgs, users, withOrg, withSystem } from '@postrail/db';
import { type MemberRole } from '@postrail/shared';
import { and, asc, desc, eq, gt, isNull } from 'drizzle-orm';

export type OrgRow = typeof orgs.$inferSelect;
export type InviteRow = typeof invites.$inferSelect;

export interface OrgMembership {
  org: OrgRow;
  role: MemberRole;
}

export interface MemberWithUser {
  userId: string;
  email: string;
  name: string;
  role: MemberRole;
  joinedAt: Date;
}

export interface NewInvite {
  email: string;
  role: MemberRole;
  tokenHash: string;
  invitedBy: string;
  expiresAt: Date;
}

export interface OrgStore {
  /** The org row plus the first owner, in one transaction. */
  createOrgWithOwner: (userId: string, name: string) => Promise<OrgRow>;
  getOrg: (orgId: string) => Promise<OrgRow | undefined>;
  updateOrg: (orgId: string, patch: { name: string }) => Promise<OrgRow | undefined>;
  /** Cascades through every tenant table. */
  deleteOrg: (orgId: string) => Promise<boolean>;
  listForUser: (userId: string) => Promise<OrgMembership[]>;
  getMembership: (userId: string, orgId: string) => Promise<{ role: MemberRole } | undefined>;
  listMembers: (orgId: string) => Promise<MemberWithUser[]>;
  countOwners: (orgId: string) => Promise<number>;
  updateMemberRole: (orgId: string, userId: string, role: MemberRole) => Promise<boolean>;
  removeMember: (orgId: string, userId: string) => Promise<boolean>;
  createInvite: (orgId: string, input: NewInvite) => Promise<InviteRow>;
  listPendingInvites: (orgId: string, now: Date) => Promise<InviteRow[]>;
  deleteInvite: (orgId: string, id: string) => Promise<boolean>;
  /** The org is unknown until the token is matched, hence system scope. */
  findInviteByTokenHash: (
    tokenHash: string,
  ) => Promise<(InviteRow & { orgName: string }) | undefined>;
  /** Marks the invite accepted and upserts the membership. */
  acceptInvite: (
    orgId: string,
    inviteId: string,
    userId: string,
    role: MemberRole,
    now: Date,
  ) => Promise<void>;
}

export function createOrgStore(db: Db): OrgStore {
  return {
    createOrgWithOwner: async (userId, name) => {
      // orgs has no RLS (it is the tenant root); the membership needs the org context.
      const [org] = await db.insert(orgs).values({ name }).returning();
      if (!org) throw new Error('org insert returned no row');
      await withOrg(db, org.id, async (tx) => {
        await tx.insert(members).values({ orgId: org.id, userId, role: 'owner' });
      });
      return org;
    },

    getOrg: async (orgId) => {
      const [row] = await db.select().from(orgs).where(eq(orgs.id, orgId)).limit(1);
      return row;
    },

    updateOrg: async (orgId, patch) => {
      const [row] = await db
        .update(orgs)
        .set({ name: patch.name, updatedAt: new Date() })
        .where(eq(orgs.id, orgId))
        .returning();
      return row;
    },

    deleteOrg: async (orgId) => {
      const rows = await db.delete(orgs).where(eq(orgs.id, orgId)).returning({ id: orgs.id });
      return rows.length > 0;
    },

    // withSystem: spans every org the user belongs to.
    listForUser: (userId) =>
      withSystem(db, async (tx) => {
        const rows = await tx
          .select({ org: orgs, role: members.role })
          .from(members)
          .innerJoin(orgs, eq(orgs.id, members.orgId))
          .where(eq(members.userId, userId))
          .orderBy(asc(orgs.createdAt));
        return rows;
      }),

    getMembership: (userId, orgId) =>
      withSystem(db, async (tx) => {
        const [row] = await tx
          .select({ role: members.role })
          .from(members)
          .where(and(eq(members.orgId, orgId), eq(members.userId, userId)))
          .limit(1);
        return row;
      }),

    listMembers: (orgId) =>
      withOrg(db, orgId, (tx) =>
        tx
          .select({
            userId: members.userId,
            email: users.email,
            name: users.name,
            role: members.role,
            joinedAt: members.createdAt,
          })
          .from(members)
          .innerJoin(users, eq(users.id, members.userId))
          .where(eq(members.orgId, orgId))
          .orderBy(asc(members.createdAt)),
      ),

    countOwners: (orgId) =>
      withOrg(db, orgId, async (tx) => {
        const rows = await tx
          .select({ userId: members.userId })
          .from(members)
          .where(and(eq(members.orgId, orgId), eq(members.role, 'owner')));
        return rows.length;
      }),

    updateMemberRole: (orgId, userId, role) =>
      withOrg(db, orgId, async (tx) => {
        const rows = await tx
          .update(members)
          .set({ role, updatedAt: new Date() })
          .where(and(eq(members.orgId, orgId), eq(members.userId, userId)))
          .returning({ id: members.id });
        return rows.length > 0;
      }),

    removeMember: (orgId, userId) =>
      withOrg(db, orgId, async (tx) => {
        const rows = await tx
          .delete(members)
          .where(and(eq(members.orgId, orgId), eq(members.userId, userId)))
          .returning({ id: members.id });
        return rows.length > 0;
      }),

    createInvite: (orgId, input) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .insert(invites)
          .values({ orgId, ...input })
          .returning();
        if (!row) throw new Error('invite insert returned no row');
        return row;
      }),

    listPendingInvites: (orgId, now) =>
      withOrg(db, orgId, (tx) =>
        tx
          .select()
          .from(invites)
          .where(
            and(eq(invites.orgId, orgId), isNull(invites.acceptedAt), gt(invites.expiresAt, now)),
          )
          .orderBy(desc(invites.createdAt)),
      ),

    deleteInvite: (orgId, id) =>
      withOrg(db, orgId, async (tx) => {
        const rows = await tx
          .delete(invites)
          .where(and(eq(invites.orgId, orgId), eq(invites.id, id)))
          .returning({ id: invites.id });
        return rows.length > 0;
      }),

    findInviteByTokenHash: (tokenHash) =>
      withSystem(db, async (tx) => {
        const [row] = await tx
          .select({ invite: invites, orgName: orgs.name })
          .from(invites)
          .innerJoin(orgs, eq(orgs.id, invites.orgId))
          .where(eq(invites.tokenHash, tokenHash))
          .limit(1);
        return row ? { ...row.invite, orgName: row.orgName } : undefined;
      }),

    acceptInvite: (orgId, inviteId, userId, role, now) =>
      withOrg(db, orgId, async (tx) => {
        await tx.update(invites).set({ acceptedAt: now }).where(eq(invites.id, inviteId));
        await tx
          .insert(members)
          .values({ orgId, userId, role })
          .onConflictDoUpdate({
            target: [members.orgId, members.userId],
            set: { role, updatedAt: now },
          });
      }),
  };
}
