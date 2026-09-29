# 0004. Public API design and versioning

Date: 2026-09-29
Status: Accepted. The "sending is synchronous" decision is superseded by [0005](./0005-queueing-and-delivery.md).

## Context

Tenants integrate Postrail from application code they rarely revisit. The API therefore
has to be boring, predictable and stable for years, while the implementation behind it is
allowed to change a lot (synchronous sending today, queued sending soon).

## Decision

**Path versioning: everything public lives under `/v1`.** Additive changes (new optional
fields, new endpoints, new enum values documented as such) ship within v1. A breaking
change gets `/v2` beside `/v1`, with `/v1` kept alive and deprecated for at least twelve
months. Nothing outside `/v1` (`/`, `/api/google/*`, `/docs`, `/openapi.json`) is part
of the contract.

**Authentication: `Authorization: Bearer pr_live_<random>`.** Keys are 192 random bits,
stored as a sha256 hash, looked up by hash (a `withSystem` query, since the org is not
known yet) and rejected when revoked. `last_used_at` is refreshed at most once a minute.
Unknown and revoked keys produce the same message so probing learns nothing. The
temporary `X-Org-Id` header is gone.

**Wire format: JSON, snake_case, ISO 8601 timestamps, nulls for absent values.** Code
stays camelCase; the mapping happens once in each service. Bodies of sent email are never
stored and never returned.

**Errors: one envelope, fixed codes.** `{ error: { code, message } }` with codes
`VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `SUPPRESSED`,
`NO_MAILBOX`, `RATE_LIMITED`, `INTERNAL_ERROR`. Clients branch on the code; the message
is for humans and may change.

**Idempotency: `Idempotency-Key` header on `POST /v1/emails`.** Keys are unique per org
and stored on the message. A repeated key returns the original message with `200`
(a first send returns `201`) and never sends twice; the database unique index settles
races. Batch items carry `idempotency_key` in the body for the same effect.

**Batch: up to 100 items, each independent.** Items are processed in order and the
response holds one result per index, success or error envelope. A batch is never
partially rejected once it passed schema validation.

**Pagination: opaque keyset cursors.** `GET /v1/emails?limit&cursor` returns newest
first and a `next_cursor` that encodes `(created_at, id)` of the last row, backed by
the `messages(org_id, created_at desc)` index. Offsets would drift as rows arrive and
get slow on large tenants. `messages.created_at` is stored at millisecond precision so
the cursor, which passes through a JavaScript Date, compares exactly; any future table
that is paginated this way needs the same `precision: 3`.

**Rate limits: per API key, token bucket, 120 burst and 2/s sustained.** The limiter is
an interface; today's implementation is in-memory per Cloud Run instance, which means
the effective budget is roughly `instances × limit`. That is acceptable at launch and
the interface lets a Redis or Postgres implementation replace it without touching routes.
Responses carry `RateLimit-Limit`, `RateLimit-Remaining` and, on 429, `Retry-After`.

**OpenAPI 3.1 is generated from the zod schemas, not written by hand.** Routes are
declared with `@hono/zod-openapi`, so the validator and the document cannot disagree.
The spec is served at `/openapi.json` and Swagger UI at `/docs`.

**Logging: pino, one JSON line per request with a request id.** `x-request-id` is
honoured when present and generated otherwise, echoed in the response, and attached to
every log line. After authentication the org and key ids are added. Headers, bodies and
tokens are never logged; the logger also redacts known secret field names as a backstop.

**Sending is synchronous for now.** `POST /v1/emails` inserts the message, calls the
provider and returns the final `sent` or `failed` status in the same request. This keeps
the launch simple and the API contract already allows the future shape: `status` may be
`queued` or `sending` when delivery moves to Cloud Tasks, and clients should treat
anything other than `sent` or `failed` as in progress.

## Consequences

- Adding a field is cheap; renaming or removing one is a v2.
- Every route needs a `createRoute` definition, which is a little ceremony but keeps the
  docs honest.
- `sent_today` counters need the daily reset job (Cloud Scheduler) before launch, or
  mailboxes stop sending after their first day.
- The in-memory rate limiter resets on every deploy and does not share state across
  instances; move it to Postgres or Redis before publishing hard limits.
- Synchronous sending ties request latency to Gmail's; the queue is the next step.
- `/api/google/connect` still needs session-based authorisation (ADR 0003).
