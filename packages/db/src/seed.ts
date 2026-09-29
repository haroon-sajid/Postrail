import { generateApiKey, getEnv } from '@postrail/shared';
import { eq } from 'drizzle-orm';
import { closeDb, createDb } from './client';
import { apiKeys, orgs } from './schema';
import { withOrg } from './with-org';

const DEMO_ORG_NAME = 'Demo Org';

async function findOrCreateDemoOrg(db: ReturnType<typeof createDb>) {
  const [existing] = await db.select().from(orgs).where(eq(orgs.name, DEMO_ORG_NAME)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(orgs).values({ name: DEMO_ORG_NAME }).returning();
  if (!created) throw new Error('insert returned no row');
  return created;
}

async function main(): Promise<void> {
  const db = createDb(getEnv().DATABASE_URL);
  try {
    const org = await findOrCreateDemoOrg(db);
    const key = generateApiKey();
    await withOrg(db, org.id, (tx) =>
      tx
        .insert(apiKeys)
        .values({ orgId: org.id, name: 'seed', prefix: key.prefix, keyHash: key.hash }),
    );
    // The raw key exists only in this output. Only the hash is stored.
    process.stdout.write(
      [
        `Demo org: ${org.name}`,
        `ORG_ID=${org.id}`,
        `API_KEY=${key.raw}`,
        '',
        'The key is shown once. Use it as: Authorization: Bearer <API_KEY>',
        '',
      ].join('\n'),
    );
  } finally {
    await closeDb(db);
  }
}

main().catch((error: unknown) => {
  // Drizzle wraps driver errors; the useful part (DNS, auth, RLS) is in `cause`.
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : '';
  console.error(error instanceof Error ? error.message : String(error), cause);
  process.exit(1);
});
