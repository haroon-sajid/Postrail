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
client id and secret, `SYSTEM_MAILBOX_EMAIL`, queue settings) are unchanged and listed in
`.env.production.example`.

## Google Cloud Console

Both OAuth flows now go through the dashboard host. On the OAuth client:

- Authorised redirect URIs:
  `https://postrail.haroonsajid-ai.workers.dev/api/auth/callback/google` (sign-in) and
  `https://postrail.haroonsajid-ai.workers.dev/api/google/callback` (mailbox connect).
- Authorised JavaScript origin: `https://postrail.haroonsajid-ai.workers.dev`.

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
