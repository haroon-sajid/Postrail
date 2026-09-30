# Postrail Console design

The console is a developer tool in the spirit of Resend, Twilio and Vercel: light, calm,
data first, usable at 2am. Every screen answers "what happened, and what do I do now"
without decoration. This file is the contract new pages follow.

## Tokens

All tokens live in `src/styles/tokens.css` as CSS variables and are exposed to Tailwind
through `@theme`. Components never hard-code colours, radii or shadows.

| Token                           | Light                             | Use                                                    |
| ------------------------------- | --------------------------------- | ------------------------------------------------------ |
| `navy`                          | `#0F1B2D`                         | Wordmark, avatars, code blocks. Never large surfaces.  |
| `emerald` / `primary`           | `#10B981`                         | Primary actions, success, focus ring, active nav icon. |
| `bg` / `bg-subtle` / `bg-muted` | white / `#F7F8FA` / `#EEF0F3`     | Cards / page and table headers / hover and skeletons   |
| `sidebar` + `sidebar-border`    | `#FAFBFC` / `#E8EAEE`             | Light sidebar, one hairline from the page.             |
| `fg` / `fg-muted` / `fg-faint`  | `#111827` / `#6B7280` / `#9CA3AF` | Text hierarchy: content, labels, hints                 |
| `border` / `border-strong`      | `#E6E8EC` / `#D1D5DB`             | The one border colour; `strong` for hovered inputs.    |
| `warning` / `danger` / `info`   | amber / red / blue                | Each with a `-bg` and `-fg` pair for pills and alerts. |

Dark mode redefines the same variables under `.dark` on `<html>`; the toggle lives in
the user menu and persists to `localStorage` (`postrail.theme`). Do not add colour
values inside components.

**Type**: Inter with `cv11`/`ss01`, 14px base. Page titles 24px semibold, card titles
15px semibold, table text 13px, meta 12px. Headings carry `-0.01em` tracking. Numbers use
tabular figures (`.tabular`, tables, code).

**Spacing**: 4px grid. Cards pad 20px; card headers 20px × 16px; table cells 16px with
20px at the outer edges; page sections gap 24px; page header bottom margin 24px (32px on
large screens).

**Shape and depth**: 8px radius on controls and cards (`rounded-md`), 12px on cards
(`rounded-lg`) and menus, 16px on dialogs (`rounded-xl`). `shadow-xs` on cards, buttons
and inputs; `shadow-md` on popovers and menus; `shadow-lg` on dialogs and drawers.

**Motion**: overlays fade, modals scale from 97%, sheets and drawers slide, menus drop
4px. All 120–220ms, all disabled under `prefers-reduced-motion`. Classes: `motion-*` in
tokens.css.

## Layout

- Left sidebar, 256px, flat on the page background (no border), collapsible to 64px
  icons with tooltips; under 1024px it becomes a drawer behind a small header. Top to
  bottom: wordmark + collapse toggle, the workspace card (avatar, "Workspace", name),
  `Home` then the `Send`, `Data`, `Develop` and `Settings` groups, and at the bottom
  the getting-started card (until done), the free-preview card, the account card (avatar,
  email; opens account settings, theme and log out) and a Docs / Search row. The active
  item has a tinted background; icons stay neutral.
- No top bar. The page is one white panel with a 12px inset from the sidebar and the
  viewport edges, 12px radius, hairline border. Inside it the `PageHeader` strip carries
  the section icon, the title (16px semibold), a one-line description and the actions,
  then the content with 20px padding. Content spans the panel; tables scroll inside
  their card. Minimum viewport 375px with no horizontal scroll.
- Grids: stat cards 1 → 2 → 4 columns (`sm`, `xl`); two-column detail layouts collapse
  under `lg`; side-by-side table + snippet only from `2xl`.

## Component conventions

- **Lists** always have three states: skeleton rows while loading (same height as real
  rows, so nothing shifts), an empty state (icon tile, one sentence, the creating action)
  and an error state with a retry button. No spinners in page bodies.
- **Tables** have a tinted header row, 48px body rows, hover on clickable rows, and a
  tinted footer for pagination. Ids, prefixes and emails get a `CopyButton`.
- **Stat cards** show label, a 30px number, a delta pill (green good, red bad, grey flat)
  and a one-line hint. Hide the pill when there is no baseline.
- **Mutations** show a toast (sonner, bottom-right) on success and failure. Update the
  cache optimistically only for toggles and deletes; everything else invalidates.
- **Destructive actions** open `ConfirmDialog`. Deleting an org requires typing its name.
- **Secrets** (API keys, webhook secrets) appear once, in a `SecretReveal` box with a
  copy button and a warning line. Never in a list.
- **Dates**: relative in tables (`3m ago`) with the absolute time in the user's timezone
  as the title; absolute in drawers and detail views. One helper: `src/lib/format.ts`.
- **Status** is a `StatusPill`: emerald for sent/active/delivered, blue pulsing for
  sending, amber for paused or pending, red for failed/disconnected, grey for queued.
- **Forms** use react-hook-form with zod schemas from `@postrail/shared/browser`, inline
  field errors under the input, and the submit button disabled while pending.
- **Keyboard**: every interactive element is a real button or link; dialogs trap focus
  and close on Escape; tables are navigable by Tab; `Cmd+K` opens search.
- **Contrast**: text on surfaces meets WCAG AA. Muted text is `fg-muted`, never
  `fg-faint`, when it carries information.

## Reviewing a page

`SHOTS=1 pnpm exec playwright test screenshots` captures every route at 1920, 1280, 768
and 375 into `test-results/screens`. Look at all four before calling a page done.

## Files

```
src/styles/tokens.css    tokens + Tailwind theme + base styles + motion
src/components/ui/*      shadcn-style primitives (button, card, dialog, table, ...)
src/components/*         console widgets (PageHeader, StatusPill, CopyButton, states, ...)
src/app/*                shell: routes, sidebar, topbar, org switcher, command palette
src/pages/<area>/*       one folder per nav item
src/api/*                generated OpenAPI types, fetch client, TanStack Query hooks
src/lib/*                formatting, utils, theme, media queries
```
