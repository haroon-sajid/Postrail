# Deploying Postrail

Two services, one origin. The dashboard is a static bundle on a Cloudflare Worker; the
API is a Node service on Render. The Worker proxies the API's paths, so the browser only
ever talks to `https://postrail.haroonsajid-ai.workers.dev` and every cookie is
first-party (ADR 0009).

| Piece     | Where                                          | Config lives                   |
| --------- | ---------------------------------------------- | ------------------------------ |
| Dashboard | https://postrail.haroonsajid-ai.workers.dev    | `apps/web/wrangler.jsonc` vars |
| Previews  | https://\*-postrail.haroonsajid-ai.workers.dev | same                           |
| API       | https://postrail-api.onrender.com              | Render environment variables   |

## How a request flows

```
browser ── https://postrail.haroonsajid-ai.workers.dev/app/me ──▶ Worker (src/worker.ts)
                                                                    │ path is /api/*, /v1/*, /app/*,
                                                                    │ /openapi.json, /docs, /docs/*, /health
                                                                    ▼
                                                  https://postrail-api.onrender.com/app/me
```

Any other path is served from the static assets with SPA fallback and never runs the
Worker code (`run_worker_first` in `wrangler.jsonc`). The proxy keeps method, path, query,
headers, body and cookies, strips hop-by-hop headers, and returns redirects as-is.

## Dashboard (Cloudflare)

`wrangler.jsonc` declares `main: src/worker.ts`, the assets binding and:

```
vars.API_UPSTREAM = https://postrail-api.onrender.com
```

That is the only setting the dashboard needs. It is read at request time by the Worker,
so changing it in `wrangler.jsonc` (or overriding it in the Cloudflare dashboard) takes
effect on the next deploy without touching the bundle.

`VITE_API_URL` stays **unset**. The bundle resolves the API base in
`apps/web/src/lib/config.ts`: `VITE_API_URL` if set, `http://localhost:8080` on localhost,
otherwise the page's own origin. Setting it in Cloudflare would make the bundle bypass
the proxy and reintroduce third-party cookies. If you ever do set a `VITE_` variable,
remember Vite bakes it in at build time, so a change needs a rebuild.

## API (Render)

The API reads its configuration from the environment via `getEnv()` in
`packages/shared/src/env.ts` and exits at startup, naming the variable, if anything is
missing or malformed. The origin-related values:

```
NODE_ENV=production
API_ORIGIN=https://postrail.haroonsajid-ai.workers.dev
DASHBOARD_ORIGIN=https://postrail.haroonsajid-ai.workers.dev
CORS_ORIGIN_PATTERN=https://*-postrail.haroonsajid-ai.workers.dev
GOOGLE_REDIRECT_URI=https://postrail.haroonsajid-ai.workers.dev/api/google/callback
```

- `API_ORIGIN` is the public base URL users reach the API at, which behind the proxy is
  the **dashboard** origin, not the Render hostname. Better Auth builds magic links and
  OAuth callback URLs from it. **Required in production and must be https.**
- `DASHBOARD_ORIGIN` is the canonical dashboard: invite links point here and it is always
  trusted. **Required in production and must be https.**
- `CORS_ORIGIN_PATTERN` trusts preview hostnames for the CSRF origin check and Better
  Auth. One `*` matches one host label. `CORS_ORIGIN` (exact extra origins) is not needed
  in production.
- CORS headers are emitted only outside production. In production nothing is
  cross-origin, so the API sends none.
- Cookies are `httpOnly`, `sameSite=lax`, and `secure` in production
  (`apps/api/src/lib/auth-server.ts`). Same-origin means lax is enough.

The remaining variables (database, `BETTER_AUTH_SECRET`, `TOKEN_ENCRYPTION_KEY`, Google
client id and secret, `SYSTEM_MAILBOX_EMAIL`, queue settings, `CRON_SECRET`) are listed in
`.env.production.example`. In production, new webhook endpoints must use https and may not
point at private or internal addresses (ADR 0017).

## Database migrations

Migrations are not run by a deploy. Apply them to the production database before the
code that needs them goes live:

```
DATABASE_URL=<production url> pnpm db:migrate
```

The API checks this at startup. If the database has not had every migration the build
expects, it prints which ones are missing and exits instead of serving, because code on
an older schema fails one query at a time with nothing but "Internal server error".
Render only switches traffic to a deploy that became healthy, so the previous version
keeps serving until the database is migrated; then redeploy. Migrations here only add
(tables, columns with defaults, enum values), so migrating first is safe for the version
still running.

## Scheduler (Cron Triggers)

The API needs a clock (ADR 0014): something must reset each mailbox's daily count, restart
paced broadcasts, re-queue work a restart lost and delete expired data. The dashboard
Worker provides it with two Cron Triggers in `wrangler.jsonc`:

- every 10 minutes, `GET <API_UPSTREAM>/health`, which keeps the free Render instance awake
  and touches no database;
- every 30 minutes, `POST <API_UPSTREAM>/internal/cron/tick` with `Authorization: Bearer
<CRON_SECRET>`.

One secret, set in two places to the same value (`openssl rand -hex 32`):

1. **Render:** add `CRON_SECRET` to the API's environment variables.
2. **Cloudflare:** from `apps/web`, run `npx wrangler secret put CRON_SECRET` and paste it,
   or add it under the Worker's Settings → Variables and Secrets as a Secret.

The triggers deploy with the Worker. To check one tick by hand (PowerShell):

```
curl.exe -s -X POST https://postrail-api.onrender.com/internal/cron/tick -H "Authorization: Bearer <CRON_SECRET>"
```

It answers a JSON report: `daily` (null once today's reset ran), `requeued`, `deleted`
and `failed`. A 500 names the part that failed; the other parts still ran. Cloudflare's
Worker page lists each cron run and its result under Cron Events. If the tick says
`UNAUTHORIZED`, the two `CRON_SECRET` values differ.

## Google Cloud Console

All three OAuth flows go through the dashboard host. On the OAuth client:

- Authorised redirect URIs:
  `https://postrail.haroonsajid-ai.workers.dev/api/auth/callback/google` (dashboard
  sign-in), `https://postrail.haroonsajid-ai.workers.dev/api/google/callback` (mailbox
  connect) and `https://postrail.haroonsajid-ai.workers.dev/api/sign-in/google/callback`
  (end-user sign-in for workspaces on the shared client, ADR 0011). Without the third,
  Google answers `redirect_uri_mismatch` to every tenant that has not added its own client.
- Authorised JavaScript origin: `https://postrail.haroonsajid-ai.workers.dev`.

The consent screen (Google Auth Platform → Branding and Audience) decides who can connect a
mailbox. `gmail.send` is a sensitive scope (ADR 0016):

- While the publishing status is **Testing**, only the test users listed under Audience can
  authorise, and every Gmail refresh token expires after 7 days, so every mailbox
  disconnects weekly. Fine for trying it; not for launch.
- To launch, set the status to **In production** and submit for verification. Google
  checks: the app home page `https://<your-domain>/`, the privacy policy
  `https://<your-domain>/privacy` and terms `https://<your-domain>/terms` (all three are
  in the dashboard and public), a domain you own and have verified in Google Search Console
  (`workers.dev` cannot be, so put the Worker on a custom domain first and update the
  origins above to it), the scopes `gmail.send` and `userinfo.email` with a written reason
  for each, and a short video showing a mailbox being connected and an email being sent.
- Sign-in alone (`openid email profile`) is not sensitive and needs no verification.

## Checking a deployment

- `https://postrail.haroonsajid-ai.workers.dev/health` returns the API's health payload
  through the proxy. `https://postrail-api.onrender.com/` is the same payload direct, and
  is what Render's own health check should probe.
- `https://postrail.haroonsajid-ai.workers.dev/docs` shows Swagger UI, loading
  `/openapi.json` through the proxy.
- A 500 with `API_UPSTREAM is not configured` means the var is missing from the Worker.
- A 403 on a dashboard write means the page's origin is not covered by
  `DASHBOARD_ORIGIN` or `CORS_ORIGIN_PATTERN` on Render.
- Preview builds proxy to the production API and share its data. Signing in from a
  preview redirects to the production dashboard host, because that is Better Auth's base
  URL.
