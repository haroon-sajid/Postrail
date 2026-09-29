import { type ExtractTablesWithRelations } from 'drizzle-orm';
import { type PgTransaction } from 'drizzle-orm/pg-core';
import { drizzle, type PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * postgres.js over the pooled Neon URL. A real TCP connection (unlike the HTTP driver) is
 * what makes transactions, and therefore `withOrg`, work. `prepare: false` because Neon's
 * pooler runs PgBouncer in transaction mode, which cannot track prepared statements.
 */
export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl, { prepare: false, max: 5 });
  return drizzle({ client, schema });
}

export type Db = ReturnType<typeof createDb>;

/** What repos receive: a transaction with `app.org_id` (or the system bypass) already set. */
export type OrgDb = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export async function closeDb(db: Db): Promise<void> {
  await db.$client.end();
}
