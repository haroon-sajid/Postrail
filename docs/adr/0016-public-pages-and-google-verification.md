# 0016. Public pages and Google verification

Date: 2026-11-06
Status: Accepted

## Context

Connecting a mailbox asks Google for `gmail.send`, which Google classes as a sensitive
scope. Until the OAuth app is verified, its consent screen stays in Testing: only listed
test users can authorise it, every refresh token expires after seven days (so every
mailbox disconnects weekly), and users see an "unverified app" warning. Verification
requires a public home page on a domain the developer owns that describes the app and why
it wants the data, and a privacy policy, linked from the consent screen, that includes
Google's Limited Use statement. The dashboard had neither; `/` sent visitors to `/login`.

## Decision

**Three public pages in the dashboard:** `/` for signed-out visitors (signed-in ones still
get the overview), `/privacy` and `/terms`. They live in `apps/web/src/pages/site` and make
no API call. Every other signed-out path still redirects to `/login`, which now links to
both policies.

**The pages quote the code, not a copy of it.** `site.ts` lists the Google scopes exactly
as `providers/google-client.ts` and `google-identity.ts` request them, with the operator
and contact address. The privacy policy's retention periods are `RETENTION_DAYS` from
`packages/shared`, the same constants the scheduler deletes by (ADR 0014). The policy
carries Google's Limited Use sentence and says the data is never used for advertising,
sold, or used to train AI models.

## Consequences

- Verification still needs a custom domain verified in Google Search Console:
  `workers.dev` belongs to Cloudflare. The consent screen's home page, privacy and terms
  links must use that domain.
- When a scope is added or removed, `site.ts` must change with it, and the consent screen
  and verification with that.
- The wording is plain-language and has no governing-law clause; the operator should have
  it reviewed before relying on it.
- The pages are rendered in the browser. That is enough for Google's review and for people;
  it is not built for search ranking.
