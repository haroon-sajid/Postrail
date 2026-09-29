# 0002. Tenancy and Row Level Security

Date: 2026-09-29
Status: Accepted. Amends the database driver paragraph of [0001](./0001-architecture.md).

## Context

Every tenant's data, including their mailbox OAuth tokens, lives in one Postgres
database. ADR 0001 made `org_id` on every table and org-scoped queries a code rule,
backed by a schema test. A rule that lives only in code fails the first time someone
forgets a `WHERE org_id = ...`. We want the database to refuse cross-tenant reads and
writes even when the application code is wrong.

## Decision

**Every tenant table has `org_id`, an index led by `org_id`, and a Row Level Security
policy.** `orgs` and `users` are the only tables without one: an org is the tenant, and a
user can belong to several orgs through `members`.

**The policy reads a transaction-local setting.** Each tenant table gets one permissive
policy for all commands:

```sql
USING (org_id = nullif(current_setting('app.org_id', true), '')::uuid
       OR current_setting('app.bypass_rls', true) = 'on')
WITH CHECK (same expression)
```

When `app.org_id` is unset the expression is NULL, which means no rows. The default is
"see nothing", not "see everything".

**`withOrg(db, orgId, fn)` is the only way repos touch tenant tables.** It opens a
transaction, runs `SET LOCAL ROLE postrail_app`, then
`set_config('app.org_id', orgId, true)` (local to the transaction), and passes the
transaction to `fn`. Both the role and the setting disappear with the transaction, so a
pooled connection reused by the next request starts clean. `withOrg` rejects non-UUID ids
before touching the database.

**A dedicated `postrail_app` role is what RLS applies to.** Neon's owner role
(`neondb_owner`) has the BYPASSRLS attribute set directly, and Postgres exempts such
roles from every policy; FORCE ROW LEVEL SECURITY does not change that. So the app never
queries tenant tables as the connecting role. Migration `0002_app_role.sql` creates
`postrail_app` (NOLOGIN, no BYPASSRLS, owns nothing), grants it to the connecting role so
`SET ROLE` is allowed, and grants it DML on all current and future tables in `public`.
The root `Db` handle therefore bypasses RLS and is reserved for migrations, seeds and
test setup. Repos only ever see the transaction from `withOrg` or `withSystem`.

**`withSystem(db, fn)` is the explicit, greppable escape hatch.** It sets
`app.bypass_rls = 'on'` for one transaction. It exists for the two paths that cannot run
inside an org: looking up an API key by hash before the org is known, and scheduled jobs
that span tenants (daily counter resets, retry sweeps). Its bodies must stay tiny and must
never take ids from a request without checking them.

**FORCE ROW LEVEL SECURITY on every tenant table as well.** Postgres also exempts the
table owner from policies unless RLS is forced. `postrail_app` owns nothing, so this is
belt and braces for a future where the app connects as a role that does. Drizzle cannot
express FORCE, so it lives in the custom migration `0001_force_rls.sql`. New tenant
tables need a FORCE line in a new custom migration.

**Driver: postgres.js over the pooled Neon URL.** ADR 0001 chose Neon's HTTP driver. RLS
via `set_config` needs a real transaction on a real connection, which the HTTP driver
cannot give us. postgres.js with `prepare: false` works with Neon's PgBouncer in
transaction mode. The pool is kept small (5) because Cloud Run instances are many and
Neon's free tier connection budget is not.

**Tests prove it.** `packages/db/src/with-org.test.ts` runs against the configured
database: rows inserted under org A are invisible to org B, invisible to the app role
with no org set, cannot be inserted on B's behalf, and cross-org updates and deletes
affect zero rows. One test pins the fact that the connecting role bypasses RLS, so a
change in Neon's role setup surfaces as a test failure rather than a silent shift. The schema test checks every tenant table for `org_id`, an
org-led index, RLS enabled and a policy, so a new table cannot ship without them.

## Consequences

- Forgetting the org filter in a repo now returns no rows instead of another tenant's
  rows. Still filter explicitly: it is clearer and lets Postgres use the org index.
- Every repo function takes an `OrgDb` (the transaction), never the root `Db`. The root
  handle bypasses RLS entirely.
- Local Postgres or CI databases get the same role via the migration; the only Neon
  specific step is a conditional `SET ROLE neon_superuser` to obtain CREATEROLE.
- `withSystem` is a review hotspot. Any new call site needs a reason in a comment.
- Adding a tenant table means: spread `orgScoped`, add `tenantPolicy(name)`, call
  `.enableRLS()`, and append a FORCE line to a new custom migration.
- The integration test needs a migrated database and skips with a warning when
  `DATABASE_URL` is unset. CI must provide a database or the guarantee is untested there.
- RLS runs the policy expression for every row scanned. The org-led indexes keep that
  cheap; watch it if a table ever gets a query pattern that cannot use them.
