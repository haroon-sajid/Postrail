# 0008. Deployment origins and API URL resolution

Date: 2026-09-30
Status: Accepted (amends the browser hardening section of 0007)

## Context

The dashboard is served from a Cloudflare Worker and the API from Render, so they are on
different origins, and Cloudflare mints a fresh origin for every preview build. ADR 0007
allowed exactly one origin, `DASHBOARD_ORIGIN`, for CORS and CSRF. The dashboard also
carried a `localhost:8080` fallback for the API URL that silently applied to production
builds, so a deployed bundle called the developer's laptop.

## Decision

**Dashboard.** `apps/web/src/lib/config.ts` is the only place that knows the API URL. It
uses `VITE_API_URL` when set, falls back to `http://localhost:8080` only when the page is
served from localhost, and otherwise throws at import time. Vite bakes the variable in at
build time, so it is a build variable on Cloudflare (`docs/deploy.md`). The typed API
client and the Better Auth client both take this value and send credentials on every
request, because the session cookie belongs to the API's origin.

**API.** Trusted browser origins are `DASHBOARD_ORIGIN` plus the comma-separated
`CORS_ORIGIN` list plus the wildcard patterns in `CORS_ORIGIN_PATTERN`, where `*` matches
one host label. `resolveBrowserOrigins()` in `packages/shared` validates and normalises
them; `createOriginMatcher()` in `apps/api/src/lib/origins.ts` turns them into one
predicate that feeds CORS, the CSRF check on `/app/*` and Better Auth's `trustedOrigins`.
A request from any other origin gets no CORS headers and a 403 on state-changing routes.

## Consequences

- Preview deployments work without touching Render for each branch.
- A production bundle built without `VITE_API_URL` fails on first paint with a clear
  message instead of half-working.
- Widening trust is an explicit environment change on the API, and the pattern can only
  reach sibling subdomains of a host we own.
- `DASHBOARD_ORIGIN` keeps its other job: invite and magic-link URLs point there.
- Cookies stay `sameSite=lax` as decided in 0007. Because the dashboard and API are now
  on different sites, browsers will not attach a lax cookie to the dashboard's fetches.
  Moving to `sameSite=none; secure` for production is a separate decision.
