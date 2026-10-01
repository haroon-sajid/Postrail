# 0010. Dashboard URLs without the org id

Date: 2026-09-30
Status: Accepted (amends 0007: the dashboard no longer routes on `/o/:orgId/*`)

## Context

Every dashboard route carried the active org: `/o/{orgId}/settings`. The uuid made URLs
long and unreadable, and it told the user nothing, because the workspace they are in is
already shown in the sidebar. Most users have one org.

## Decision

Dashboard routes are flat: `/`, `/logs`, `/mailboxes`, `/api-keys`, `/templates`,
`/webhooks`, `/suppressions`, `/settings`, `/settings/members`, `/settings/billing`.

The active org is client state owned by the shell (`apps/web/src/app/shell.tsx`). It is
remembered per browser in `localStorage` (`apps/web/src/lib/active-org.ts`) and resolved
against the orgs returned by `GET /app/me`; an id the user does not belong to falls back
to their first org. `switchOrg` on the org context changes it and returns to `/`, since
whatever was on screen belonged to the org being left. Accepting an invite and creating a
workspace make that org the active one.

Nothing changes on the API. The dashboard still calls `/app/orgs/{orgId}/...`, and
`requireOrgMember` still decides access on every request, so the stored id is a
preference and never an authorisation. Old `/o/{orgId}/...` links are kept alive by a
router loader that stores the org and redirects to the clean path with its query string.

Dashboard paths must stay clear of the prefixes the Worker proxies to the API (0009:
`/api/`, `/v1/`, `/app/`, `/docs`, `/openapi.json`, `/health`). `/api-keys` is safe
because the proxy matches `/api/` with its trailing slash; `worker.test.ts` pins that.

## Consequences

- URLs are short and the same for every workspace, so a link no longer says which org it
  is about. A link shared between two members of different orgs opens in each person's
  own active org; resource ids in the path (`/webhooks/{id}`) then 404 for the other org.
- The active org is per browser, not per tab. Two tabs keep working independently, but a
  reload picks up whichever org was chosen last.
- Adding a top-level dashboard route means checking it against the proxied prefixes.
