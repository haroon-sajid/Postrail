import { sql } from 'drizzle-orm';
import { type Db, type OrgDb } from './client';
import { APP_ROLE, BYPASS_RLS_SETTING, ORG_ID_SETTING } from './schema/tenancy';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Drops to the app role for the rest of the transaction. Everything before this line runs
 * as the connecting (owner) role, which Postgres exempts from Row Level Security.
 */
async function assumeAppRole(tx: OrgDb): Promise<void> {
  await tx.execute(sql.raw(`set local role ${APP_ROLE}`));
}

/**
 * Runs `fn` in a transaction where Row Level Security only exposes `orgId`'s rows.
 * Every repo call that touches a tenant table goes through here.
 */
export async function withOrg<T>(db: Db, orgId: string, fn: (tx: OrgDb) => Promise<T>): Promise<T> {
  if (!UUID_RE.test(orgId)) {
    throw new Error('withOrg: orgId must be a UUID');
  }
  return db.transaction(async (tx) => {
    await assumeAppRole(tx);
    // is_local = true: the setting dies with the transaction, which matters on a pooled
    // connection that the next request will reuse.
    await tx.execute(sql`select set_config(${ORG_ID_SETTING}, ${orgId}, true)`);
    return fn(tx);
  });
}

/**
 * Runs `fn` with tenant isolation switched off. Only for paths that cannot know the org
 * yet (API-key lookup) or that legitimately span tenants (scheduled jobs). Keep the body
 * tiny and never let request-controlled ids flow into it unchecked.
 */
export async function withSystem<T>(db: Db, fn: (tx: OrgDb) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await assumeAppRole(tx);
    await tx.execute(sql`select set_config(${BYPASS_RLS_SETTING}, 'on', true)`);
    return fn(tx);
  });
}
