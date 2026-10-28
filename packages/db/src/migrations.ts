import { sql } from 'drizzle-orm';
import journal from '../drizzle/meta/_journal.json';
import { type Db } from './client';

interface JournalEntry {
  tag: string;
  /** When the migration was generated, in ms. drizzle-kit records it as `created_at`. */
  when: number;
}

/**
 * Migrations newer than the last one the database recorded, oldest first. The same rule
 * drizzle-kit's own migrator uses to decide what to run. `lastApplied` is null for a
 * database that has never been migrated.
 */
export function pendingAfter(entries: JournalEntry[], lastApplied: number | null): string[] {
  return entries.filter((e) => lastApplied === null || e.when > lastApplied).map((e) => e.tag);
}

/**
 * Tags of the migrations in this build that the database has not had yet. Code that runs
 * against an older schema fails query by query with nothing pointing at the cause, so
 * the API asks this once at startup instead.
 */
export async function pendingMigrations(db: Db): Promise<string[]> {
  const [table] = await db.execute<{ present: boolean }>(
    sql`select to_regclass('drizzle.__drizzle_migrations') is not null as present`,
  );
  if (!table?.present) return pendingAfter(journal.entries, null);
  // bigint comes back as a string.
  const [row] = await db.execute<{ last: string | null }>(
    sql`select max(created_at) as last from drizzle.__drizzle_migrations`,
  );
  return pendingAfter(journal.entries, row?.last == null ? null : Number(row.last));
}
