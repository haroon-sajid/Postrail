# 0006. Webhooks, templates and suppressions

Date: 2026-09-29
Status: Accepted

## Context

With delivery asynchronous (ADR 0005), tenants need to learn what happened without
polling, need reusable content so they stop shipping HTML in every request, and need a
way to stop sending to addresses that bounce or opted out.

## Decision

### Webhooks

**Endpoints are tenant rows with a per-endpoint secret.** `POST /v1/webhooks` takes a
URL and a list of events (`email.sent`, `email.failed`, `mailbox.disconnected`) and
returns the secret once. The secret is stored encrypted with `TOKEN_ENCRYPTION_KEY`
because we need it back to sign deliveries, and it never appears in any later response.

**Deliveries are rows too, and they ride the same queue as email.** When a worker
reaches a terminal state it calls the `EventBus`; the webhooks service creates one
`webhook_deliveries` row per subscribed endpoint with the full payload frozen in
`payload` and enqueues a `deliver-webhook` job named after the delivery id. The
`Queue` now carries a discriminated `Job` union; Cloud Tasks targets a different internal
route per kind, derived from `WORKER_URL`'s origin.

**Signatures.** Each request carries `Postrail-Timestamp` (unix seconds) and
`Postrail-Signature: v1=<hex>` where the hex is HMAC-SHA256 with the endpoint secret over
`"<timestamp>.<raw body>"`. Because the stored payload is the body byte for byte, every
retry is identical and verifies with the same computation. `Postrail-Event` and
`Postrail-Delivery-Id` are informational. Receivers must compare in constant time and
reject timestamps older than five minutes; `verifyWebhookSignature` in
`packages/shared` and `examples/webhook-receiver.mjs` show how.

**Retries.** The delivery worker claims the row (`pending` to `sending`, attempts + 1),
POSTs with a ten-second timeout and no redirects, and treats any 2xx as delivered.
Anything else, including network errors, schedules the next attempt after 30 s, 1 min,
5 min, 15 min, 1 h, 3 h, then 6 h, eight attempts in total, after which the delivery is
`failed`. The claim makes duplicate task deliveries harmless, exactly as for email.
`GET /v1/webhooks/{id}/deliveries` exposes status, attempts, response code and error.

### Templates

**Substitution only, never evaluation.** A template is a slug, a subject and an HTML
body with `{{name}}` placeholders where `name` is an identifier. Rendering is a regex
replace against the caller's own variables (`Object.hasOwn`), so `{{constructor}}`,
`${...}` and anything else that looks like an expression is either an unknown variable
or plain text. HTML values are escaped in the body and left alone in the subject.

**Variables are derived, not declared.** The API stores the placeholder names it finds
and returns them, and a send that omits any of them is rejected with the list of what is
missing. Slugs are unique per org and a duplicate is a `409 CONFLICT`.

### Suppressions

**A per-org deny list keyed by lowercased address.** `POST /v1/suppressions` adds with a
reason (`manual`, `hard_bounce`, `complaint`, `unsubscribe`), and a send to a suppressed
address fails before a mailbox is touched. Re-adding keeps the original reason and date.

**Automatic hard bounces, within what the send scope can see.** When Gmail refuses a
message synchronously with wording that names the recipient as invalid, the worker adds
the address with reason `hard_bounce` before failing the message. Asynchronous bounces
arrive as email in the mailbox, which the `gmail.send` scope cannot read; catching those
needs the read scope or a bounce-notification integration and is deliberately out of
scope here.

## Consequences

- Webhook receivers get at-least-once delivery and should treat `Postrail-Delivery-Id`
  as the deduplication key.
- Webhook URLs are not yet restricted; an endpoint pointing at an internal address would
  make the worker a request proxy. Blocking private ranges (SSRF) must land before
  untrusted tenants are onboarded.
- Templates cannot express loops or conditionals. That is the point; if it becomes a
  real need, the answer is a sandboxed engine, not a looser regex.
- Auto-suppression depends on Gmail's error wording and is conservative on purpose: a
  false positive silently stops mail to a real user, a false negative just costs a bounce.
- `webhook_deliveries` grows with every event; a retention job is needed before volume
  matters.
