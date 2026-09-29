# 0003. Email providers and token storage

Date: 2026-09-29
Status: Accepted

## Context

Tenants send through their own Gmail or Outlook accounts, so Postrail holds OAuth
refresh tokens that grant "send mail as this person". Losing them is the worst thing
that can happen to this product. The API also needs to send through two providers with
different wire protocols without the rest of the code caring which one it is talking to.

## Decision

**One `EmailProvider` interface, one implementation per provider.**
`apps/api/src/providers/types.ts` defines `send(mailbox, message) -> { providerMessageId }`.
`GoogleProvider` implements it over the Gmail API; a Microsoft implementation will sit next
to it. Callers pick a provider with `mailboxService.providerFor(mailbox.provider)` and
never see provider-specific errors, only `MailboxDisconnectedError` or a generic failure.

**No provider SDK.** `GoogleClient` is an interface over the four HTTPS calls we make
(auth URL, code exchange, token refresh, userinfo, Gmail send) implemented with `fetch`.
It keeps the Cloud Run bundle small, keeps the surface we depend on explicit, and makes
the provider trivially testable with a fake client. Google's response bodies are parsed
with zod schemas in `packages/shared` so a changed response fails loudly.

**Tokens are encrypted at rest with AES-256-GCM.** `TOKEN_ENCRYPTION_KEY` is 32 random
bytes, held only in the environment (Secret Manager in production). Ciphertext is stored
as `v1.<iv>.<ciphertext>.<tag>` so the format is self-describing and a future key or
algorithm change can be rolled out row by row. Encryption and decryption happen in
`packages/shared/src/crypto.ts`; nothing else touches key material. Decryption fails
closed on a wrong key or a tampered value. Rotating the key invalidates every stored
token, which means reconnecting every mailbox; a re-encrypt migration can be added when
that trade-off becomes unacceptable.

**Access tokens are cached, refresh tokens are the source of truth.** A mailbox row
stores the encrypted refresh token, the encrypted latest access token and its expiry.
The provider uses the cached access token while it has more than sixty seconds left,
otherwise it refreshes, stores the new one (inside the mailbox's org transaction) and
proceeds. A refresh that fails with `invalid_grant` means the grant is gone (revoked,
password changed, six months idle); the provider marks the mailbox `disconnected` and
raises `MailboxDisconnectedError`. Nothing retries that path.

**Connecting a mailbox is an OAuth authorization-code flow with a signed state.**
`GET /api/google/connect?org=<id>` redirects to Google with scopes `gmail.send` and
`userinfo.email`, `access_type=offline` and `prompt=consent` (the only combination that
reliably returns a refresh token). The `state` parameter is an HMAC-SHA256 signed token
carrying the org id with a ten-minute expiry, so the callback cannot be pointed at a
different org and a stale link cannot be replayed. The callback exchanges the code, reads
the account email, upserts the `(org_id, email)` row with fresh tokens and status
`active`, and writes an `audit_log` row with the email and provider only.

**Token columns never leave the repo.** `MailboxStore.list` selects an explicit column
list without the token columns, and the public `Mailbox` schema in `packages/shared` has
no field that could carry one. Audit metadata is checked against a deny-list of key names
(`token`, `secret`, `password`, `hash`, `html`, `body`, ...) before it is written.

## Consequences

- Adding Microsoft means one `MicrosoftClient`, one `MicrosoftProvider`, a second
  connect/callback pair, and nothing else changes.
- Anyone who can read the database and the environment can decrypt tokens. The point of
  encryption at rest is that a database backup, a Neon branch or a leaked dump is not
  enough on its own.
- **Open risk, must be closed before launch:** `/api/google/connect` currently accepts
  any org id. Until session auth exists, a user could be tricked into attaching their
  mailbox to an attacker's org, which would let that org send as them. The connect route
  must require an authenticated session that is a member of the org. The `X-Org-Id`
  header on `/v1/mailboxes` is the same class of temporary hole and is marked TODO.
- `GOOGLE_REDIRECT_URI` defaults to port 3000 while the API listens on 8080. The local
  `.env` overrides it to 8080; production sets it explicitly.
- Google only returns a refresh token when the consent screen is actually shown. If a
  user previously authorised the app and Google skips consent, the callback fails with a
  clear message telling them to remove the app from their Google account and retry.
