# 0017. Webhook destinations

Date: 2026-11-06
Status: Accepted (closes the SSRF item left open by 0006)

## Context

ADR 0006 let a webhook point anywhere. The delivery worker runs inside our network, so a
tenant could aim it at `http://169.254.169.254/` (cloud metadata, which can hold
credentials), at localhost, or at private addresses, and use Postrail as a proxy into
them. Checking the URL when it is saved is not enough on its own: a name can resolve to a
public address at save time and to a private one at delivery time (DNS rebinding).

## Decision

**`createDestinationGuard` in `lib/destinations.ts`, checked twice.**

- **When an endpoint is created or its URL changed,** the host is refused if it is a
  non-public address literal, a local name (`localhost`, `*.local`, `*.internal`,
  `*.home.arpa`), cannot be resolved, or resolves to any non-public address. In production
  new endpoints must use https, since the payload and its signature travel in the request.
- **At every delivery,** the worker sends through `node:http(s)` with a `lookup` hook: the
  address the socket actually connects to is the one that was checked. Literal addresses,
  which skip the lookup, are checked before connecting. Redirects are not followed and the
  response body is never read. A destination refused at delivery fails at once without
  retries, because retrying would not change the answer.

"Non-public" is loopback, private, link-local, carrier-grade NAT, documentation,
benchmarking, multicast and reserved IPv4 space, and the IPv6 equivalents plus the
prefixes that tunnel into IPv4 (NAT64, 6to4, Teredo). IPv4-mapped IPv6 is judged as IPv4.
Node's `BlockList` holds the ranges, so no dependency was added.

Outside production, private destinations are allowed, so `examples/webhook-receiver.mjs`
on `localhost:4000` keeps working.

## Consequences

- A receiver that is only reachable inside a private network cannot get webhooks; it needs
  a public endpoint or a tunnel.
- A host whose DNS is not live yet cannot be saved until it is.
- http endpoints saved before this change keep receiving deliveries; only new and changed
  ones must use https.
