<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/postrail-logo-dark.svg" />
    <img src="brand/postrail-logo.svg" alt="Postrail" width="280" />
  </picture>
</p>

# Postrail

Multi-tenant email API. Tenants connect their own Gmail or Outlook mailbox and send
application email through it via a REST API.

## Getting started

```
pnpm install
cp .env.example .env   # then set DATABASE_URL to the Neon dev branch
pnpm dev               # API on http://localhost:8080
```

Read [CLAUDE.md](./CLAUDE.md) for the working rules,
[docs/adr](./docs/adr) for the architecture decisions and
[docs/deploy.md](./docs/deploy.md) for the Cloudflare and Render setup.
