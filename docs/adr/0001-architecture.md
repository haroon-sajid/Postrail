# 0001. Architecture and stack

Date: 2026-09-29
Status: Accepted

## Context

Postrail is a multi-tenant email API. Tenants connect their own Gmail or Outlook mailbox
and send application email (confirmations, invites, password resets) through it via REST.
The product must launch on free tiers, be cheap to keep alive with no traffic, and be
safe to grow: tenant data must never leak across organisations, and mailbox credentials
must never leak at all.

## Decision

**Monorepo.** pnpm workspaces with Turborepo for task orchestration and caching.
`apps/api` (HTTP API), `apps/web` (later), `packages/db` (schema, migrations, client),
`packages/shared` (zod schemas, types, constants, env loader), `docs/adr`.

**Language and runtime.** TypeScript in strict mode on Node 22. One shared
`tsconfig.base.json`; ESLint (typed rules) and Prettier for consistency; vitest for tests.

**API framework: Hono.** Small, standards-based (Request/Response), first-class zod
integration, trivially testable via `app.request()`. Runs on Node today and could move to
Cloudflare Workers later without a rewrite.

**Database: Neon Postgres via Drizzle.** Neon's free tier covers development and early
production, and branches give us an isolated dev database for free. Drizzle keeps the
schema in TypeScript and generates plain SQL migrations we can read and review. We use
the HTTP driver: no connection pool to keep warm, which suits Cloud Run's scale-to-zero.
Migrations are generated with `drizzle-kit generate` and applied with `drizzle-kit migrate`.
`drizzle-kit push` is banned because it bypasses review.

**Tenancy: `org_id` on every table.** Row-level isolation is enforced in code: every table
except `orgs` carries `org_id`, every query filters by it, and ids from the request are
only trusted after the org check. A schema test fails the build if a table lacks the
column. This is simpler and cheaper than Postgres RLS for now and keeps the door open to
add RLS later as defence in depth.

**Hosting: GCP Cloud Run + Cloud Tasks + Cloud Scheduler.** Cloud Run scales to zero,
so an idle API costs nothing. Cloud Tasks gives durable, retried, rate-limited delivery
for sending email without running our own queue; Cloud Scheduler covers periodic jobs
(token refresh, cleanup). All three have free monthly quotas that comfortably cover
launch traffic. The web app goes to Cloudflare Pages, which is free and global.

**Configuration.** All configuration comes from environment variables, validated once at
startup by a zod schema in `packages/shared`. Missing or malformed values abort the
process with the variable names (never values). Locally, `.env` at the repo root holds
the Neon dev branch URL. Production secrets live only in GCP Secret Manager and are
injected into Cloud Run.

**Errors.** Every error response has the shape `{ error: { code, message } }` with a
fixed set of codes. One error handler produces it; services throw `AppError`.

**Build.** Workspace packages export TypeScript source ("just-in-time" packages), so
there is no build step for `packages/*` and no ordering problem for typecheck or tests.
`apps/api` is bundled by tsup into a single ESM file for Cloud Run; workspace and
third-party dependencies are inlined so the container needs no `node_modules`.

## Consequences

- One repo, one lockfile, one set of tooling. Turborepo caches typecheck and tests.
- Tenant isolation is a code discipline backed by a test, not a database guarantee.
  Reviewers must check org scoping in every repo function.
- The Neon HTTP driver has no transactions across statements in the same way a pooled
  connection does. When we need multi-statement transactions we switch that path to the
  WebSocket driver.
- Bundling everything into the API means a dependency that cannot be bundled (native
  addons) must be added to tsup `external` and installed in the runtime image.
- Free tiers cap throughput. The design (queues, scale-to-zero, HTTP driver) is chosen so
  that moving to paid tiers is a billing change, not an architecture change.
