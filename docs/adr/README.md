# Architecture decision records

One short file per decision, numbered in order. Never edit a decision after it is accepted;
write a new one that supersedes it.

| ADR                                                 | Title                             | Status   |
| --------------------------------------------------- | --------------------------------- | -------- |
| [0001](./0001-architecture.md)                      | Architecture and stack            | Accepted |
| [0002](./0002-tenancy-and-rls.md)                   | Tenancy and Row Level Security    | Accepted |
| [0003](./0003-email-providers-and-token-storage.md) | Email providers and token storage | Accepted |
| [0004](./0004-api-design-and-versioning.md)         | Public API design and versioning  | Accepted |
| [0005](./0005-queueing-and-delivery.md)             | Queueing and reliable delivery    | Accepted |
| [0006](./0006-webhooks-templates-suppressions.md)   | Webhooks, templates, suppressions | Accepted |
| [0007](./0007-user-auth-and-dashboard.md)           | User authentication and dashboard | Accepted |
| [0008](./0008-deployment-origins.md)                | Deployment origins and API URL    | Accepted |

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
