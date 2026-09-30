# apps/web

The Postrail dashboard: React 18, Vite, TypeScript, Tailwind 4, Radix-based shadcn-style
components, TanStack Query and React Router. It talks only to the API's `/app/*` routes
with a session cookie, using a client generated from the API's OpenAPI document.

```
pnpm dev          http://localhost:5173, expects the API on http://localhost:8080
pnpm test         vitest + testing-library component tests
pnpm test:e2e     Playwright smoke test; boots an in-memory API on :8091 and vite on :5174
pnpm api:types    regenerate src/api/schema.d.ts from src/api/openapi.json
pnpm build        static bundle in dist/, served by the Worker in src/worker.ts
```

The API URL comes from `src/lib/config.ts`: `VITE_API_URL` when set (baked in at build
time), `http://localhost:8080` on localhost, otherwise the page's own origin, where
`src/worker.ts` proxies `/api`, `/v1`, `/app`, `/openapi.json`, `/docs` and `/health` to
the API. See `docs/deploy.md`. Design tokens and rules are in [DESIGN.md](./DESIGN.md); the
architecture is in `docs/adr/0007-user-auth-and-dashboard.md`.
