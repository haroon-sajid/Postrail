# Postrail Console design

The console is a developer tool in the spirit of the Twilio Console: dense but calm,
data first, usable at 2am. Every screen answers "what happened, and what do I do now"
without decoration. This file is the contract new pages follow.

## Tokens

All tokens live in `src/styles/tokens.css` as CSS variables and are exposed to Tailwind
through `@theme`. Components never hard-code colours, radii or shadows.

| Token                          | Light             | Use                                                    |
| ------------------------------ | ----------------- | ------------------------------------------------------ |
| `navy`                         | `#0F1B2D`         | Sidebar background, wordmark                           |
| `emerald`                      | `#12B981`         | Primary actions, success, focus ring. Nothing else.    |
| `off-white`                    | `#F5F5F2`         | Brand light surface (login card backdrop)              |
| `bg` / `bg-subtle`             | white / `#F7F7F5` | Cards / page background                                |
| `fg` / `fg-muted` / `fg-faint` | greys             | Text hierarchy: content, labels, hints                 |
| `border`                       | `#E4E4E0`         | The one border colour. Use `border-strong` for inputs. |
| `warning`                      | amber             | Warnings and paused/degraded states                    |
| `danger`                       | red               | Destructive actions and failures                       |

Dark mode redefines the same variables under `.dark` on `<html>`; the toggle lives in
the user menu and persists to `localStorage` (`postrail.theme`). Do not add colour
values inside components.

**Type**: Inter, 14px base, 13px in table rows, 11px for meta. Numbers use tabular
figures (`font-variant-numeric: tabular-nums` is on tables, code and `.tabular`).

**Spacing**: 4px grid (Tailwind's default scale). Cards pad 16px; page sections gap 24px.

**Shape**: 6px radius everywhere; 4px for pills; 8px only for dialogs. Shadows are
`shadow-sm` on cards and `shadow-md` on popovers; never on buttons.

## Layout

- Left sidebar, 240px, collapsible to 56px icons; on screens under 1024px it becomes a
  drawer opened from the top bar. Logo, org switcher, nav groups, Settings, Docs link.
- Top bar, 48px: breadcrumb, `Live` environment badge, global search (`Cmd+K`), user menu.
- Page: title (20px) + one-line description on the left, primary action on the right.
  Content in cards, max width 1280px, 16px side gutter on mobile (375px minimum).

## Component conventions

- **Lists** always have three states: skeleton rows while loading (same height as real
  rows, so nothing shifts), an empty state with one sentence and a link to docs or the
  creating action, and an error state with a retry button. No spinners in page bodies.
- **Mutations** show a toast (sonner, bottom-right) on success and failure. Update the
  cache optimistically only for toggles and deletes; everything else invalidates.
- **Destructive actions** open `ConfirmDialog`. Deleting an org requires typing its name.
- **Secrets** (API keys, webhook secrets) appear once, in a `SecretReveal` box with a
  copy button and a warning line. Never in a list.
- **Ids, key prefixes and emails** get a `CopyButton` wherever they appear.
- **Dates**: relative in tables (`3m ago`) with the absolute time in the user's timezone
  as the title; absolute in drawers and detail views. One helper: `src/lib/format.ts`.
- **Status** is a `StatusPill`: emerald for sent/active/delivered, amber for paused or
  pending, red for failed/disconnected, grey for queued/sending.
- **Forms** use react-hook-form with zod schemas from `@postrail/shared`, inline field
  errors under the input, and the submit button disabled while pending.
- **Keyboard**: every interactive element is a real button or link; dialogs trap focus
  and close on Escape; tables are navigable by Tab; `Cmd+K` opens search.
- **Contrast**: text on surfaces meets WCAG AA. Muted text is `fg-muted`, never
  `fg-faint`, when it carries information.

## Files

```
src/styles/tokens.css    tokens + Tailwind theme + base styles
src/components/ui/*      shadcn-style primitives (button, card, dialog, table, ...)
src/components/*         console widgets (PageHeader, StatusPill, CopyButton, ...)
src/app/*                shell: routes, sidebar, topbar, providers
src/pages/<area>/*       one folder per nav item
src/api/*                generated OpenAPI types, fetch client, TanStack Query hooks
src/lib/*                formatting, utils
```
