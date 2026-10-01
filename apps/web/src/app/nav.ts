import {
  BarChart3,
  BellRing,
  BookOpen,
  Contact,
  CreditCard,
  FileText,
  FlaskConical,
  Home,
  Inbox,
  KeyRound,
  ListFilter,
  Plug,
  Send,
  Settings,
  ShieldBan,
  Webhook,
  type LucideIcon,
} from 'lucide-react';
import { PUBLIC_API_URL } from '@/lib/config';

export const DOCS_URL = `${PUBLIC_API_URL}/docs`;

export interface NavItem {
  label: string;
  /** Route path, '/' for the overview. For an external item, its URL. */
  to: string;
  icon: LucideIcon;
  /** Exact match for the index route so it is not highlighted for every child. */
  end?: boolean;
  /** `soon` marks a page that only describes a planned feature (pages/upcoming). */
  badge?: 'soon';
  /** Leaves the console: opens in a new tab and is never the current page. */
  external?: boolean;
}

export interface NavGroup {
  /** Uppercase section label. Omitted for the top-level items. */
  title?: string;
  items: NavItem[];
}

/**
 * The sidebar, top to bottom. Titles follow what the user is doing, not our modules.
 * System holds what is configured once; members, profile and the audit log are tabs of
 * Settings rather than items of their own.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { label: 'Home', to: '/', icon: Home, end: true },
      { label: 'Docs', to: DOCS_URL, icon: BookOpen, external: true },
    ],
  },
  {
    title: 'Send',
    items: [
      { label: 'Mailboxes', to: '/mailboxes', icon: Inbox },
      { label: 'Templates', to: '/templates', icon: FileText },
      { label: 'Broadcasts', to: '/broadcasts', icon: Send, badge: 'soon' },
      { label: 'Contacts', to: '/contacts', icon: Contact, badge: 'soon' },
    ],
  },
  {
    title: 'Observe',
    items: [
      { label: 'Logs', to: '/logs', icon: ListFilter },
      { label: 'Metrics', to: '/metrics', icon: BarChart3, badge: 'soon' },
      { label: 'Suppressions', to: '/suppressions', icon: ShieldBan },
      { label: 'Alerts', to: '/alerts', icon: BellRing, badge: 'soon' },
    ],
  },
  {
    title: 'Develop',
    items: [
      { label: 'API Keys', to: '/api-keys', icon: KeyRound },
      { label: 'Webhooks', to: '/webhooks', icon: Webhook },
      { label: 'Playground', to: '/playground', icon: FlaskConical, badge: 'soon' },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Integrations', to: '/integrations', icon: Plug, badge: 'soon' },
      { label: 'Billing', to: '/billing', icon: CreditCard },
      { label: 'Settings', to: '/settings', icon: Settings },
    ],
  },
];

const ROUTED_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items).filter((n) => !n.external);

/** The nav item that owns `path` (e.g. "/webhooks/123" belongs to Webhooks). */
export function navItemFor(path: string): NavItem | undefined {
  return ROUTED_ITEMS.filter((n) => (n.end ? path === n.to : path.startsWith(n.to))).sort(
    (a, b) => b.to.length - a.to.length,
  )[0];
}
