import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * The column every settings page sits in. It fills the panel, so there are no empty
 * gutters beside it; the cap only stops lines running on across an ultrawide monitor.
 */
export function SettingsLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[1600px] space-y-5">{children}</div>;
}

/** Under the "Settings" title on every tab, so the header does not change between them. */
export const SETTINGS_DESCRIPTION = 'This workspace, the people in it and your own account.';

const SETTINGS_TABS: { label: string; to: string; end?: boolean; soon?: boolean }[] = [
  { label: 'Workspace', to: '/settings', end: true },
  { label: 'Members', to: '/settings/members' },
  { label: 'Profile', to: '/settings/profile' },
  { label: 'Audit log', to: '/settings/audit-log', soon: true },
];

/**
 * The sections of Settings, as links: each tab is its own route, so it can be linked to
 * and the back button works. Looks like `LineTabsTrigger`; active comes from aria-current.
 */
export function SettingsTabs() {
  return (
    <nav aria-label="Settings sections" className="scrollbar-thin flex gap-1 overflow-x-auto">
      {SETTINGS_TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end ?? false}
          className="relative inline-flex h-11 shrink-0 items-center gap-2 px-4 text-sm font-medium text-fg-muted transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40 aria-[current=page]:text-fg aria-[current=page]:after:bg-primary"
        >
          {tab.label}
          {tab.soon ? (
            <span className="rounded-full border border-border bg-bg px-1.5 text-[11px] font-medium leading-4 text-fg-muted">
              Soon
            </span>
          ) : null}
        </NavLink>
      ))}
    </nav>
  );
}

/**
 * One block of related settings: what it is, the controls, and its action bottom right.
 * `danger` is for the irreversible ones.
 */
export function SettingsSection({
  title,
  description,
  footer,
  danger = false,
  flush = false,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  danger?: boolean;
  /** Content runs edge to edge (a table), instead of sitting in the section's padding. */
  flush?: boolean;
  children?: ReactNode;
}) {
  return (
    <Card className={cn(danger && 'border-danger/40')}>
      <div className="px-5 pt-5">
        <h2 className="text-base font-semibold leading-6 text-fg">{title}</h2>
        {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
      </div>
      {children ? (
        <div className={flush ? 'mt-4 border-t border-border' : 'space-y-5 px-5 py-5'}>
          {children}
        </div>
      ) : null}
      {footer ? (
        <div className="flex items-center justify-end gap-2 px-5 pb-5">{footer}</div>
      ) : null}
    </Card>
  );
}

/** A value the user can read and copy but not edit, drawn like the inputs around it. */
export function ReadonlyField({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center gap-1 rounded-md border border-border bg-bg-subtle pl-3 pr-1 text-sm text-fg">
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {action}
    </div>
  );
}
