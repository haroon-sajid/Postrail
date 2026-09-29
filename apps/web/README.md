# apps/web

The Postrail dashboard: React 18, Vite, TypeScript, Tailwind 4, Radix-based shadcn-style
components, TanStack Query and React Router. It talks only to the API's `/app/*` routes
with a session cookie, using a client generated from the API's OpenAPI document.

```
pnpm dev          http://localhost:5173, expects the API on http://localhost:8080
pnpm test         vitest + testing-library component tests
pnpm test:e2e     Playwright smoke test; boots an in-memory API on :8091 and vite on :5174
pnpm api:types    regenerate src/api/schema.d.ts from src/api/openapi.json
pnpm build        static bundle in dist/ for Cloudflare Pages
```

Set `VITE_API_ORIGIN` to point the bundle at another API. Design tokens and rules are in
[DESIGN.md](./DESIGN.md); the architecture is in `docs/adr/0007-user-auth-and-dashboard.md`.
