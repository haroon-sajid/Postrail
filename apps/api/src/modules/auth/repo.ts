import {
  authChallenges,
  authIdentities,
  authSessions,
  authSettings,
  authSigningKeys,
  authUsers,
  type Db,
  type OrgDb,
  withOrg,
} from '@postrail/db';
import { type AuthChallengeKind, type AuthProvider, type PublicJwk } from '@postrail/shared';
import {
  and,
  count,
  desc,
  eq,
  getTableColumns,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import { escapeLike, type ListCursor } from '../emails/repo';

export type AuthSettingsRow = typeof authSettings.$inferSelect;
export type AuthUserRow = typeof authUsers.$inferSelect;
export type AuthSessionRow = typeof authSessions.$inferSelect;
export type AuthChallengeRow = typeof authChallenges.$inferSelect;
export type AuthSigningKeyRow = typeof authSigningKeys.$inferSelect;

/** A user who is signing in, and whether this call is what created them. */
export interface ResolvedUser {
  user: AuthUserRow;
  created: boolean;
}

export interface NewSigningKey {
  /** Doubles as the JWT `kid`. */
  id: string;
  publicJwk: PublicJwk;
  privateKeyEnc: string;
}

/** An end user plus the providers linked to them. */
export interface AuthUserView extends AuthUserRow {
  providers: AuthProvider[];
}

export interface AuthSettingsPatch {
  appName?: string | null;
  redirectUrls?: string[];
  googleEnabled?: boolean;
  magicLinkEnabled?: boolean;
  emailOtpEnabled?: boolean;
  googleClientId?: string | null;
  googleClientSecretEnc?: string | null;
  githubEnabled?: boolean;
  githubClientId?: string | null;
  githubClientSecretEnc?: string | null;
  signupsEnabled?: boolean;
  magicLinkTemplate?: string | null;
  otpTemplate?: string | null;
}

export interface IdentityInput {
  provider: AuthProvider;
  providerUserId: string;
  email: string;
  name: string | null;
  image: string | null;
}

export interface NewChallenge {
  /** Chosen by the caller because an emailed code's hash is salted with it. */
  id: string;
  kind: AuthChallengeKind;
  email: string;
  userId: string | null;
  /** Only for `oauth_code`. */
  provider?: AuthProvider;
  tokenHash: string;
  expiresAt: Date;
}

export interface NewSession {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

/** The kinds redeemed by presenting the secret itself, as opposed to guessing a short code. */
const CODE_KINDS: AuthChallengeKind[] = ['magic_link', 'oauth_code'];
const EMAILED_KINDS: AuthChallengeKind[] = ['magic_link', 'email_otp'];

/** Everything the service needs from the database, so it can be tested with a fake. */
export interface AuthStore {
  getSettings: (orgId: string) => Promise<AuthSettingsRow | undefined>;
  /** Creates the org's row on first save. */
  saveSettings: (orgId: string, patch: AuthSettingsPatch) => Promise<AuthSettingsRow>;

  /**
   * The user behind a provider account: matched by the provider's id, then by email, and
   * created when neither exists and `allowCreate` is set. The identity is linked either
   * way. Undefined means there is no such user and creating one is not allowed.
   */
  resolveUserByIdentity: (
    orgId: string,
    input: IdentityInput,
    allowCreate: boolean,
  ) => Promise<ResolvedUser | undefined>;
  /** The same by email alone, marking it verified: the caller proved they can read it. */
  resolveUserByEmail: (
    orgId: string,
    email: string,
    allowCreate: boolean,
  ) => Promise<ResolvedUser | undefined>;
  findUserByEmail: (orgId: string, email: string) => Promise<AuthUserRow | undefined>;
  /** Adds a user by hand. Undefined when the address is already taken. */
  createUser: (
    orgId: string,
    input: { email: string; name: string | null },
  ) => Promise<AuthUserRow | undefined>;
  getUser: (orgId: string, id: string) => Promise<AuthUserView | undefined>;
  /** Newest first. Returns up to `limit` rows strictly after `cursor`. */
  listUsers: (
    orgId: string,
    limit: number,
    cursor?: ListCursor,
    q?: string,
  ) => Promise<AuthUserView[]>;
  /** Takes the user's identities, sessions and pending challenges with it. */
  deleteUser: (orgId: string, id: string) => Promise<boolean>;
  /** Stamps last_sign_in_at. `firstSignIn` is true exactly once per user. */
  recordSignIn: (
    orgId: string,
    userId: string,
    at: Date,
  ) => Promise<{ firstSignIn: boolean } | undefined>;

  createChallenge: (orgId: string, input: NewChallenge) => Promise<void>;
  deleteChallenge: (orgId: string, id: string) => Promise<void>;
  /** Sign-in emails sent to `email` since `since`, used or not. */
  countEmailedSince: (orgId: string, email: string, since: Date) => Promise<number>;
  /**
   * Atomically consumes an unexpired link or OAuth code. Undefined when it is unknown,
   * expired or already used, so a code can never be redeemed twice.
   */
  redeemCode: (
    orgId: string,
    tokenHash: string,
    now: Date,
  ) => Promise<AuthChallengeRow | undefined>;
  /** Retires earlier emailed codes for the address so only the newest one works. */
  supersedeOtps: (orgId: string, email: string, now: Date) => Promise<void>;
  findActiveOtp: (orgId: string, email: string, now: Date) => Promise<AuthChallengeRow | undefined>;
  /** Counts one guess and returns the new total. */
  countOtpAttempt: (orgId: string, id: string) => Promise<number>;
  /** False when someone else consumed it first. */
  consumeChallenge: (orgId: string, id: string, now: Date) => Promise<boolean>;

  createSession: (orgId: string, input: NewSession) => Promise<AuthSessionRow>;
  findSessionByHash: (orgId: string, tokenHash: string) => Promise<AuthSessionRow | undefined>;
  revokeSession: (orgId: string, id: string, at: Date) => Promise<void>;
  /** Returns how many live sessions were ended. */
  revokeUserSessions: (orgId: string, userId: string, at: Date) => Promise<number>;

  /** The key new access tokens are signed with: the newest one. */
  latestSigningKey: (orgId: string) => Promise<AuthSigningKeyRow | undefined>;
  createSigningKey: (orgId: string, input: NewSigningKey) => Promise<AuthSigningKeyRow>;
  /** Every key the org has ever signed with, for the JWKS document. */
  listSigningKeys: (orgId: string) => Promise<AuthSigningKeyRow[]>;
}

/** Provider lists for a page of users, in one query. */
async function providersFor(
  tx: OrgDb,
  orgId: string,
  userIds: string[],
): Promise<Map<string, AuthProvider[]>> {
  const byUser = new Map<string, AuthProvider[]>();
  if (userIds.length === 0) return byUser;
  const rows = await tx
    .select({ userId: authIdentities.userId, provider: authIdentities.provider })
    .from(authIdentities)
    .where(and(eq(authIdentities.orgId, orgId), inArray(authIdentities.userId, userIds)));
  for (const row of rows) {
    const list = byUser.get(row.userId) ?? [];
    if (!list.includes(row.provider)) list.push(row.provider);
    byUser.set(row.userId, list);
  }
  return byUser;
}

/** Applies `patch` to the user with this address, or inserts one when that is allowed. */
async function resolveByEmail(
  tx: OrgDb,
  orgId: string,
  email: string,
  patch: Partial<Pick<AuthUserRow, 'emailVerified' | 'name' | 'image'>>,
  allowCreate: boolean,
): Promise<ResolvedUser | undefined> {
  if (!allowCreate) {
    const [row] = await tx
      .update(authUsers)
      .set(patch)
      .where(and(eq(authUsers.orgId, orgId), eq(authUsers.email, email)))
      .returning();
    return row ? { user: row, created: false } : undefined;
  }
  const [row] = await tx
    .insert(authUsers)
    .values({ orgId, email, ...patch })
    .onConflictDoUpdate({
      target: [authUsers.orgId, authUsers.email],
      set: { ...patch, updatedAt: new Date() },
    })
    // xmax is 0 only on a row this statement inserted; an updated row carries our xid.
    .returning({ ...getTableColumns(authUsers), inserted: sql<boolean>`(xmax = 0)` });
  if (!row) throw new Error('auth user upsert returned no row');
  const { inserted, ...found } = row;
  return { user: found, created: inserted };
}

export function createAuthStore(db: Db): AuthStore {
  const user = (orgId: string, id: string) => and(eq(authUsers.orgId, orgId), eq(authUsers.id, id));
  const challenge = (orgId: string, id: string) =>
    and(eq(authChallenges.orgId, orgId), eq(authChallenges.id, id));

  return {
    getSettings: (orgId) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .select()
          .from(authSettings)
          .where(eq(authSettings.orgId, orgId))
          .limit(1);
        return row;
      }),

    saveSettings: (orgId, patch) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .insert(authSettings)
          .values({ orgId, ...patch })
          .onConflictDoUpdate({
            target: authSettings.orgId,
            set: { ...patch, updatedAt: new Date() },
          })
          .returning();
        if (!row) throw new Error('auth settings upsert returned no row');
        return row;
      }),

    resolveUserByIdentity: (orgId, input, allowCreate) =>
      withOrg(db, orgId, async (tx) => {
        const [linked] = await tx
          .select({ userId: authIdentities.userId })
          .from(authIdentities)
          .where(
            and(
              eq(authIdentities.orgId, orgId),
              eq(authIdentities.provider, input.provider),
              eq(authIdentities.providerUserId, input.providerUserId),
            ),
          )
          .limit(1);
        // The provider's latest name and picture win; a missing one keeps what we had.
        const profile = {
          emailVerified: true,
          ...(input.name ? { name: input.name } : {}),
          ...(input.image ? { image: input.image } : {}),
        };
        if (linked) {
          const [row] = await tx
            .update(authUsers)
            .set(profile)
            .where(user(orgId, linked.userId))
            .returning();
          if (!row) throw new Error('identity points at a missing user');
          return { user: row, created: false };
        }

        const resolved = await resolveByEmail(tx, orgId, input.email, profile, allowCreate);
        if (!resolved) return undefined;
        await tx
          .insert(authIdentities)
          .values({
            orgId,
            userId: resolved.user.id,
            provider: input.provider,
            providerUserId: input.providerUserId,
          })
          .onConflictDoNothing();
        return resolved;
      }),

    resolveUserByEmail: (orgId, email, allowCreate) =>
      withOrg(db, orgId, (tx) =>
        resolveByEmail(tx, orgId, email, { emailVerified: true }, allowCreate),
      ),

    findUserByEmail: (orgId, email) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .select()
          .from(authUsers)
          .where(and(eq(authUsers.orgId, orgId), eq(authUsers.email, email)))
          .limit(1);
        return row;
      }),

    createUser: (orgId, input) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .insert(authUsers)
          .values({ orgId, ...input })
          .onConflictDoNothing({ target: [authUsers.orgId, authUsers.email] })
          .returning();
        return row;
      }),

    getUser: (orgId, id) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx.select().from(authUsers).where(user(orgId, id)).limit(1);
        if (!row) return undefined;
        const providers = await providersFor(tx, orgId, [row.id]);
        return { ...row, providers: providers.get(row.id) ?? [] };
      }),

    listUsers: (orgId, limit, cursor, q) =>
      withOrg(db, orgId, async (tx) => {
        const rows = await tx
          .select()
          .from(authUsers)
          .where(
            and(
              eq(authUsers.orgId, orgId),
              // Keyset on (created_at, id) so the org+created index does all the work.
              cursor
                ? or(
                    lt(authUsers.createdAt, cursor.createdAt),
                    and(eq(authUsers.createdAt, cursor.createdAt), lt(authUsers.id, cursor.id)),
                  )
                : undefined,
              q
                ? or(
                    ilike(authUsers.email, `%${escapeLike(q)}%`),
                    ilike(authUsers.name, `%${escapeLike(q)}%`),
                  )
                : undefined,
            ),
          )
          .orderBy(desc(authUsers.createdAt), desc(authUsers.id))
          .limit(limit);
        const providers = await providersFor(
          tx,
          orgId,
          rows.map((r) => r.id),
        );
        return rows.map((r) => ({ ...r, providers: providers.get(r.id) ?? [] }));
      }),

    deleteUser: (orgId, id) =>
      withOrg(db, orgId, async (tx) => {
        const rows = await tx
          .delete(authUsers)
          .where(user(orgId, id))
          .returning({ id: authUsers.id });
        return rows.length > 0;
      }),

    recordSignIn: (orgId, userId, at) =>
      withOrg(db, orgId, async (tx) => {
        // Row lock: two sign-ins racing must not both see "never signed in before".
        const [before] = await tx
          .select({ lastSignInAt: authUsers.lastSignInAt })
          .from(authUsers)
          .where(user(orgId, userId))
          .for('update');
        if (!before) return undefined;
        await tx.update(authUsers).set({ lastSignInAt: at }).where(user(orgId, userId));
        return { firstSignIn: before.lastSignInAt === null };
      }),

    createChallenge: (orgId, input) =>
      withOrg(db, orgId, async (tx) => {
        await tx.insert(authChallenges).values({ orgId, ...input });
      }),

    deleteChallenge: (orgId, id) =>
      withOrg(db, orgId, async (tx) => {
        await tx.delete(authChallenges).where(challenge(orgId, id));
      }),

    countEmailedSince: (orgId, email, since) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .select({ n: count() })
          .from(authChallenges)
          .where(
            and(
              eq(authChallenges.orgId, orgId),
              eq(authChallenges.email, email),
              inArray(authChallenges.kind, EMAILED_KINDS),
              gte(authChallenges.createdAt, since),
            ),
          );
        return row?.n ?? 0;
      }),

    redeemCode: (orgId, tokenHash, now) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .update(authChallenges)
          .set({ consumedAt: now })
          .where(
            and(
              eq(authChallenges.orgId, orgId),
              eq(authChallenges.tokenHash, tokenHash),
              inArray(authChallenges.kind, CODE_KINDS),
              isNull(authChallenges.consumedAt),
              gt(authChallenges.expiresAt, now),
            ),
          )
          .returning();
        return row;
      }),

    supersedeOtps: (orgId, email, now) =>
      withOrg(db, orgId, async (tx) => {
        await tx
          .update(authChallenges)
          .set({ consumedAt: now })
          .where(
            and(
              eq(authChallenges.orgId, orgId),
              eq(authChallenges.email, email),
              eq(authChallenges.kind, 'email_otp'),
              isNull(authChallenges.consumedAt),
            ),
          );
      }),

    findActiveOtp: (orgId, email, now) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .select()
          .from(authChallenges)
          .where(
            and(
              eq(authChallenges.orgId, orgId),
              eq(authChallenges.email, email),
              eq(authChallenges.kind, 'email_otp'),
              isNull(authChallenges.consumedAt),
              gt(authChallenges.expiresAt, now),
            ),
          )
          .orderBy(desc(authChallenges.createdAt))
          .limit(1);
        return row;
      }),

    countOtpAttempt: (orgId, id) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .update(authChallenges)
          .set({ attempts: sql`${authChallenges.attempts} + 1` })
          .where(challenge(orgId, id))
          .returning({ attempts: authChallenges.attempts });
        return row?.attempts ?? 0;
      }),

    consumeChallenge: (orgId, id, now) =>
      withOrg(db, orgId, async (tx) => {
        const rows = await tx
          .update(authChallenges)
          .set({ consumedAt: now })
          .where(and(challenge(orgId, id), isNull(authChallenges.consumedAt)))
          .returning({ id: authChallenges.id });
        return rows.length > 0;
      }),

    createSession: (orgId, input) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .insert(authSessions)
          .values({ orgId, ...input })
          .returning();
        if (!row) throw new Error('auth session insert returned no row');
        return row;
      }),

    findSessionByHash: (orgId, tokenHash) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .select()
          .from(authSessions)
          .where(and(eq(authSessions.orgId, orgId), eq(authSessions.tokenHash, tokenHash)))
          .limit(1);
        return row;
      }),

    revokeSession: (orgId, id, at) =>
      withOrg(db, orgId, async (tx) => {
        await tx
          .update(authSessions)
          .set({ revokedAt: at })
          .where(
            and(
              eq(authSessions.orgId, orgId),
              eq(authSessions.id, id),
              isNull(authSessions.revokedAt),
            ),
          );
      }),

    revokeUserSessions: (orgId, userId, at) =>
      withOrg(db, orgId, async (tx) => {
        const rows = await tx
          .update(authSessions)
          .set({ revokedAt: at })
          .where(
            and(
              eq(authSessions.orgId, orgId),
              eq(authSessions.userId, userId),
              isNull(authSessions.revokedAt),
              gt(authSessions.expiresAt, at),
            ),
          )
          .returning({ id: authSessions.id });
        return rows.length;
      }),

    latestSigningKey: (orgId) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .select()
          .from(authSigningKeys)
          .where(eq(authSigningKeys.orgId, orgId))
          .orderBy(desc(authSigningKeys.createdAt))
          .limit(1);
        return row;
      }),

    createSigningKey: (orgId, input) =>
      withOrg(db, orgId, async (tx) => {
        const [row] = await tx
          .insert(authSigningKeys)
          .values({ orgId, ...input })
          .returning();
        if (!row) throw new Error('signing key insert returned no row');
        return row;
      }),

    listSigningKeys: (orgId) =>
      withOrg(db, orgId, (tx) =>
        tx
          .select()
          .from(authSigningKeys)
          .where(eq(authSigningKeys.orgId, orgId))
          .orderBy(desc(authSigningKeys.createdAt)),
      ),
  };
}
