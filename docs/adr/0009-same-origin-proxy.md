# 0009. Same-origin proxy via the Worker

Date: 2026-09-30
Status: Accepted (amends 0008; the browser hardening in 0007 stands)

## Context

The dashboard is a Cloudflare Worker and the API is on Render. With the dashboard calling
`postrail-api.onrender.com` directly, every cookie the API set was third-party to the
page. Browsers refuse to send a `sameSite=lax` cookie on those requests, and Google
sign-in failed with `state_mismatch` because the OAuth state cookie never came back.
Relaxing cookies to `sameSite=none` would have fixed the symptom by giving up the CSRF
protection 0007 relies on.

## Decision

The Worker (`apps/web/src/worker.ts`) proxies the API. Requests whose path starts with
`/api/`, `/v1/`, `/app/` or `/docs/`, or equals `/openapi.json`, `/docs` or `/health`,
are forwarded to `API_UPSTREAM` (a `vars` entry in `wrangler.jsonc`) with method, path,
query, headers and body intact. Cookies pass through both ways, hop-by-hop headers are
dropped, redirects are returned rather than followed. `run_worker_first` lists the same
prefixes so the SPA's own paths never touch the Worker. Everything else is static assets.

The browser therefore sees one origin. The dashboard's `API_URL` is the empty string
outside localhost, so requests are relative. On the API, `API_ORIGIN` (Better Auth's
public base URL) and `DASHBOARD_ORIGIN` are both the dashboard origin in production.
Cookies keep `secure` (production), `httpOnly` and `sameSite=lax`. CORS headers are only
emitted outside production (`corsEnabled` on `createApp`); the origin matcher from 0008
still drives the CSRF check and Better Auth's trusted origins, which is what lets preview
hostnames sign in.

## Consequences

- Google sign-in and the session cookie work without weakening cookie attributes.
- Google's OAuth clients must list the dashboard host for both the sign-in callback
  (`/api/auth/callback/google`) and the mailbox callback (`/api/google/callback`).
- Preview builds proxy to the same production API and share its data. Sign-in from a
  preview lands on the production dashboard host because that is Better Auth's base URL.
- `/` on Render is still the health probe; `/health` is the same payload for the proxy.
- One more hop per API call. Cloudflare and Render are both edge-reachable, so this is
  tens of milliseconds, and the SPA's own assets are unaffected.
