/**
 * What to tell the operator when the database is behind the code, or undefined when it
 * is not. Plain text on purpose: this is read by a person in a terminal or a deploy log,
 * at the one moment the usual `{ error }` envelope would only say "Internal server error".
 */
export function describePendingMigrations(pending: string[]): string | undefined {
  if (pending.length === 0) return undefined;
  const count = pending.length === 1 ? '1 migration has' : `${pending.length} migrations have`;
  return [
    `Database is behind the code: ${count} not been applied.`,
    ...pending.map((tag) => `  - ${tag}`),
    'Run `pnpm db:migrate` against this database, then start the API again.',
  ].join('\n');
}
