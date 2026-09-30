import { useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronsUpDown,
  LogOut,
  Menu as MenuIcon,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Sun,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { authClient } from '@/api/auth';
import { errorMessage } from '@/api/client';
import { meKey, useCreateOrg, useMe, type Org } from '@/api/me';
import { Logo, LogoIcon } from '@/components/logo';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DrawerContent,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input, Label } from '@/components/ui/input';
import { WithTooltip } from '@/components/ui/tooltip';
import { useTheme } from '@/lib/theme';
import { useIsMobile } from '@/lib/use-media-query';
import { cn, initials } from '@/lib/utils';
import { CommandPalette } from './command-palette';
import { breadcrumbFor, DOCS_URL, DocsIcon, MAIN_NAV, SETTINGS_NAV, type NavItem } from './nav';
import { OrgContext, orgPath, useOrg, type OrgContextValue } from './org-context';
import { FullPageSkeleton } from './shell-skeleton';

const COLLAPSE_KEY = 'postrail.sidebar-collapsed';

export function AppShell() {
  const { orgId = '' } = useParams();
  const me = useMe();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  // The drawer remembers the path it was opened on, so navigating closes it without an effect.
  const [drawer, setDrawer] = useState<{ open: boolean; path: string }>({ open: false, path: '' });
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();
  const drawerOpen = drawer.open && drawer.path === location.pathname;
  const setDrawerOpen = (open: boolean) => setDrawer({ open, path: location.pathname });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const org = me.data?.orgs.find((o) => o.id === orgId);
  const ctx = useMemo<OrgContextValue | null>(() => {
    if (!me.data || !org) return null;
    return {
      org,
      orgs: me.data.orgs,
      user: me.data.user,
      canManage: org.role === 'owner' || org.role === 'admin',
      isOwner: org.role === 'owner',
    };
  }, [me.data, org]);

  if (me.isPending) return <FullPageSkeleton />;
  if (!ctx) {
    const first = me.data?.orgs[0];
    return <Navigate to={first ? orgPath(first.id) : '/login'} replace />;
  }

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      return !c;
    });
  };

  return (
    <OrgContext.Provider value={ctx}>
      <div className="flex min-h-screen bg-bg-subtle">
        {!isMobile ? (
          <aside
            className={cn(
              'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:flex',
              collapsed ? 'w-[var(--sidebar-width-collapsed)]' : 'w-[var(--sidebar-width)]',
            )}
            aria-label="Sidebar"
          >
            <SidebarContent collapsed={collapsed} onToggle={toggleCollapsed} />
          </aside>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-[var(--topbar-height)] items-center gap-3 border-b border-border bg-bg/85 px-4 backdrop-blur sm:px-6 lg:px-8">
            {isMobile ? (
              <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="-ml-2"
                  aria-label="Open navigation"
                  onClick={() => setDrawerOpen(true)}
                >
                  <MenuIcon />
                </Button>
                <DrawerContent aria-label="Navigation">
                  <SidebarContent collapsed={false} />
                </DrawerContent>
              </Dialog>
            ) : null}
            <Breadcrumb orgName={ctx.org.name} />
            <div className="ml-auto flex items-center gap-2">
              <LiveBadge />
              <button
                type="button"
                className="hidden h-9 w-60 items-center gap-2 rounded-md border border-border bg-bg-subtle px-3 text-sm text-fg-muted shadow-xs transition-colors hover:border-border-strong hover:bg-bg md:flex"
                onClick={() => setSearchOpen(true)}
                aria-label="Search (Ctrl+K)"
              >
                <Search className="size-4" />
                <span className="flex-1 text-left">Search…</span>
                <kbd className="rounded-sm border border-border bg-bg px-1.5 py-0.5 text-[10px] font-medium text-fg-muted">
                  ⌘K
                </kbd>
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Search"
                onClick={() => setSearchOpen(true)}
              >
                <Search />
              </Button>
              <WithTooltip label="Documentation">
                <Button asChild variant="ghost" size="icon" className="hidden sm:inline-flex">
                  <a href={DOCS_URL} target="_blank" rel="noreferrer" aria-label="Documentation">
                    <DocsIcon />
                  </a>
                </Button>
              </WithTooltip>
              <UserMenu />
            </div>
          </header>

          <main className="mx-auto w-full max-w-[var(--content-max)] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <Outlet />
          </main>
        </div>
      </div>
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </OrgContext.Provider>
  );
}

function LiveBadge() {
  return (
    <span
      className="hidden items-center gap-1.5 rounded-full border border-success/25 bg-success-bg px-2.5 py-1 text-xs font-medium text-success-fg sm:inline-flex"
      title="Sending through real mailboxes"
    >
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
        <span className="relative inline-flex size-1.5 rounded-full bg-success" />
      </span>
      Live
    </span>
  );
}

function Breadcrumb({ orgName }: { orgName: string }) {
  const { orgId = '' } = useParams();
  const location = useLocation();
  const sub = location.pathname.replace(orgPath(orgId), '');
  const crumbs = breadcrumbFor(sub);
  return (
    <nav aria-label="Breadcrumb" className="min-w-0 truncate text-sm">
      <ol className="flex items-center gap-2">
        <li className="hidden truncate text-fg-muted sm:block">{orgName}</li>
        {crumbs.map((c, i) => (
          <li key={c} className="flex items-center gap-2">
            <span className={cn('text-fg-faint', i === 0 && 'hidden sm:inline')} aria-hidden>
              /
            </span>
            <span className={cn(i === crumbs.length - 1 ? 'font-medium text-fg' : 'text-fg-muted')}>
              {c}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function SidebarContent({ collapsed, onToggle }: { collapsed: boolean; onToggle?: () => void }) {
  const { orgId = '' } = useParams();
  return (
    <>
      <div
        className={cn(
          'flex h-[var(--topbar-height)] shrink-0 items-center px-4',
          collapsed && 'justify-center px-0',
        )}
      >
        {collapsed ? (
          <LogoIcon className="size-7" />
        ) : (
          <>
            <Logo variant="light" className="h-8 w-auto dark:hidden" />
            <Logo variant="dark" className="hidden h-8 w-auto dark:block" />
          </>
        )}
      </div>
      <div className={cn('px-3 pb-2', collapsed && 'px-2')}>
        <OrgSwitcher collapsed={collapsed} />
      </div>
      <nav
        className={cn(
          'scrollbar-thin flex-1 space-y-6 overflow-y-auto px-3 py-3',
          collapsed && 'px-2',
        )}
        aria-label="Main"
      >
        <NavGroup items={MAIN_NAV} orgId={orgId} collapsed={collapsed} title="Workspace" />
        <NavGroup items={SETTINGS_NAV} orgId={orgId} collapsed={collapsed} title="Settings" />
      </nav>
      <div className={cn('space-y-0.5 border-t border-sidebar-border p-3', collapsed && 'p-2')}>
        <WithTooltip label={collapsed ? 'Docs' : undefined}>
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noreferrer"
            className={cn(navItemClass, collapsed && 'justify-center px-0')}
          >
            <DocsIcon />
            {!collapsed ? <span>Documentation</span> : null}
          </a>
        </WithTooltip>
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            className={cn(navItemClass, 'w-full', collapsed && 'justify-center px-0')}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            {!collapsed ? <span>Collapse</span> : null}
          </button>
        ) : null}
      </div>
    </>
  );
}

const navItemClass =
  'group flex h-9 items-center gap-3 rounded-md px-2.5 text-sm font-medium text-sidebar-fg transition-colors hover:bg-sidebar-active hover:text-sidebar-fg-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-faint group-hover:[&_svg]:text-sidebar-fg-strong';

function NavGroup({
  items,
  orgId,
  collapsed,
  title,
}: {
  items: NavItem[];
  orgId: string;
  collapsed: boolean;
  title?: string;
}) {
  return (
    <div>
      {title && !collapsed ? (
        <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-fg-faint">
          {title}
        </p>
      ) : null}
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.to || 'overview'}>
            <WithTooltip label={collapsed ? item.label : undefined}>
              <NavLink
                to={orgPath(orgId, item.to)}
                end={item.end ?? false}
                className={({ isActive }) =>
                  cn(
                    navItemClass,
                    collapsed && 'justify-center px-0',
                    isActive &&
                      'bg-sidebar-active text-sidebar-fg-strong shadow-xs [&_svg]:text-primary',
                  )
                }
              >
                <item.icon />
                {!collapsed ? <span className="truncate">{item.label}</span> : null}
              </NavLink>
            </WithTooltip>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OrgSwitcher({ collapsed }: { collapsed: boolean }) {
  const { org, orgs } = useOrg();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex h-10 w-full items-center gap-2.5 rounded-md border border-border bg-bg px-2.5 text-left text-sm shadow-xs transition-colors hover:bg-bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
              collapsed && 'justify-center px-0',
            )}
            aria-label={`Switch org (current: ${org.name})`}
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-navy text-[11px] font-semibold text-white dark:bg-emerald dark:text-navy">
              {initials(org.name)}
            </span>
            {!collapsed ? (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-fg">{org.name}</span>
                  <span className="block truncate text-[11px] capitalize leading-3 text-fg-muted">
                    {org.role}
                  </span>
                </span>
                <ChevronsUpDown className="size-4 shrink-0 text-fg-faint" />
              </>
            ) : null}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel>Organisations</DropdownMenuLabel>
          {orgs.map((o: Org) => (
            <DropdownMenuItem key={o.id} onSelect={() => void navigate(orgPath(o.id))}>
              <span className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-bg-muted text-[10px] font-semibold text-fg">
                {initials(o.name)}
              </span>
              <span className="flex-1 truncate">{o.name}</span>
              <span className="text-xs capitalize text-fg-muted">{o.role}</span>
              {o.id === org.id ? <Check className="!text-primary" /> : null}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreating(true)}>
            <Plus /> New organisation
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateOrgDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

function CreateOrgDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [name, setName] = useState('');
  const create = useCreateOrg();
  const navigate = useNavigate();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const org = await create.mutateAsync(name.trim());
              toast.success(`Created ${org.name}`);
              onOpenChange(false);
              setName('');
              void navigate(orgPath(org.id));
            } catch (error) {
              toast.error(errorMessage(error));
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>New organisation</DialogTitle>
            <DialogDescription>
              A separate workspace with its own mailboxes, keys and members.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Label htmlFor="org-name">Name</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={80}
              placeholder="Acme Inc."
            />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!name.trim()}
              loading={create.isPending}
            >
              Create organisation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UserMenu() {
  const { user } = useOrg();
  const [theme, toggleTheme] = useTheme();
  const client = useQueryClient();
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex size-8 items-center justify-center rounded-full bg-navy text-xs font-semibold text-white ring-2 ring-bg ring-offset-1 ring-offset-border transition hover:ring-offset-border-strong focus-visible:outline-none focus-visible:ring-ring dark:bg-emerald dark:text-navy"
          aria-label={`Account menu for ${user.email}`}
        >
          {user.image ? (
            <img
              src={user.image}
              alt=""
              className="size-8 rounded-full"
              referrerPolicy="no-referrer"
            />
          ) : (
            initials(user.name || user.email)
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="truncate">
          <span className="block text-sm text-fg">{user.name || 'Signed in'}</span>
          <span className="block font-normal text-fg-muted">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={toggleTheme}>
          {theme === 'dark' ? <Sun /> : <Moon />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await authClient.signOut();
            client.setQueryData(meKey, null);
            await client.invalidateQueries();
            void navigate('/login');
          }}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
