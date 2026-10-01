export interface ProductUpdate {
  /** Stable key; the newest one is what "seen" is remembered against. */
  id: string;
  /** ISO date it shipped. */
  date: string;
  title: string;
  body: string;
  /** Where to see it, when it is a place. */
  to?: string;
}

/** What changed in the console, newest first. Add to the top when something ships. */
export const UPDATES: ProductUpdate[] = [
  {
    id: '2026-09-30-assistant',
    date: '2026-09-30',
    title: 'Assistant',
    body: 'Open it from any page header for guided answers that link straight to the right place.',
  },
  {
    id: '2026-09-30-billing',
    date: '2026-09-30',
    title: 'Billing and usage',
    body: 'Sends by day or week, today against your limits, and the plans that are coming.',
    to: '/billing',
  },
  {
    id: '2026-09-30-settings',
    date: '2026-09-30',
    title: 'Settings in one place',
    body: 'Workspace, members and your profile are now tabs of a single Settings page.',
    to: '/settings',
  },
  {
    id: '2026-09-30-urls',
    date: '2026-09-30',
    title: 'Shorter links',
    body: 'Pages no longer carry the workspace id in their address. Old links still work.',
  },
];
