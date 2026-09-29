import { apiKeys, type Db, users, withOrg, withSystem } from '@postrail/db';
import { and, desc, eq, isNull } from 'drizzle-orm';

export interface ApiKeyRecord {
  id: string;
  orgId: string;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
}

export interface ApiKeyListRow {
  id: string;
  name: string;
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdBy: { id: string; email: string } | null;
}

export interface NewApiKey {
  name: string;
  prefix: string;
  keyHash: string;
  createdBy: string | null;
}

export interface ApiKeyStore {
  findByHash: (keyHash: string) => Promise<ApiKeyRecord | undefined>;
  touchLastUsed: (orgId: string, id: string, at: Date) => Promise<void>;
  create: (orgId: string, input: NewApiKey) => Promise<ApiKeyListRow>;
  list: (orgId: string) => Promise<ApiKeyListRow[]>;
  /** Idempotent: an already revoked key stays revoked. False when the id is unknown. */
  revoke: (orgId: string, id: string, at: Date) => Promise<boolean>;
}

export function createApiKeyStore(db: Db): ApiKeyStore {
  const listColumns = {
    id: apiKeys.id,
    name: apiKeys.name,
    prefix: apiKeys.prefix,
    createdAt: apiKeys.createdAt,
    lastUsedAt: apiKeys.lastUsedAt,
    revokedAt: apiKeys.revokedAt,
    createdById: users.id,
    createdByEmail: users.email,
  };
  const shape = (r: {
    id: string;
    name: string;
    prefix: string;
    createdAt: Date;
    lastUsedAt: Date | null;
    revokedAt: Date | null;
    createdById: string | null;
    createdByEmail: string | null;
  }): ApiKeyListRow => ({
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    createdAt: r.createdAt,
    lastUsedAt: r.lastUsedAt,
    revokedAt: r.revokedAt,
    createdBy:
      r.createdById && r.createdByEmail ? { id: r.createdById, email: r.createdByEmail } : null,
  });

  return {
    // withSystem: the org is not known until the key is found. The hash is a 256-bit
    // secret the caller proved possession of, so this lookup cannot enumerate anything.
    findByHash: (keyHash) =>
      withSystem(db, async (tx) => {
        const [row] = await tx
          .select({
            id: apiKeys.id,
            orgId: apiKeys.orgId,
            revokedAt: apiKeys.revokedAt,
            lastUsedAt: apiKeys.lastUsedAt,
          })
          .from(apiKeys)
          .where(eq(apiKeys.keyHash, keyHash))
          .limit(1);
        return row;
      }),

    touchLastUsed: (orgId, id, at) =>
      withOrg(db, orgId, async (tx) => {
        await tx
          .update(apiKeys)
          .set({ lastUsedAt: at })
          .where(and(eq(apiKeys.orgId, orgId), eq(apiKeys.id, id)));
      }),

    create: (orgId, input) =>
      withOrg(db, orgId, async (tx) => {
        const [inserted] = await tx
          .insert(apiKeys)
          .values({ orgId, ...input })
          .returning({ id: apiKeys.id });
        if (!inserted) throw new Error('api key insert returned no row');
        const [row] = await tx
          .select(listColumns)
          .from(apiKeys)
          .leftJoin(users, eq(users.id, apiKeys.createdBy))
          .where(eq(apiKeys.id, inserted.id))
          .limit(1);
        if (!row) throw new Error('api key vanished after insert');
        return shape(row);
      }),

    list: (orgId) =>
      withOrg(db, orgId, async (tx) => {
        const rows = await tx
          .select(listColumns)
          .from(apiKeys)
          .leftJoin(users, eq(users.id, apiKeys.createdBy))
          .where(eq(apiKeys.orgId, orgId))
          .orderBy(desc(apiKeys.createdAt));
        return rows.map(shape);
      }),

    revoke: (orgId, id, at) =>
      withOrg(db, orgId, async (tx) => {
        const rows = await tx
          .update(apiKeys)
          .set({ revokedAt: at })
          .where(and(eq(apiKeys.orgId, orgId), eq(apiKeys.id, id), isNull(apiKeys.revokedAt)))
          .returning({ id: apiKeys.id });
        if (rows.length > 0) return true;
        const [exists] = await tx
          .select({ id: apiKeys.id })
          .from(apiKeys)
          .where(and(eq(apiKeys.orgId, orgId), eq(apiKeys.id, id)))
          .limit(1);
        return exists !== undefined;
      }),
  };
}
