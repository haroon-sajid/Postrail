import { loadDotenv } from '@postrail/shared';
import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, createDb, type Db } from './client';
import { APP_ROLE, orgs, templates } from './schema';
import { withOrg, withSystem } from './with-org';

loadDotenv();
const databaseUrl = process.env.DATABASE_URL;

// Integration test: needs a migrated database. Skipped, loudly, when none is configured.
if (!databaseUrl) {
  console.error('with-org.test.ts: DATABASE_URL not set, skipping RLS isolation tests');
}

// Each case makes several round trips to Neon; 20s keeps a slow link from failing the gate.
const NETWORK_TIMEOUT_MS = 20_000;

describe.runIf(databaseUrl)('withOrg isolation', { timeout: NETWORK_TIMEOUT_MS }, () => {
  let db: Db;
  let orgA: string;
  let orgB: string;
  const slug = `rls-probe-${Date.now()}`;

  beforeAll(async () => {
    db = createDb(databaseUrl ?? '');
    const created = await db
      .insert(orgs)
      .values([{ name: `test-org-a-${slug}` }, { name: `test-org-b-${slug}` }])
      .returning({ id: orgs.id });
    [orgA, orgB] = [created[0]?.id ?? '', created[1]?.id ?? ''];

    await withOrg(db, orgA, (tx) =>
      tx.insert(templates).values({ orgId: orgA, slug, subject: 'hi', html: '<p>hi</p>' }),
    );
  }, NETWORK_TIMEOUT_MS);

  afterAll(async () => {
    // Cascades through every tenant table, and orgs itself has no RLS.
    await db.delete(orgs).where(inArray(orgs.id, [orgA, orgB]));
    await closeDb(db);
  }, NETWORK_TIMEOUT_MS);

  const selectProbe = (tx: Parameters<Parameters<typeof withOrg>[2]>[0]) =>
    tx.select({ orgId: templates.orgId }).from(templates).where(eq(templates.slug, slug));

  it('shows org A its own rows', async () => {
    const rows = await withOrg(db, orgA, selectProbe);
    expect(rows).toEqual([{ orgId: orgA }]);
  });

  it('hides org A rows from org B', async () => {
    const rows = await withOrg(db, orgB, selectProbe);
    expect(rows).toEqual([]);
  });

  it('hides everything from the app role when no org context is set', async () => {
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`set local role ${APP_ROLE}`));
      return tx.select({ orgId: templates.orgId }).from(templates).where(eq(templates.slug, slug));
    });
    expect(rows).toEqual([]);
  });

  it('documents that the connecting role bypasses RLS, so repos must never use it', async () => {
    // Neon's owner role carries BYPASSRLS. This is why withOrg switches roles; if this
    // assertion ever flips, the role setup changed and ADR 0002 needs revisiting.
    const rows = await db
      .select({ orgId: templates.orgId })
      .from(templates)
      .where(eq(templates.slug, slug));
    expect(rows).toEqual([{ orgId: orgA }]);
  });

  it('refuses to insert a row for another org', async () => {
    const failure: unknown = await withOrg(db, orgB, (tx) =>
      tx.insert(templates).values({ orgId: orgA, slug: `${slug}-b`, subject: 'x', html: 'x' }),
    ).then(
      () => undefined,
      (error: unknown) => error,
    );
    // Drizzle wraps driver errors; the Postgres message lives in `cause`.
    const cause = failure instanceof Error ? failure.cause : undefined;
    expect(cause).toBeInstanceOf(Error);
    expect((cause as Error).message).toMatch(/row-level security/);
  });

  it('turns cross-org updates and deletes into no-ops', async () => {
    const updated = await withOrg(db, orgB, (tx) =>
      tx.update(templates).set({ subject: 'hacked' }).where(eq(templates.slug, slug)).returning(),
    );
    expect(updated).toEqual([]);

    const deleted = await withOrg(db, orgB, (tx) =>
      tx.delete(templates).where(eq(templates.slug, slug)).returning(),
    );
    expect(deleted).toEqual([]);

    const still = await withOrg(db, orgA, selectProbe);
    expect(still).toHaveLength(1);
  });

  it('does not leak the org setting or role to later transactions', async () => {
    await withOrg(db, orgA, async (tx) => {
      await tx.select({ orgId: templates.orgId }).from(templates).limit(1);
    });
    const [state] = await db.execute<{ org: string | null; role: string }>(
      sql`select current_setting('app.org_id', true) as org, current_user as role`,
    );
    // A placeholder GUC that was once set locally reads back as '' afterwards, not NULL.
    // That is why the policy wraps it in nullif(); either value must match no org.
    expect(state?.org ?? '').toBe('');
    expect(state?.role).not.toBe(APP_ROLE);
  });

  it('withSystem sees across tenants', async () => {
    const rows = await withSystem(db, selectProbe);
    expect(rows).toEqual([{ orgId: orgA }]);
  });

  it('rejects a non-uuid org id before touching the database', async () => {
    await expect(withOrg(db, 'not-a-uuid', selectProbe)).rejects.toThrow(/UUID/);
  });
});
