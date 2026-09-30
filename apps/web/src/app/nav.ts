import {
  BookOpen,
  Building2,
  CreditCard,
  FileText,
  Home,
  Inbox,
  KeyRound,
  ListFilter,
  ShieldBan,
  Users,
  Webhook,
  type LucideIcon,
} from 'lucide-react';
import { PUBLIC_API_URL } from '@/lib/config';

export interface NavItem {
  label: string;
  /** Path under the org, '' for the overview. */
  to: string;
  icon: LucideIcon;
  /** Exact match for the index route so it is not highlighted for every child. */
  end?: boolean;
}

export interface NavGroup {
  /** Uppercase section label. Omitted for the top-level items. */
  title?: string;
  items: NavItem[];
}

/** The sidebar, top to bottom. Titles follow what the user is doing, not our modules. */
export const NAV_GROUPS: NavGroup[] = [
  { items: [{ label: 'Home', to: '', icon: Home, end: true }] },
  {
    title: 'Send',
    items: [
      { label: 'Mailboxes', to: '/mailboxes', icon: Inbox },
      { label: 'Templates', to: '/templates', icon: FileText },
    ],
  },
  {
    title: 'Data',
    items: [
      { label: 'Logs', to: '/logs', icon: ListFilter },
      { label: 'Suppressions', to: '/suppressions', icon: ShieldBan },
    ],
  },
  {
    title: 'Develop',
    items: [
      { label: 'API Keys', to: '/api-keys', icon: KeyRound },
      { label: 'Webhooks', to: '/webhooks', icon: Webhook },
    ],
  },
  {
    title: 'Settings',
    items: [
      { label: 'General', to: '/settings', icon: Building2, end: true },
      { label: 'Members', to: '/settings/members', icon: Users },
      { label: 'Billing', to: '/settings/billing', icon: CreditCard },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export const DOCS_URL = `${PUBLIC_API_URL}/docs`;
export const DocsIcon = BookOpen;

/** The nav item that owns `subPath` (e.g. "/webhooks/123" belongs to Webhooks). */
export function navItemFor(subPath: string): NavItem | undefined {
  return ALL_NAV_ITEMS.filter((n) =>
    n.end ? subPath === n.to : n.to !== '' && subPath.startsWith(n.to),
  ).sort((a, b) => b.to.length - a.to.length)[0];
}

/** Breadcrumb labels for a path, e.g. "/settings/members" -> ["Settings", "Members"]. */
export function breadcrumbFor(subPath: string): string[] {
  const match = navItemFor(subPath);
  if (!match) return subPath === '' ? ['Home'] : ['Not found'];
  return subPath.startsWith('/settings') ? ['Settings', match.label] : [match.label];
}
