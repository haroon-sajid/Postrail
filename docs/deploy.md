# Deploying Postrail

Two services, two hosts. The dashboard is a static bundle on a Cloudflare Worker; the API
is a Node service on Render. They live on different origins, so the browser talks to the
API cross-site with cookies, and both sides must be told about each other.

| Piece     | Where                                          | Config lives                 |
| --------- | ---------------------------------------------- | ---------------------------- |
| Dashboard | https://postrail.haroonsajid-ai.workers.dev    | Cloudflare build variables   |
| Previews  | https://\*-postrail.haroonsajid-ai.workers.dev | same build variables         |
| API       | https://postrail-api.onrender.com              | Render environment variables |

## Dashboard (Cloudflare)

The bundle learns the API URL from `VITE_API_URL` in `apps/web/src/lib/config.ts`:

1. `VITE_API_URL` if set (trailing slash stripped).
2. Otherwise `http://localhost:8080`, but only when the page is served from localhost.
3. Otherwise the app throws at startup. A build without the variable fails loudly on the
   first page load instead of silently calling localhost from a user's browser.

**Vite bakes `VITE_` variables into the JavaScript at build time.** Cloudflare must
therefore have `VITE_API_URL` set as a _build_ variable, and changing it in the Cloudflare
dashboard does nothing until the next build. Trigger a redeploy after editing it. The
variable is public by design; never put a secret in a `VITE_` variable.

Set, for both production and preview environments:

```
VITE_API_URL=https://postrail-api.onrender.com
```

`apps/web/.env.production.example` records the same value for reference.

## API (Render)

The API reads its configuration from the environment via `getEnv()` in
`packages/shared/src/env.ts` and refuses to start if anything is missing or malformed.
The variables that tie the two hosts together:

```
NODE_ENV=production
API_ORIGIN=https://postrail-api.onrender.com
DASHBOARD_ORIGIN=https://postrail.haroonsajid-ai.workers.dev
CORS_ORIGIN=https://postrail.haroonsajid-ai.workers.dev
CORS_ORIGIN_PATTERN=https://*-postrail.haroonsajid-ai.workers.dev
GOOGLE_REDIRECT_URI=https://postrail-api.onrender.com/api/google/callback
```

- `API_ORIGIN` is the API's own public URL. Better Auth builds magic links and OAuth
  callback URLs from it. **Required in production and must be https**; the API exits at
  startup naming the variable if it is missing or plain http. Render value:
  `https://postrail-api.onrender.com`.
- `DASHBOARD_ORIGIN` is the canonical dashboard. Invite and magic-link emails point here
  and it is always trusted. **Required in production and must be https**, same check as
  above. Cloudflare value: `https://postrail.haroonsajid-ai.workers.dev`.
- Outside production both default to localhost, so nothing changes for local development.
- `CORS_ORIGIN` is a comma-separated list of further exact origins to trust. It may repeat
  `DASHBOARD_ORIGIN`; duplicates are dropped.
- `CORS_ORIGIN_PATTERN` is a comma-separated list of wildcard origins for hosts that are
  minted per deployment. One `*` stands for one host label, so the pattern above matches
  `https://pr-7-postrail.haroonsajid-ai.workers.dev` and nothing outside that domain.

One matcher (`apps/api/src/lib/origins.ts`) built from those three variables drives CORS,
the CSRF origin check on `/app/*`, and Better Auth's trusted origins, so the three can
never disagree. Requests from any other origin get no CORS headers and a 403 on writes.

Google's OAuth client must list `GOOGLE_REDIRECT_URI` as an authorised redirect URI and
the dashboard origin as an authorised JavaScript origin.

## Checking a deployment

- Open the dashboard. A blank page with `VITE_API_URL is not set` in the console means
  the build variable was missing; set it and rebuild.
- `GET https://postrail-api.onrender.com/` returns the health payload with the version.
- A CORS failure in the browser console on `/app/*` means the page's origin is not covered
  by `DASHBOARD_ORIGIN`, `CORS_ORIGIN` or `CORS_ORIGIN_PATTERN` on Render.
