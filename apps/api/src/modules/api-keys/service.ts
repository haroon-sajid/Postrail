import { type ApiKey, type ApiKeyCreated, generateApiKey, hashApiKey } from '@postrail/shared';
import { type AuthContext, requireRole } from '../../lib/context';
import { AppError } from '../../lib/errors';
import { type AuditStore } from '../audit/repo';
import { type ApiKeyListRow, type ApiKeyStore } from './repo';

/** `last_used_at` is informational; one write per key per minute is plenty. */
export const LAST_USED_THROTTLE_MS = 60_000;

export interface ApiKeyServiceDeps {
  store: ApiKeyStore;
  audit?: AuditStore;
  now?: () => Date;
}

export interface ApiKeyService {
  /** Turns an Authorization header into an org, or throws 401. Never leaks why. */
  authenticate: (authorization: string | undefined) => Promise<AuthContext>;
  create: (auth: AuthContext, name: string) => Promise<ApiKeyCreated>;
  list: (auth: AuthContext) => Promise<ApiKey[]>;
  revoke: (auth: AuthContext, id: string) => Promise<void>;
}

export function createApiKeyService({ store, audit, now = () => new Date() }: ApiKeyServiceDeps) {
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

      return { orgId: record.orgId, actor: `api-key:${record.id}`, apiKeyId: record.id };
    },

    async create(auth, name) {
      requireRole(auth, 'admin');
      const key = generateApiKey();
      const row = await store.create(auth.orgId, {
        name,
        prefix: key.prefix,
        keyHash: key.hash,
        createdBy: auth.userId ?? null,
      });
      await audit?.record(auth.orgId, {
        actor: auth.actor,
        action: 'api_key.created',
        target: row.id,
        meta: { name, prefix: key.prefix },
      });
      return { ...toApiKey(row), key: key.raw };
    },

    async list(auth) {
      return (await store.list(auth.orgId)).map(toApiKey);
    },

    async revoke(auth, id) {
      requireRole(auth, 'admin');
      if (!(await store.revoke(auth.orgId, id, now()))) throw AppError.notFound('api key');
      await audit?.record(auth.orgId, { actor: auth.actor, action: 'api_key.revoked', target: id });
    },
  };
  return service;
}

function parseBearer(header: string | undefined): string | undefined {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  const token = match?.[1];
  return token?.startsWith('pr_') ? token : undefined;
}

function toApiKey(row: ApiKeyListRow): ApiKey {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    created_at: row.createdAt.toISOString(),
    last_used_at: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    revoked_at: row.revokedAt ? row.revokedAt.toISOString() : null,
    created_by: row.createdBy,
  };
}
