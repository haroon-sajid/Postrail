# Postrail

Multi-tenant email API. Tenants connect their own Gmail or Outlook mailbox and send
application email through it via a REST API.

## Getting started

```
pnpm install
cp .env.example .env   # then set DATABASE_URL to the Neon dev branch
pnpm dev               # API on http://localhost:8080
```

Read [CLAUDE.md](./CLAUDE.md) for the working rules and
[docs/adr](./docs/adr) for the architecture decisions.
