# 0013. Broadcasts

Date: 2026-10-02
Status: Accepted

## Context

Tenants want to send one announcement to a whole list. Postrail sends through the
tenant's own Gmail, which caps a free account at about 500 messages a day, and the same
mailboxes carry the tenant's application email: password resets, sign-in links (ADR
0011). A broadcast therefore cannot simply loop over the list. It has to stay inside the
limits, take as many days as that needs, and leave room for the mail that cannot wait.

## Decision

**A broadcast is one template sent to one list.** It is created as a draft, which sends
nothing. `POST /v1/broadcasts/{id}/send` starts it and `/cancel` stops it. Sending and
canceling need the admin role from the dashboard.

**Starting freezes what is sent and to whom.** In one transaction the draft becomes
`sending`, the template's subject and HTML are copied onto the broadcast, and the list's
members are copied into `broadcast_recipients` with their properties. A broadcast can run
for days; editing the template or the list meanwhile changes nothing about it. The
status check in that update is also what stops two requests from starting it twice.

**Recipients become ordinary messages.** A new job kind, `dispatch-broadcast`, runs one
round: it claims a batch of waiting recipients, renders the frozen template with each
one's properties, and calls `EmailService.send`. From there a recipient is a message like
any other: queued, delivered by the email worker, retried, visible in Logs, reported by
`email.sent` and `email.failed`. Nothing about delivery is duplicated.

**Pacing is by room, not by clock.** Before claiming, a round asks how much room each
active mailbox has: 80% of its daily limit, less what it sent today, less what is already
queued for it. Counting the queue matters because `sent_today` only moves when the worker
sends, so without it a burst would be planned against room that is already spoken for. A
round claims no more than a batch and no more than the room, gives each recipient to the
mailbox with the most room left (which spreads a broadcast across mailboxes), and queues
the next round while room remains. When it runs out the broadcast waits. The daily reset
job (`/internal/cron/reset-daily-counters`) starts every unfinished broadcast again, so
the next day's capacity is used without anyone doing anything.

The other 20% of each mailbox is never touched by a broadcast. That is what keeps a
password reset going out on the day of a large send.

**At-least-once is handled by a claim and a key.** Recipients are claimed with
`FOR UPDATE SKIP LOCKED`, so two deliveries of the same job take different rows. A claim
older than ten minutes belongs to a round that died and can be taken again; because each
message is sent with the idempotency key `broadcast:<recipient id>`, a recipient that was
queued before the round died is recognised and not sent twice.

**A recipient has one of five outcomes.** `pending` (waiting for room), `queued`, `sent`
or `failed` (from the message), and `skipped`. A suppressed address is skipped. A contact
missing a property the template needs is failed with the names of what is missing, and
the rest of the broadcast carries on. `status: sent` on the broadcast means every
recipient was handed to delivery; each message then has its own status.

**Every broadcast email can be unsubscribed from.** The worker adds a `List-Unsubscribe`
header and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058), and a footer
link unless the template has its own `{{unsubscribe_url}}`. The link is an HMAC-signed
pair of org and address, not a stored token. `GET /api/unsubscribe` only asks, because
mail scanners follow links; the `POST` adds the address to the suppression list with
reason `unsubscribe`, and it is also what a mail client's own unsubscribe button sends.

## Consequences

- A list larger than the day's room takes several days, and the dashboard says so
  instead of failing. Raising a limit or connecting a mailbox takes effect at the next
  reset, not at once.
- The 80% share is a constant. A tenant who sends only broadcasts leaves a fifth of each
  mailbox unused; a tenant whose application email needs more than a fifth can still be
  squeezed on the day of a send.
- A broadcast is bounded by Gmail's own daily cap whatever the limit is set to. This is
  for announcements to people who know the sender, not for bulk marketing.
- The daily job now also resumes broadcasts. If Cloud Scheduler does not run, broadcasts
  stall as well as counters.
- Canceling skips recipients still waiting. Messages already queued go out; there is no
  recall.
- A broadcast has no scheduled send time, no A/B variants and no open or click tracking.
- `broadcast_recipients` keeps a copy of each contact's properties. It grows with every
  send and wants the same retention job as webhook deliveries.
