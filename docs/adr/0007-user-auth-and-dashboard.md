# 0007. User authentication and the dashboard

Date: 2026-09-29
Status: Accepted (amends 0005: message bodies are now retained)

## Context

Until now the only principal was an API key minted by the seed script, and the only way to
connect a mailbox was a public `/api/google/connect` link. Tenants need to sign in, own an
organisation, invite colleagues, and manage mailboxes, keys, templates, webhooks and
suppressions from a browser. The API must stay usable from servers with a bearer key,
and the dashboard must not become a second copy of the business logic.

## Decision

### Sessions come from Better Auth, everything else stays ours

`apps/api/src/lib/auth-server.ts` configures Better Auth 1.7 with two sign-in methods:
Google OAuth and a magic link. The magic link is delivered through Postrail's own system
mailbox (`SYSTEM_MAILBOX_EMAIL`, an ordinary connected Gmail mailbox in the system org),
so the product uses its own send path. Better Auth owns the `users`, `sessions`,
`accounts` and `verifications` tables via the Drizzle adapter with uuid ids; the handler
is mounted at `/api/auth/*` and nothing else touches those tables.

Sessions are cookies: `httpOnly`, `sameSite=lax`, `secure` in production, seven days with
daily refresh. The API never issues a session token to JavaScript.

A `databaseHooks.user.create.after` hook creates the user's default org and owner
membership on first sign-in, named from the email (the domain for work addresses, the
local part for personal ones).

### Two principals, one auth context

Every request under `/v1` or `/app` ends up with an `AuthContext { orgId, actor, role?,
userId?, apiKeyId? }`. `/v1/*` requires an API key and acts for that key's org. `/app/*`
requires a session; `/app/orgs/{orgId}/*` additionally requires membership, and
`requireOrgMember` answers 404 to non-members so org ids do not leak. Resource routes are
declared once and mounted twice (`V1_BASE` and `APP_BASE`), so the dashboard and the API
run the same handlers and the same services.

Roles are `owner > admin > member`. `requireRole(auth, min)` guards creating and revoking
API keys, adding and removing mailboxes, webhooks, invites, member roles and org
settings; only owners delete the org or grant the owner role, and an org keeps at least
one owner. API keys pass every role check because they already represent the org.

### Browser hardening

- **CORS** allows exactly `DASHBOARD_ORIGIN` with credentials.
- **CSRF** for `/app/*`: every non-safe request must carry an `Origin` header equal to
  `DASHBOARD_ORIGIN` (`lib/csrf.ts`). Cookies are `lax`, so cross-site POSTs do not carry
  the session anyway; the Origin check is the second lock.
- **Invites** are random 24-byte tokens stored as a SHA-256 hash, bound to an email, valid
  for `INVITE_TTL_DAYS` (7), single use, and only acceptable by a session whose email
  matches.
- **Audit log**: sensitive actions (key create/revoke, mailbox connect/remove, member
  changes, invites, org rename/delete, webhook secret rotation) append to `audit_log`
  with actor, org and action.
- The public `/api/google/connect` route is gone. A connect URL is minted for an admin
  session via `POST /app/orgs/{orgId}/mailboxes/google/connect-url`; the callback stays
  public because Google calls it, and is protected by the signed state.

### Message bodies are retained (amends 0005)

ADR 0005 dropped `message_bodies` rows once a message reached a terminal state. The
dashboard's preview and resend need the body, so bodies are now kept alongside the
message row. Retention becomes a future cleanup job rather than a worker side effect.

### The dashboard is a typed client of the OpenAPI document

`apps/web` is React 18 + Vite + TypeScript + Tailwind 4 with hand-written shadcn-style
components on Radix primitives, TanStack Query for server state and React Router for
`/o/:orgId/*`. `pnpm --filter @postrail/api openapi:export` writes `openapi.json`,
`pnpm --filter @postrail/web api:types` turns it into `schema.d.ts`, and `openapi-fetch`
gives a client whose paths, bodies and responses are checked by the compiler. The web app
imports `@postrail/shared/browser`, a subpath that exports constants, schemas and the
template renderer but none of the Node modules; ESLint forbids the root import in
`apps/web`. Design tokens live in `src/styles/tokens.css` and are documented in
`apps/web/DESIGN.md`.

### Test sessions

Unit tests and the Playwright server never run Better Auth. `createApp` takes a
`sessionResolver(headers)`; production wires `sessionResolverFor(auth)`, unit tests read
a JSON user from the `x-test-user` header, and `src/test/e2e-server.ts` reads the same
JSON from a `postrail_test_user` cookie so a real browser can carry it. Neither shortcut
exists in `src/index.ts`.

## Consequences

- Better Auth dictates the shape of the four auth tables; schema changes there follow
  its migrations, not ours.
- Magic links depend on the system mailbox being connected and healthy; if it
  disconnects, only Google sign-in works until it is reconnected.
- The dashboard has no local state that the API does not own; every mutation is an API
  call, so the UI cannot drift from what a bearer key can do.
- Rate limiting for `/app` is keyed by user id, so one busy tab can slow another of the
  same user; that is acceptable at this scale.
- Google sign-in needs `<API_ORIGIN>/api/auth/callback/google` added as an authorised
  redirect URI in the Cloud Console, in addition to the mailbox callback.
