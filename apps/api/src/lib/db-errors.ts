/** Postgres unique_violation, surfaced through Drizzle's error wrapper. */
export function isUniqueViolation(error: unknown): boolean {
  const cause =
    error instanceof Error ? (error.cause as { code?: unknown } | undefined) : undefined;
  return cause?.code === '23505';
}
