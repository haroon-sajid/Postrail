import { type ImportSuppressionsRequest } from '@postrail/shared';
import { type AuthContext } from '../../lib/context';
import { AppError } from '../../lib/errors';
import { type SuppressionRow, type SuppressionStore } from './repo';
import { type CreateSuppressionRequest, type Suppression } from './schemas';

const LIST_LIMIT = 1000;

export interface SuppressionService {
  add: (auth: AuthContext, input: CreateSuppressionRequest) => Promise<Suppression>;
  list: (orgId: string) => Promise<Suppression[]>;
  get: (orgId: string, email: string) => Promise<Suppression>;
  remove: (auth: AuthContext, email: string) => Promise<void>;
  importMany: (
    auth: AuthContext,
    input: ImportSuppressionsRequest,
  ) => Promise<{ added: number; skipped: number }>;
}

export function createSuppressionService(store: SuppressionStore): SuppressionService {
  return {
    async add(auth, input) {
      return toSuppression(await store.upsert(auth.orgId, normalize(input.email), input.reason));
    },

    async list(orgId) {
      return (await store.list(orgId, LIST_LIMIT)).map(toSuppression);
    },

    async get(orgId, email) {
      const row = await store.get(orgId, normalize(email));
      if (!row) throw AppError.notFound('suppression');
      return toSuppression(row);
    },

    async remove(auth, email) {
      if (!(await store.remove(auth.orgId, normalize(email))))
        throw AppError.notFound('suppression');
    },

    async importMany(auth, input) {
      const unique = [...new Set(input.emails.map(normalize))];
      const added = await store.upsertMany(auth.orgId, unique, input.reason);
      return { added, skipped: unique.length - added };
    },
  };
}

export function normalize(email: string): string {
  return email.trim().toLowerCase();
}

function toSuppression(row: SuppressionRow): Suppression {
  return { email: row.email, reason: row.reason, created_at: row.createdAt.toISOString() };
}
