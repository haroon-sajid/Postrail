import {
  BookOpen,
  Building2,
  CreditCard,
  FileText,
  Inbox,
  KeyRound,
  LayoutDashboard,
  ListFilter,
  ShieldBan,
  Users,
  Webhook,
  type LucideIcon,
} from 'lucide-react';
import { PUBLIC_API_URL } from '@/lib/config';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Exact match for the index route so it is not highlighted for every child. */
  end?: boolean;
}

export const MAIN_NAV: NavItem[] = [
  { label: 'Overview', to: '', icon: LayoutDashboard, end: true },
  { label: 'Logs', to: '/logs', icon: ListFilter },
  { label: 'Mailboxes', to: '/mailboxes', icon: Inbox },
  { label: 'API Keys', to: '/api-keys', icon: KeyRound },
  { label: 'Templates', to: '/templates', icon: FileText },
  { label: 'Webhooks', to: '/webhooks', icon: Webhook },
  { label: 'Suppressions', to: '/suppressions', icon: ShieldBan },
];

export const SETTINGS_NAV: NavItem[] = [
  { label: 'General', to: '/settings', icon: Building2, end: true },
  { label: 'Members', to: '/settings/members', icon: Users },
  { label: 'Billing', to: '/settings/billing', icon: CreditCard },
];

export const DOCS_URL = `${PUBLIC_API_URL}/docs`;
export const DocsIcon = BookOpen;

/** Breadcrumb label for the current path, e.g. "/settings/members" -> ["Settings", "Members"]. */
export function breadcrumbFor(subPath: string): string[] {
  const all = [...MAIN_NAV, ...SETTINGS_NAV];
  const settings = subPath.startsWith('/settings');
  const match = all
    .filter((n) => (n.end ? subPath === n.to : n.to !== '' && subPath.startsWith(n.to)))
    .sort((a, b) => b.to.length - a.to.length)[0];
  if (!match) return subPath === '' ? ['Overview'] : ['Not found'];
  return settings ? ['Settings', match.label] : [match.label];
}
