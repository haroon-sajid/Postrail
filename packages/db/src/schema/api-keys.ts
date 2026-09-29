import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { orgScoped, tenantPolicy } from './tenancy';
import { timestamps } from './timestamps';

/** The raw key is never stored. Lookups hash the presented key and match `key_hash`. */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...orgScoped,
    name: text('name').notNull(),
    prefix: text('prefix').notNull(),
    keyHash: text('key_hash').notNull().unique(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('api_keys_org_id_idx').on(t.orgId), tenantPolicy('api_keys')],
).enableRLS();
