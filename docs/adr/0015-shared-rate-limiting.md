# 0015. Shared rate limiting in Postgres

Date: 2026-11-06
Status: Accepted (amends 0004: the limiter is no longer per instance)

## Context

ADR 0004 shipped an in-memory token bucket per API instance and said to move it to Postgres
or Redis before publishing hard limits. In memory, the real budget is the published one
times the number of instances, and every deploy hands every key a fresh burst. Redis would
be a new vendor for one feature; Postgres is already on every request path.

## Decision

**GCRA in one SQL statement.** The generic cell rate algorithm gives the same budget as the
token bucket (a burst of 120, then 2 a second) while storing one timestamp per key: the
"theoretical arrival time" at which its budget is fully spent. The `rate_limits` table
(`key`, `tat`) is updated by a single `INSERT ... ON CONFLICT DO UPDATE ... WHERE`, which
admits a request only if `tat` is within the burst tolerance of now and advances it by one
interval when it does. Concurrent requests serialize on the row, so the budget is exact.
The database clock is used, so instances with slightly different clocks agree.

`SharedRateLimiter` in `lib/rate-limit.ts` turns the answer into `RateLimit-Remaining` and
`Retry-After`. The SQL lives in `modules/rate-limits/repo.ts`, under `withSystem` because
keys are API key ids and user ids, not orgs, and the table holds no tenant data. It is a
system table like `scheduled_runs`: no `org_id`, no policy.

**It fails open.** If the store cannot answer, the request is allowed and a warning logged.
A limiter that failed closed would turn a database blip into a full outage of the API.

Rows idle for a day are deleted by the scheduler's retention (ADR 0014); a missing row is a
full budget, so deleting one changes nothing.

## Consequences

- One more short transaction per `/v1` and `/app` request. Within one region that is a few
  milliseconds; if the API and Neon ever sit in different regions, it is not.
- The published limit is now the real limit across instances and deploys.
- While Postgres is down the API is unlimited, which matters little because it is mostly
  unusable then anyway.
- Tests keep the in-memory bucket; the GCRA arithmetic is tested against a fake that runs
  the same steps as the SQL, and the SQL itself was run against a real Postgres.
