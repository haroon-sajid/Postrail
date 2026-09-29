import { hashApiKey } from '@postrail/shared';
import { type AuthContext } from '../../lib/context';
import { AppError } from '../../lib/errors';
import { type ApiKeyStore } from './repo';

/** `last_used_at` is informational; one write per key per minute is plenty. */
export const LAST_USED_THROTTLE_MS = 60_000;

export interface ApiKeyServiceDeps {
  store: ApiKeyStore;
  now?: () => Date;
}

export interface ApiKeyService {
  /** Turns an Authorization header into an org, or throws 401. Never leaks why. */
  authenticate: (authorization: string | undefined) => Promise<AuthContext>;
}

export function createApiKeyService({ store, now = () => new Date() }: ApiKeyServiceDeps) {
  const service: ApiKeyService = {
    async authenticate(authorization) {
      const raw = parseBearer(authorization);
      if (!raw) throw AppError.unauthorized('missing bearer api key');

      const record = await store.findByHash(hashApiKey(raw));
      // Same message for unknown and revoked so a probe learns nothing.
      if (!record || record.revokedAt) throw AppError.unauthorized('invalid api key');

      const at = now();
      const stale =
        !record.lastUsedAt || at.getTime() - record.lastUsedAt.getTime() >= LAST_USED_THROTTLE_MS;
      if (stale) await store.touchLastUsed(record.orgId, record.id, at);

      return { orgId: record.orgId, apiKeyId: record.id };
    },
  };
  return service;
}

function parseBearer(header: string | undefined): string | undefined {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  const token = match?.[1];
  return token?.startsWith('pr_') ? token : undefined;
}
