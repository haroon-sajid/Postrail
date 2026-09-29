# 0005. Queueing and reliable delivery

Date: 2026-09-29
Status: Accepted. Supersedes the "sending is synchronous" paragraph of [0004](./0004-api-design-and-versioning.md).

## Context

ADR 0004 sent email inside the request. That tied API latency to Gmail's, gave callers
no retries, and would have failed every send during a Gmail blip. The launch platform is
Cloud Run on free tiers: no long-running processes, no Redis, and instances that can
disappear mid-request.

## Decision

**One `Queue` interface, two drivers.** `enqueue(job, { taskId, delaySeconds })` is the
whole contract. `CloudTasksQueue` calls the Cloud Tasks REST API with `fetch` and an
Application Default Credentials token (no gRPC client to bundle). `LocalQueue` runs jobs
in-process on timers and is used when `QUEUE_DRIVER=local`, which is the default for
development and what every test uses (`drain()` runs pending jobs deterministically).
Both honour the same semantics: named tasks deduplicate, delays are respected, delivery
is at-least-once, a handler that throws is redelivered a few times.

**Why Cloud Tasks.** Durable, retried, rate-limitable HTTP delivery with a generous free
quota and nothing to operate. It targets our own API, so the worker is just another route
and scales with Cloud Run. Task payloads are tiny (`{ orgId, messageId }`); everything
else is loaded from the database at delivery time.

**POST /v1/emails only queues.** It validates, resolves the template, checks
suppression, picks a mailbox, inserts the message as `queued` together with its body,
enqueues a task named after the message id, and returns `201 { id, status: "queued" }`.
The test suite asserts this completes in under 100 ms with no provider call. If the
enqueue itself fails the message is marked `failed` with a clear reason rather than
lingering as `queued` forever.

**Bodies are stored only while in flight.** A new `message_bodies` table (tenant-scoped,
RLS, cascade on message delete) holds html, text, reply-to and custom headers from
insert until the message reaches `sent` or `failed`, at which point the row is deleted.
Retries therefore never need the original request, and bodies never outlive delivery.

**The worker is `POST /internal/tasks/send-email`.** In production only requests carrying
a Google-signed OIDC token are accepted: signature and expiry are verified against
Google's certificates, the audience must equal the request's own URL (so a token for
one internal endpoint cannot be replayed against another), and the signing account must
be `TASKS_SERVICE_ACCOUNT_EMAIL`. In local mode a shared `INTERNAL_SECRET` bearer token
is used instead. Internal routes are excluded from the OpenAPI document.

**Idempotency is a database claim, not a queue property.** The worker's first step is an
atomic `UPDATE ... SET status = 'sending', attempts = attempts + 1 WHERE status = 'queued'`.
Only one caller wins; every other delivery of the same job sees zero rows and returns
`skipped`. A message stuck in `sending` for longer than a ten-minute lease is assumed to
belong to a worker that died and may be claimed again. Task names add a second layer:
`<messageId>` for the first attempt and `<messageId>-<attempt>` for retries, so a
duplicate enqueue is refused by the queue itself.

**Retry policy lives in the worker, not in queue configuration.** After a send fails the
error is classified: `invalid_grant` (or the provider's `MailboxDisconnectedError`)
marks the mailbox disconnected and fails the message at once; other 4xx responses fail
at once; 429, 5xx and network errors are transient. A transient failure puts the message
back to `queued` with the error recorded and enqueues the next attempt with a delay of
30 s, 2 min, 8 min, then 30 min. After five attempts in total the message is marked
`failed`. The worker answers 200 for every understood job, whatever the outcome, so
Cloud Tasks' own retry only kicks in for unexpected crashes (database unavailable), where
it is exactly what we want.

**Daily counters reset by Cloud Scheduler.** `POST /internal/cron/reset-daily-counters`
zeroes `sent_today` on every mailbox with a single `withSystem` update and is protected
the same way as the worker. Scheduler runs it at 00:00 UTC.

## Consequences

- Clients see `queued` from `POST /v1/emails` and poll `GET /v1/emails/{id}` for
  `sent` or `failed`. Webhooks will make polling unnecessary later.
- A crash between Gmail accepting a message and `markSent` committing can, after the
  lease expires, lead to a second send. This window is seconds long and only opens when
  a worker dies; it is the accepted cost of at-least-once delivery without a two-phase
  commit against Gmail.
- The mailbox's daily limit is checked when the message is queued, not when it is
  sent. A burst that queues more than the limit can overshoot it slightly.
- Cloud Tasks remembers task names for roughly an hour after completion. A message id
  is never reused, so this only matters for the retry names, which include the attempt.
- Production needs: a Cloud Tasks queue, a service account with `run.invoker` on the
  API, the API's service account with `cloudtasks.enqueuer` and `iam.serviceAccountUser`
  on it, and a Cloud Scheduler job for the cron. Documented in `.env.production.example`.
- Local mode runs the worker in the API process on timers, so a `pnpm dev` restart
  loses pending in-memory jobs. Messages stay `queued` in the database; a sweep that
  re-enqueues stale `queued` rows is the natural next step and would also cover a
  Cloud Tasks outage.
