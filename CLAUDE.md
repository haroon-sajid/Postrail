# Postrail

Multi-tenant email API. Tenants connect their own Gmail or Outlook mailbox and send
application email (confirmations, invites, password resets) through it via a REST API.

Stack: pnpm workspace + Turborepo, TypeScript (strict), Node 22. API is Hono on Node
(`apps/api`), database is Neon Postgres via Drizzle (`packages/db`), shared zod schemas,
types and constants live in `packages/shared`. Hosted on GCP Cloud Run + Cloud Tasks +
Cloud Scheduler, web on Cloudflare Pages. Everything runs on free tiers first.
Decisions are recorded in `docs/adr`; start with `docs/adr/0001-architecture.md`.

## Layout

```
apps/api            Hono HTTP API (Node 22). Bundled with tsup for Cloud Run.
  src/modules/*     feature modules (routes, service, repo, schemas, tests)
  src/providers/*   EmailProvider interface + Google/Microsoft implementations (ADR 0003)
  src/lib/*         cross-cutting: errors, error handler, logger, org context
  src/test/*        fakes and the createTestApp() helper used by api tests
examples/           standalone scripts for integrators (webhook receiver)
apps/web            Frontend, later (Cloudflare Pages).
packages/db         Drizzle schema, migrations (drizzle/), Neon client.
packages/shared     zod schemas, types, constants, typed env loader.
docs/adr            Architecture decision records.
```

## Rules

1. **Feature modules.** Code lives in `apps/api/src/modules/<feature>/` with
   `routes.ts`, `service.ts`, `repo.ts`, `schemas.ts` and `*.test.ts`.
   Routes only parse input and write responses. Services hold the logic. Repos hold the SQL.
   Nothing else touches the database.
2. **Tenant isolation.** Every table has `org_id`. Every query is scoped by org.
   Never trust an id from the request without checking it belongs to the caller's org.
   Repos only ever receive an `OrgDb` from `withOrg(db, orgId, fn)`; Row Level Security
   backs this up at the database (see ADR 0002). The root `Db` handle runs as the Neon
   owner, which bypasses RLS, so it is for migrations, seeds and test setup only.
   `withSystem` is the only bypass and every call site needs a comment saying why. New tenant tables spread `orgScoped`, add
   `tenantPolicy(name)`, call `.enableRLS()`, and get a FORCE line in a custom migration;
   the schema test enforces all but the last.
3. **Validation and errors.** All input is validated with zod schemas from
   `packages/shared`. Public routes are declared with `createRoute` from
   `@hono/zod-openapi` on a router from `lib/router.ts`, so `/openapi.json` is generated,
   never hand-written. Wire shapes are snake_case; code is camelCase. All errors go
   through the single error handler in `apps/api/src/lib/error-handler.ts`, which always
   responds with `{ error: { code, message } }`. Throw `AppError` for expected failures.
   Everything under `/v1` requires `Authorization: Bearer pr_live_...` (see ADR 0004);
   handlers read the org with `getAuth(c)` and never from the request body or query.
4. **Secrets.** Secrets come only from the environment via `getEnv()` in
   `packages/shared`. Never log tokens, API keys, OAuth credentials or email bodies.
   Production secrets live in GCP Secret Manager, never in files.
5. **Migrations.** Change the schema in `packages/db/src/schema`, then run
   `pnpm db:generate` to produce a migration in `packages/db/drizzle`. Never use
   `drizzle-kit push`. Apply with `pnpm db:migrate`.
6. **Tests and ADRs.** Every module ships with tests. Every new feature gets a short ADR
   in `docs/adr` (copy the template in `docs/adr/README.md`).
7. **Style.** Keep functions small. Name things plainly. Comments explain why, not what.
   Prefer boring code.
8. **Delivery is asynchronous.** Request handlers never call a provider. They insert
   and enqueue through the `Queue` interface; the worker in
   `apps/api/src/modules/emails/worker.ts` sends. Worker code must stay idempotent
   (claim first, then act) because tasks are delivered at least once (ADR 0005).
   Routes under `/internal/*` are for Cloud Tasks and Cloud Scheduler only.
9. **Definition of done.** Before finishing any task, these must all pass:
   `pnpm typecheck`, `pnpm lint`, `pnpm test`.

## Commands

```
pnpm dev            run the API in watch mode (Swagger UI at http://localhost:8080/docs)
pnpm build          bundle apps/api into apps/api/dist
pnpm typecheck      tsc --noEmit in every workspace
pnpm lint           eslint + prettier --check
pnpm test           vitest in every workspace
pnpm db:generate    generate a migration from the Drizzle schema
pnpm db:migrate     apply pending migrations to DATABASE_URL
pnpm db:seed        create the demo org and print a raw API key once
WEBHOOK_SECRET=whsec_... node examples/webhook-receiver.mjs   local receiver on :4000
```

## Environment

`.env` at the repo root is for local development only and is git-ignored. It points
`DATABASE_URL` at the Neon dev branch. `.env.example` documents every variable.
`.env.production.example` is a placeholder only; production values go in Secret Manager.
