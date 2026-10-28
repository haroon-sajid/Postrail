# 0011. End-user authentication

Date: 2026-10-02
Status: Accepted (amends 0007: a message body can now be marked sensitive and is then deleted)

## Context

Tenants use Postrail to send the emails a sign-in system needs (verification, magic
links, password resets) and then build the sign-in system itself somewhere else. They
asked for both in one place: one API key that sends email and signs their users in.

Two kinds of user now exist and must not be confused. **Dashboard users** sign in to
Postrail itself; Better Auth owns them (ADR 0007). **End users** are the people who sign
in to a tenant's application; this ADR is about them. They are tenant data, like messages.

Constraints: the tenant has only a secret key (`pr_live_...`), which must never reach a
browser; delivery stays asynchronous (ADR 0005); every table stays behind `withOrg`.

## Decision

### The tenant's backend drives every flow

There is no publishable key, no hosted login page and no Postrail cookie on the tenant's
site. The tenant's backend calls `/v1/auth/*` with its API key, exactly as it calls
`/v1/emails`, and the browser only ever follows redirects:

1. `POST /v1/auth/sign-in/{google|github}` returns the provider's consent URL. The
   backend redirects the browser there.
2. The provider returns to `GET /api/sign-in/{provider}/callback` on Postrail, which
   creates or finds the end user and redirects to the tenant's `redirect_url` with
   `?code=...`, or with `?error=...` when it could not.
3. The backend swaps the code at `POST /v1/auth/exchange` for the user, a session token
   and an access token. Codes are single use, expire in five minutes and are stored as a
   SHA-256 hash.

Magic links take the same road: `POST /v1/auth/sign-in/magic-link` emails a link to
`redirect_url?code=...` (fifteen minutes) and the same exchange call finishes it. Email
codes skip the redirect: `POST /v1/auth/sign-in/otp` emails six digits (ten minutes, five
guesses) and `POST /v1/auth/sign-in/otp/verify` returns the session. Sign-up and sign-in
are one operation; the response says `is_new_user`.

Because the exchange needs the secret key, a code leaked from a URL is useless on its
own. An optional `state` is passed through to the redirect so the tenant can bind the
flow to the browser that started it, which is what stops login CSRF.

### Redirects are allow-listed per workspace

`redirect_url` must equal one of the workspace's registered URLs (origin and path; https,
or http on localhost). The provider callback checks the list again, so removing a URL
cancels flows already in flight. The OAuth `state` is the same HMAC-signed, ten-minute
token mailbox connect uses. It carries the org, so the public callback never trusts an
org id from the query and needs no `withSystem`, and it carries the provider, so a state
minted for one provider cannot finish a sign-in at another's callback.

### Providers sit behind one interface, with credentials per workspace

`providers/identity.ts` defines `IdentityProvider` (`authUrl`, `fetchProfile`); Google and
GitHub implement it, and a provider's failure reaches the tenant as a short error code
(`invalid_client`, `provider_unavailable`) on the redirect. Credentials are passed per
call because they differ per workspace, and no provider token outlives the request.

- **Google** works at once with Postrail's own client (`GOOGLE_CLIENT_ID`); the consent
  screen then says "Postrail". Saving a client id and secret under Sign-in methods
  switches that workspace to its own Google project and brand. Scopes are
  `openid email profile`, which need no Google verification.
- **GitHub** has no shared client: it starts off, and can only be turned on once the
  workspace has saved its own OAuth app. The address used is the primary one from
  GitHub's emails endpoint, because the profile's public email is optional and unverified.

Client secrets are encrypted with `TOKEN_ENCRYPTION_KEY` and never returned. Microsoft is
left out on purpose: its `email` claim is not verified for multi-tenant apps, and matching
users on an unverified address would let one account take over another.

### Identity is the verified email, per workspace

`auth_users` is unique on `(org_id, email)`, lowercased. A provider sign-in whose address
is unverified is refused; a verified one links to the existing user with that address, so
someone who first used a magic link and later uses Google is one user. `auth_identities`
records the provider's stable id so a changed address still finds the same user.

Sign-ups can be closed per workspace. Then a sign-in only succeeds for an address that
already has a user, the provider redirect carries `signups_disabled`, and admins add
people with `POST /v1/auth/users`.

### Two credentials: a revocable session and a short-lived access token

A sign-in returns both.

- The **session token** (`prs_...`, 256 random bits, stored as a hash, thirty days) is
  the one that can be revoked. `sessions/verify` introspects it and answers
  `{ active, user, session }`, so a dead session is a normal `200` and never looks like a
  bad API key. `sessions/revoke` ends one; revoking by user ends all of them.
- The **access token** is a JWT (ES256, fifteen minutes) with `iss` the API origin, `aud`
  the workspace id, `sub` the user id and `sid` the session id. The tenant verifies it
  against `GET /api/jwks/{orgId}` without calling Postrail, so checking a login on every
  request costs no API call and no rate limit. `sessions/refresh` trades a live session
  token for a new one and answers `active: false` once the session is gone, which is how
  a revocation reaches a tenant that verifies offline, at most fifteen minutes late.

Each workspace has its own key pair, made on first use; the private key is encrypted with
`TOKEN_ENCRYPTION_KEY`. Per-workspace keys mean a token minted for one tenant cannot
verify under another's key set even if a tenant forgets to check `aud`. Keys are only
added, so the JWKS document can be cached and older tokens keep verifying.

### Sign-in email goes through the tenant's mailbox, and its content stays hidden

Sign-in emails are ordinary messages: the service calls `EmailService.send`, the worker
delivers, the message shows in Logs, suppressions apply. A workspace without an active
mailbox gets `NO_MAILBOX`. At most five go to one address per fifteen minutes.

Their content, though, is a credential. They are sent with `sensitive: true`, which the
body row records: the preview API returns nothing for it, resend is refused, and the
worker deletes the body once delivery ends. Subjects never carry the link or code,
because subjects are listed and sent to webhooks. This amends ADR 0007, which keeps
every other body for preview and resend.

A workspace can write these emails itself by choosing a stored template for the link
email and for the code email. A template is accepted only if it contains the one variable
it cannot do without (`url` or `code`) and uses nothing beyond what Postrail fills in
(`app_name`, `email`, `expires_in_minutes`). If the chosen template is later deleted, the
built-in wording is used rather than locking everyone out.

### Webhooks

`user.created`, `user.signed_in` (with the `method`) and `user.deleted` go through the
same event bus and delivery worker as the email events (ADR 0006). The payload is the
user, never a token. A failure to record an event is swallowed: a webhook must not cost
someone their sign-in.

### Shape in the code

`apps/api/src/modules/auth` holds routes, service, repo, schemas and tests. Flow routes
are mounted under `/v1` only, so a dashboard cookie can never mint an end-user session.
Users and settings are resources and are mounted under both `/v1` and
`/app/orgs/{orgId}` (ADR 0007), so the dashboard's Users and Sign-in methods pages run the
same handlers. Six tenant tables (`auth_settings`, `auth_users`, `auth_identities`,
`auth_sessions`, `auth_challenges`, `auth_signing_keys`) follow the usual RLS recipe.
JWT signing and verification live in `packages/shared/src/jwt.ts` on `node:crypto`, with
no new dependency.

## Consequences

- One key does email and sign-in, and a tenant can add sign-in without touching DNS, a
  second vendor or a browser SDK.
- Postrail is now on the tenant's login path. If the API is down nobody can sign in or
  refresh; people already holding an access token carry on until it expires.
- A revoked session keeps passing offline checks for up to fifteen minutes. Tenants who
  need it to stop at once call `sessions/verify`, which counts against the per-key rate
  limit (120 burst, 2/s).
- The shared Google client must list `<API_ORIGIN>/api/sign-in/google/callback` as an
  authorised redirect URI, next to the two it already has (ADR 0009). Its unverified-app
  user cap applies to everyone on shared credentials, which is one more reason they are
  for getting started.
- There is no key rotation endpoint yet. Rotating means inserting a new key row; the
  design allows it, nothing triggers it.
- A sign-in email that fails to send has no body left to inspect, by design. The message
  row still records the error.
- `auth_challenges` and expired `auth_sessions` rows accumulate; they need the same
  retention job `webhook_deliveries` is waiting for.
- A magic link is delivered from the tenant's Gmail daily allowance, so a busy login form
  competes with their other mail. Broadcasts leave room for it (ADR 0013).
