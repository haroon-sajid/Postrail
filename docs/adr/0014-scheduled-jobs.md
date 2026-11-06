# 0014. Scheduled jobs: the tick, the sweep and retention

Date: 2026-11-06
Status: Accepted (amends 0005: the daily reset is claimed per day; amends 0007: email
content is kept for 30 days, not forever; amends 0013: recipient properties are cleared
once used)

## Context

ADR 0005 assumed Cloud Scheduler would call `/internal/cron/reset-daily-counters` at
midnight. Nothing in the deployment did, so mailboxes stopped sending once they reached
their limit and paced broadcasts never resumed. Work could also be lost: the local queue
keeps tasks in memory and the API runs on a free host that sleeps after 15 idle minutes,
so a restart or a nap dropped scheduled retries, webhook retries and broadcast rounds.
ADRs 0006, 0011 and 0013 each left a table growing with no retention job.

## Decision

**One idempotent endpoint, `POST /internal/cron/tick`, runs whatever is due.** It has three
independent parts. If one throws, the others still run and the response is a 500 that
names it in `failed`, so the caller's own log shows the problem.

- **Daily.** The counter reset and the broadcast resume run once per UTC day, claimed in
  the new `scheduled_runs` table: the claim succeeds for a new day, or for today's claim if
  it is unfinished and older than a ten-minute lease (the run died). The claim is completed
  after the reset and released if the reset throws, so the next tick retries. Resuming
  broadcasts happens after completion, because a second reset in one day would hand
  mailboxes capacity they already used. `/internal/cron/reset-daily-counters` stays for
  existing Cloud Scheduler jobs and follows the same rule (`skipped: true` when today ran).
- **Sweep.** Puts lost work back on the queue with fresh task names: emails still `queued`
  more than ten minutes after `messages.next_attempt_at` (new column: insert time for a new
  message, the retry time for a retry) or `sending` past their lease; webhook deliveries
  `pending` ten minutes past their due time or `sending` past their lease; broadcasts still
  `sending` with no recipient freshly claimed by a round. At most 200 of each per tick. The
  workers' claims make a duplicate of a merely slow task harmless.
- **Retention.** Deletes, at most 5000 rows of each kind per tick, what has done its job:
  email content of finished messages after 30 days (the message row and its status stay),
  finished webhook deliveries after 30 days, end-user sessions 30 days after they expire,
  sign-in links and codes a day after they expire, and rate-limit rows idle for a day. The
  periods are `RETENTION_DAYS` in `packages/shared`, which the privacy page quotes. A
  broadcast recipient's copied contact properties are cleared as soon as it is settled or
  canceled, since only rendering needs them.

**The clock is the dashboard Worker's Cron Triggers** (`triggers.crons` in
`apps/web/wrangler.jsonc`, `scheduled` in `src/worker.ts`). Every 10 minutes it requests
`/health`, which touches no database and keeps the free API instance awake. Every 30
minutes it posts the tick to `API_UPSTREAM` directly, with `Authorization: Bearer
CRON_SECRET`. `/internal` is not proxied for browsers.

**`CRON_SECRET` opens `/internal/cron/*` only** (`withCronSecret` in `lib/internal-auth.ts`),
whichever queue driver is in use. A leaked cron secret can make the scheduler tick early;
it cannot put a job on `/internal/tasks/*`. The queue's own credential (the shared secret,
or a Cloud Scheduler OIDC token) keeps working on the cron paths too.

The local queue now forgets task names after an hour, as Cloud Tasks does, instead of
remembering every name for the life of the process.

## Consequences

- A lost email goes out at most about 40 minutes late (10 minutes of grace plus the 30
  minute interval). With Cloud Tasks, losses are rare and the sweep is a safety net.
- Each tick wakes the database. Neon bills compute while awake, so the 30-minute interval
  is a trade between recovery time and free-tier hours; the keep-warm ping costs none.
- The keep-warm ping keeps one Render instance up all month, about 730 of the 750 free
  instance hours. A paid instance does not need it.
- Nothing runs unless `CRON_SECRET` is set both on the API and as a Worker secret
  (`docs/deploy.md`). Cron Triggers run on the deployed Worker, not on preview versions.
- If the process dies between the reset and completing its claim, the claim lapses after
  ten minutes and the reset runs again that day, wiping those minutes of counts. The 20%
  that broadcasts leave unused (ADR 0013) absorbs that overshoot.
- Email previews and resend stop working for messages older than 30 days.
