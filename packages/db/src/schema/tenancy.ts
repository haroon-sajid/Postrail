import { sql } from 'drizzle-orm';
import { pgPolicy, uuid } from 'drizzle-orm/pg-core';
import { orgs } from './orgs';

/** Transaction-local setting that `withOrg` sets and every policy reads. */
export const ORG_ID_SETTING = 'app.org_id';

/**
 * Transaction-local setting that `withSystem` sets for the few cross-tenant paths
 * (API-key lookup before the org is known, scheduled jobs). Explicit and greppable.
 */
export const BYPASS_RLS_SETTING = 'app.bypass_rls';

/**
 * Role that `withOrg` and `withSystem` switch to for the transaction. It owns nothing and
 * has no BYPASSRLS, so policies apply to it. The connecting Neon role has BYPASSRLS set
 * directly, which no policy or FORCE flag can override. Created in migration 0002.
 */
export const APP_ROLE = 'postrail_app';

// `true` = missing_ok, so an unset setting yields NULL and therefore matches nothing.
// nullif guards against '' which would fail the uuid cast instead of returning no rows.
const currentOrgId = sql.raw(`nullif(current_setting('${ORG_ID_SETTING}', true), '')::uuid`);
const isSystem = sql.raw(`current_setting('${BYPASS_RLS_SETTING}', true) = 'on'`);

/**
 * Spread into every tenant-owned table. `org_id` is the isolation boundary: repos must
 * filter on it in every query, and the schema test fails if a table forgets it.
 */
export const orgScoped = {
  orgId: uuid('org_id')
    .notNull()
    .references(() => orgs.id, { onDelete: 'cascade' }),
};

/**
 * Row Level Security policy for a tenant table: rows are visible and writable only when
 * `app.org_id` matches, or when the system bypass is on. Tables also get
 * FORCE ROW LEVEL SECURITY in a custom migration so the owning role is not exempt.
 */
export function tenantPolicy(table: string) {
  const predicate = sql`org_id = ${currentOrgId} or ${isSystem}`;
  return pgPolicy(`${table}_tenant_isolation`, {
    as: 'permissive',
    for: 'all',
    to: 'public',
    using: predicate,
    withCheck: predicate,
  });
}
