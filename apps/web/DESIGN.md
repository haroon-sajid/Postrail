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

Dark mode redefines the same variables under `.dark` on `<html>`. The account menu offers
Light, Dark and System; the choice is one shared preference (`lib/theme.ts`) kept in
`localStorage` (`postrail.theme`), and System follows the operating system live. Do not
add colour values inside components.

**Type**: Inter with `cv11`/`ss01`. The scale is in px in `tokens.css`: `xs` 13 (meta,
hints), `sm` 14 (body, tables, nav, controls), `base` 15 (card and section titles), `lg`
18 (page titles), `xl` 22, `2xl` 26, `3xl` 32 (big numbers). Use the scale classes, not
`text-[..px]`; the only exceptions are 11–12px pills and the uppercase nav group titles.
The root font size is 15px and only sets the rem, so spacing and control heights scale
with it. Headings carry `-0.01em` tracking. Numbers use tabular figures (`.tabular`,
tables, code).

**Spacing**: 4px grid. Cards pad 20px; card headers 20px × 16px; table cells 16px with
20px at the outer edges; page sections gap 24px; page header bottom margin 24px (32px on
large screens).

**Shape and depth**: 8px radius on controls and cards (`rounded-md`), 12px on cards
(`rounded-lg`) and menus, 16px on dialogs (`rounded-xl`). `shadow-xs` on cards, buttons
and inputs; `shadow-md` on popovers and menus; `shadow-lg` on dialogs and drawers.

**Motion**: overlays fade, modals scale from 96%, sheets and drawers slide, menus drop
4px. All 120–220ms, all disabled under `prefers-reduced-motion`. Classes: `motion-*` in
tokens.css.

## Layout

- Left sidebar, 256px, flat on the page background (no border), collapsible to 64px
  icons with tooltips; under 1024px it becomes a drawer behind a small header. Top to
  bottom: logo with the search and collapse buttons, the workspace card (avatar,
  "Workspace", name), `Home` and `Docs`, then the `Send`, `Observe`, `Develop` and
  `System` groups (the nav scrolls when it does not fit), and pinned under a hairline
  the getting-started card (until done), the free-preview card, the account card
  (avatar, email; opens the profile, theme and log out) and a Help | Updates row. Help
  opens the assistant; Updates lists what shipped (`app/updates.ts`) with a dot until
  it has been opened. Planned features carry a `Soon` pill and open a page that
  describes them (`pages/upcoming`), never a dead link. The active item has a tinted
  background; icons stay neutral. Collapsed, the same order becomes a rail of centred
  square icon buttons: the mark sits on top and turns into the expand control on hover
  or focus, group titles become hairlines, every card shrinks to its icon tile, and
  each icon names itself in a tooltip to its right.
- The workspace card shows a tile with the workspace's initial on a gradient whose hue
  comes from its name, so each workspace keeps one colour everywhere. "Add another
  workspace" opens a modal with the name and an optional "What best describes you?"
  choice; the choice is not stored, it picks the page the new workspace opens on.
- The sidebar stays quiet until it is in use: the search and collapse buttons and the
  nav's scrollbar (`scrollbar-reveal`) only show while the pointer or keyboard focus is
  inside it; on touch screens the buttons are always shown. The logo lines up with the
  workspace tile and the nav icons, not with the card edge.
- `System` is Integrations, Billing and Settings. Settings is one page whose sections
  (Workspace, Members, Profile, Audit log) are tabs with their own routes
  (`SettingsTabs`), so the sidebar keeps a single item for all of them.
- The logo is `LogoMark` (inline SVG) plus the name as live text; never an image of the
  wordmark, so it follows the theme. Sources and rules are in `/brand`.
- Tooltips are light pills with a hairline border, not dark bubbles.
- Routes are flat (`/logs`, `/settings/members`); the active workspace is shell state,
  never part of the URL (ADR 0010).
- No top bar. The page is one white panel with a 12px inset from the sidebar and the
  viewport edges, 12px radius, hairline border. Inside it the `PageHeader` strip carries
  the section icon, the title, a one-line description and the actions, then the content
  with 20px padding. Content spans the panel; tables scroll inside their card. Minimum
  viewport 375px with no horizontal scroll.
- The frame is exactly one viewport tall and the window never scrolls. `PageHeader` is
  portalled into a fixed strip at the top of the panel (`app/page-header-slot.ts`) and
  only the area under it scrolls, so the title and the page's actions are always in
  reach and the scrollbar starts below the header. The scroll position resets when the
  path changes.
- Every `PageHeader` has an Assistant button before the page's own actions. From 1440px
  the assistant docks as a second 380px panel to the right of the page, with a header
  strip that lines up with `PageHeader`, and stays open across pages; below that it is a
  sheet. It answers a fixed list of questions (`app/assistant-topics.ts`) and says so.
- A list page with nothing in it shows `PageEmptyState`: the icon, one sentence and the
  creating action centred in the panel, with no card around them. A snippet or a second
  card that depends on the list appears only once the list has something.
- Settings pages span the panel too (`SettingsLayout`, capped at 1600px for ultrawide
  screens) as a stack of `SettingsSection` cards, each with a title, a one-line
  description, its fields and its action bottom right. Fields go two to a row from `lg`
  so none has to stretch across the panel. Read-only values use `ReadonlyField` so they
  line up with the inputs.
- Billing is a summary strip over underlined tabs (`LineTabsList`): Utilization,
  Payments, Packages, with the open tab in the URL (`?tab=`). Usage figures are real;
  money controls are inert until billing exists and answer with `notAvailableYet`. The
  paid plans in `pages/settings/plans.ts` are placeholders.
- Modals come in three widths: `sm` 448px (confirmations, one or two fields), `md` 528px
  (forms, secrets to copy) and `lg` 672px (search, bulk content). They never exceed the
  viewport height; long content scrolls inside.
- Grids: stat cards 1 → 2 → 4 columns (`sm`, `xl`); two-column detail layouts collapse
  under `lg`. A code snippet goes under its table at full width, never beside it.

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
