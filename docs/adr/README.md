# Architecture decision records

One short file per decision, numbered in order. Never edit a decision after it is accepted;
write a new one that supersedes it.

| ADR                                                    | Title                                | Status   |
| ------------------------------------------------------ | ------------------------------------ | -------- |
| [0001](./0001-architecture.md)                         | Architecture and stack               | Accepted |
| [0002](./0002-tenancy-and-rls.md)                      | Tenancy and Row Level Security       | Accepted |
| [0003](./0003-email-providers-and-token-storage.md)    | Email providers and token storage    | Accepted |
| [0004](./0004-api-design-and-versioning.md)            | Public API design and versioning     | Accepted |
| [0005](./0005-queueing-and-delivery.md)                | Queueing and reliable delivery       | Accepted |
| [0006](./0006-webhooks-templates-suppressions.md)      | Webhooks, templates, suppressions    | Accepted |
| [0007](./0007-user-auth-and-dashboard.md)              | User authentication and dashboard    | Accepted |
| [0008](./0008-deployment-origins.md)                   | Deployment origins and API URL       | Accepted |
| [0009](./0009-same-origin-proxy.md)                    | Same-origin proxy via the Worker     | Accepted |
| [0010](./0010-dashboard-urls-without-org-id.md)        | Dashboard URLs without the org id    | Accepted |
| [0011](./0011-end-user-authentication.md)              | End-user authentication              | Accepted |
| [0012](./0012-contacts-and-lists.md)                   | Contacts and lists                   | Accepted |
| [0013](./0013-broadcasts.md)                           | Broadcasts                           | Accepted |
| [0014](./0014-scheduled-jobs.md)                       | Scheduled jobs                       | Accepted |
| [0015](./0015-shared-rate-limiting.md)                 | Shared rate limiting in Postgres     | Accepted |
| [0016](./0016-public-pages-and-google-verification.md) | Public pages and Google verification | Accepted |
| [0017](./0017-webhook-destinations.md)                 | Webhook destinations                 | Accepted |

## Template

```markdown
# NNNN. Title

Date: YYYY-MM-DD
Status: Proposed | Accepted | Superseded by NNNN

## Context

What problem are we solving and what constraints apply.

## Decision

What we chose, in one or two paragraphs.

## Consequences

What gets easier, what gets harder, what we must remember.
```
