import { useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronRight,
  ChevronsUpDown,
  LogOut,
  Menu as MenuIcon,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Rocket,
  Search,
  Settings,
  Sprout,
  Sun,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Link,
  NavLink,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
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
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input, Label } from '@/components/ui/input';
import { WithTooltip } from '@/components/ui/tooltip';
import { useTheme } from '@/lib/theme';
import { useIsMobile } from '@/lib/use-media-query';
import { cn, initials } from '@/lib/utils';
import { useOnboardingStatus } from '@/pages/overview/hooks';
import { CommandPalette } from './command-palette';
import { DOCS_URL, DocsIcon, NAV_GROUPS, type NavItem } from './nav';
import { OrgContext, orgPath, useOrg, type OrgContextValue } from './org-context';
import { FullPageSkeleton } from './shell-skeleton';

const COLLAPSE_KEY = 'postrail.sidebar-collapsed';

/**
 * The console frame: a flat sidebar on the page background and one white content panel
 * with a hairline border, inset from the edges. Everything the user is, or can switch,
 * lives in the sidebar (workspace at the top, account at the bottom); the panel is only
 * ever the page. Under 1024px the sidebar becomes a drawer behind a small header.
 */
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
  const openSearch = () => setSearchOpen(true);

  return (
    <OrgContext.Provider value={ctx}>
      <div className="flex min-h-screen bg-bg-subtle">
        {!isMobile ? (
          <aside
            className={cn(
              'sticky top-0 hidden h-screen shrink-0 flex-col transition-[width] duration-200 lg:flex',
              collapsed ? 'w-[var(--sidebar-width-collapsed)]' : 'w-[var(--sidebar-width)]',
            )}
            aria-label="Sidebar"
          >
            <SidebarContent
              collapsed={collapsed}
              onToggle={toggleCollapsed}
              onSearch={openSearch}
            />
          </aside>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col p-2 lg:py-3 lg:pl-0 lg:pr-3">
          {isMobile ? (
            <div className="mb-2 flex h-11 items-center gap-2 px-1">
              <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Open navigation"
                  onClick={() => setDrawerOpen(true)}
                >
                  <MenuIcon />
                </Button>
                <DrawerContent aria-label="Navigation">
                  <SidebarContent collapsed={false} onSearch={openSearch} />
                </DrawerContent>
              </Dialog>
              <Logo variant="light" className="h-7 w-auto dark:hidden" />
              <Logo variant="dark" className="hidden h-7 w-auto dark:block" />
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto"
                aria-label="Search"
                onClick={openSearch}
              >
                <Search />
              </Button>
            </div>
          ) : null}

          <main className="flex min-h-[calc(100vh-24px)] flex-1 flex-col overflow-hidden rounded-xl border border-border bg-bg shadow-xs">
            <div className="flex-1 p-4 sm:p-5">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </OrgContext.Provider>
  );
}

function SidebarContent({
  collapsed,
  onToggle,
  onSearch,
}: {
  collapsed: boolean;
  onToggle?: () => void;
  onSearch: () => void;
}) {
  const { orgId = '' } = useParams();
  return (
    <>
      <div
        className={cn(
          'flex h-14 shrink-0 items-center px-4',
          collapsed ? 'justify-center px-0' : 'justify-between',
        )}
      >
        {collapsed ? (
          <LogoIcon className="size-7" />
        ) : (
          <>
            <Logo variant="light" className="h-7 w-auto dark:hidden" />
            <Logo variant="dark" className="hidden h-7 w-auto dark:block" />
            {onToggle ? <CollapseButton collapsed={false} onToggle={onToggle} /> : null}
          </>
        )}
      </div>
      {collapsed && onToggle ? (
        <div className="flex justify-center pb-2">
          <CollapseButton collapsed onToggle={onToggle} />
        </div>
      ) : null}

      <div className={cn('px-3 pb-1', collapsed && 'px-2')}>
        <OrgSwitcher collapsed={collapsed} />
      </div>

      <nav
        className={cn('scrollbar-thin flex-1 overflow-y-auto px-3 py-2', collapsed && 'px-2')}
        aria-label="Main"
      >
        {NAV_GROUPS.map((group, i) => (
          <div key={group.title ?? 'top'}>
            {group.title ? (
              collapsed ? (
                <div className="mx-2 my-2 border-t border-sidebar-border" aria-hidden />
              ) : (
                <p className="mb-1 mt-4 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-fg-faint">
                  {group.title}
                </p>
              )
            ) : null}
            <ul className={cn('space-y-0.5', i === 0 && !collapsed && 'mt-1')}>
              {group.items.map((item) => (
                <li key={item.to || 'home'}>
                  <SidebarLink item={item} orgId={orgId} collapsed={collapsed} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cn('space-y-2 px-3 pb-3', collapsed && 'px-2')}>
        {!collapsed ? <GettingStartedCard /> : null}
        {!collapsed ? <PreviewCard /> : null}
        <UserCard collapsed={collapsed} />
        <div
          className={cn(
            'flex items-center pt-1 text-xs text-fg-muted',
            collapsed ? 'flex-col gap-1' : 'justify-between px-1',
          )}
        >
          <WithTooltip label={collapsed ? 'Documentation' : undefined}>
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className={cn(footerLinkClass, collapsed && 'size-8 justify-center px-0')}
            >
              <DocsIcon />
              {!collapsed ? 'Docs' : null}
            </a>
          </WithTooltip>
          <WithTooltip label={collapsed ? 'Search (Ctrl+K)' : undefined}>
            <button
              type="button"
              onClick={onSearch}
              className={cn(footerLinkClass, collapsed && 'size-8 justify-center px-0')}
              aria-label="Search (Ctrl+K)"
            >
              <Search />
              {!collapsed ? (
                <>
                  Search
                  <kbd className="ml-1 rounded-sm border border-border bg-bg px-1 py-px text-[10px] font-medium text-fg-muted">
                    ⌘K
                  </kbd>
                </>
              ) : null}
            </button>
          </WithTooltip>
        </div>
      </div>
    </>
  );
}

const footerLinkClass =
  'inline-flex h-8 items-center gap-1.5 rounded-md px-2 font-medium text-fg-muted transition-colors hover:bg-sidebar-active hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [&_svg]:size-3.5';

function CollapseButton({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <WithTooltip label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
      <button
        type="button"
        onClick={onToggle}
        className="flex size-8 items-center justify-center rounded-md text-fg-faint transition-colors hover:bg-sidebar-active hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [&_svg]:size-4"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
      </button>
    </WithTooltip>
  );
}

const navItemClass =
  'group flex items-center rounded-md text-[13px] font-medium text-sidebar-fg transition-colors hover:bg-sidebar-active hover:text-sidebar-fg-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-muted';

function SidebarLink({
  item,
  orgId,
  collapsed,
}: {
  item: NavItem;
  orgId: string;
  collapsed: boolean;
}) {
  return (
    <WithTooltip label={collapsed ? item.label : undefined}>
      <NavLink
        to={orgPath(orgId, item.to)}
        end={item.end ?? false}
        aria-label={collapsed ? item.label : undefined}
        className={({ isActive }) =>
          cn(
            navItemClass,
            collapsed ? 'mx-auto size-9 justify-center' : 'h-9 gap-2.5 px-2.5',
            isActive && 'bg-sidebar-active text-sidebar-fg-strong [&_svg]:text-sidebar-fg-strong',
          )
        }
      >
        <item.icon aria-hidden />
        {!collapsed ? <span className="truncate">{item.label}</span> : null}
      </NavLink>
    </WithTooltip>
  );
}

/** White card in the sidebar: workspace switcher, account, getting started. */
const sidebarCardClass =
  'flex w-full items-center gap-2.5 rounded-lg border border-border bg-bg text-left shadow-xs transition-colors hover:bg-bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40';

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
              sidebarCardClass,
              collapsed ? 'mx-auto size-10 justify-center' : 'h-12 px-2.5',
            )}
            aria-label={`Switch workspace (current: ${org.name})`}
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-navy text-xs font-semibold text-white dark:bg-emerald dark:text-navy">
              {initials(org.name)}
            </span>
            {!collapsed ? (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] leading-3 text-fg-muted">Workspace</span>
                  <span className="block truncate text-sm font-semibold leading-5 text-fg">
                    {org.name}
                  </span>
                </span>
                <ChevronsUpDown className="size-4 shrink-0 text-fg-faint" aria-hidden />
              </>
            ) : null}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[calc(var(--sidebar-width)-24px)]">
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
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
            <Plus /> New workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateOrgDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

/** Progress toward a first email, until every step is done. Mirrors the overview card. */
function GettingStartedCard() {
  const { org } = useOrg();
  const status = useOnboardingStatus(org.id);
  if (!status.data) return null;
  const done = [status.data.hasMailbox, status.data.hasApiKey, status.data.hasSent].filter(
    Boolean,
  ).length;
  if (done === 3) return null;
  return (
    <SidebarCardLink to={orgPath(org.id)} icon={<Rocket className="text-primary" />}>
      <span className="flex-1 truncate text-sm font-medium text-fg">Getting started</span>
      <span className="text-xs tabular text-fg-muted">{done}/3</span>
    </SidebarCardLink>
  );
}

function PreviewCard() {
  const { org } = useOrg();
  return (
    <SidebarCardLink to={orgPath(org.id, '/settings/billing')} icon={<Sprout />}>
      <span className="flex-1 truncate text-sm font-medium text-fg">Free preview</span>
    </SidebarCardLink>
  );
}

function SidebarCardLink({
  to,
  icon,
  children,
}: {
  to: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link to={to} className={cn(sidebarCardClass, 'h-10 px-2.5 [&_svg]:size-4 [&_svg]:shrink-0')}>
      <span className="text-fg-muted">{icon}</span>
      {children}
      <ChevronRight className="text-fg-faint" aria-hidden />
    </Link>
  );
}

function UserCard({ collapsed }: { collapsed: boolean }) {
  const { user, org } = useOrg();
  const [theme, , setTheme] = useTheme();
  const client = useQueryClient();
  const navigate = useNavigate();
  const avatar = user.image ? (
    <img
      src={user.image}
      alt=""
      className="size-7 shrink-0 rounded-full"
      referrerPolicy="no-referrer"
    />
  ) : (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald text-xs font-semibold text-navy">
      {initials(user.name || user.email)}
    </span>
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            sidebarCardClass,
            collapsed ? 'mx-auto size-10 justify-center' : 'h-12 px-2.5',
          )}
          aria-label={`Account menu for ${user.email}`}
        >
          {avatar}
          {!collapsed ? (
            <>
              <span className="min-w-0 flex-1 truncate text-sm text-fg">{user.email}</span>
              <ChevronsUpDown className="size-4 shrink-0 text-fg-faint" aria-hidden />
            </>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-[calc(var(--sidebar-width)-24px)]">
        <DropdownMenuLabel className="flex items-center gap-2.5 py-2.5">
          {avatar}
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-fg">
              {user.name || 'Signed in'}
            </span>
            <span className="block truncate font-normal text-fg-muted">{user.email}</span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void navigate(orgPath(org.id, '/settings'))}>
          <Settings /> Account settings
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {theme === 'dark' ? <Moon /> : <Sun />}
            {theme === 'dark' ? 'Dark' : 'Light'}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuCheckboxItem
              checked={theme === 'light'}
              onCheckedChange={() => setTheme('light')}
            >
              Light
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={theme === 'dark'}
              onCheckedChange={() => setTheme('dark')}
            >
              Dark
            </DropdownMenuCheckboxItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await authClient.signOut();
            client.setQueryData(meKey, null);
            await client.invalidateQueries();
            void navigate('/login');
          }}
        >
          <LogOut /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
            <DialogTitle>New workspace</DialogTitle>
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
              Create workspace
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
