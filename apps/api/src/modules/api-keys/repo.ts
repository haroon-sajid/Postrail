import { apiKeys, type Db, withOrg, withSystem } from '@postrail/db';
import { and, eq } from 'drizzle-orm';

export interface ApiKeyRecord {
  id: string;
  orgId: string;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
}

export interface ApiKeyStore {
  findByHash: (keyHash: string) => Promise<ApiKeyRecord | undefined>;
  touchLastUsed: (orgId: string, id: string, at: Date) => Promise<void>;
}

export function createApiKeyStore(db: Db): ApiKeyStore {
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
  };
}
