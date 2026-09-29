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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
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
              'sticky top-0 hidden h-screen shrink-0 flex-col bg-sidebar text-sidebar-fg transition-[width] lg:flex',
              collapsed ? 'w-[var(--sidebar-width-collapsed)]' : 'w-[var(--sidebar-width)]',
            )}
            aria-label="Sidebar"
          >
            <SidebarContent collapsed={collapsed} onToggle={toggleCollapsed} />
          </aside>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-[var(--topbar-height)] items-center gap-3 border-b border-border bg-bg px-4">
            {isMobile ? (
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
                  <SidebarContent collapsed={false} />
                </DrawerContent>
              </Dialog>
            ) : null}
            <Breadcrumb orgName={ctx.org.name} />
            <Badge tone="success" className="hidden sm:inline-flex">
              Live
            </Badge>
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="secondary"
                size="sm"
                className="hidden gap-2 text-fg-muted sm:inline-flex"
                onClick={() => setSearchOpen(true)}
                aria-label="Search (Ctrl+K)"
              >
                <Search />
                <span className="hidden md:inline">Search</span>
                <kbd className="hidden rounded border border-border px-1 text-[10px] md:inline">
                  ⌘K
                </kbd>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="sm:hidden"
                aria-label="Search"
                onClick={() => setSearchOpen(true)}
              >
                <Search />
              </Button>
              <UserMenu />
            </div>
          </header>

          <main className="mx-auto w-full max-w-[var(--content-max)] flex-1 px-4 py-5 sm:px-6 sm:py-6">
            <Outlet />
          </main>
        </div>
      </div>
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </OrgContext.Provider>
  );
}

function Breadcrumb({ orgName }: { orgName: string }) {
  const { orgId = '' } = useParams();
  const location = useLocation();
  const sub = location.pathname.replace(orgPath(orgId), '');
  const crumbs = breadcrumbFor(sub);
  return (
    <nav aria-label="Breadcrumb" className="min-w-0 truncate text-sm">
      <ol className="flex items-center gap-1.5">
        <li className="truncate text-fg-muted">{orgName}</li>
        {crumbs.map((c) => (
          <li key={c} className="flex items-center gap-1.5">
            <span className="text-fg-faint" aria-hidden>
              /
            </span>
            <span className="text-fg">{c}</span>
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
          'flex h-[var(--topbar-height)] items-center px-3',
          collapsed && 'justify-center',
        )}
      >
        {collapsed ? <LogoIcon /> : <Logo />}
      </div>
      <div className="px-2">
        <OrgSwitcher collapsed={collapsed} />
      </div>
      <nav className="mt-3 flex-1 space-y-4 overflow-y-auto px-2" aria-label="Main">
        <NavGroup items={MAIN_NAV} orgId={orgId} collapsed={collapsed} />
        <NavGroup items={SETTINGS_NAV} orgId={orgId} collapsed={collapsed} title="Settings" />
      </nav>
      <div className="space-y-1 border-t border-white/10 p-2">
        <WithTooltip label={collapsed ? 'Docs' : undefined}>
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noreferrer"
            className={cn(navItemClass, collapsed && 'justify-center px-0')}
          >
            <DocsIcon />
            {!collapsed ? <span>Docs</span> : null}
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
  'flex h-8 items-center gap-2.5 rounded px-2 text-sm text-sidebar-fg hover:bg-sidebar-active hover:text-sidebar-fg-strong [&_svg]:size-4 [&_svg]:shrink-0';

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
        <p className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wide text-sidebar-fg/60">
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
                    isActive && 'bg-sidebar-active text-sidebar-fg-strong',
                  )
                }
              >
                <item.icon />
                {!collapsed ? <span>{item.label}</span> : null}
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
              'flex h-9 w-full items-center gap-2 rounded border border-white/10 px-2 text-left text-sm text-sidebar-fg-strong hover:bg-sidebar-active',
              collapsed && 'justify-center px-0',
            )}
            aria-label={`Switch org (current: ${org.name})`}
          >
            <span className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-emerald text-[10px] font-semibold text-navy">
              {initials(org.name)}
            </span>
            {!collapsed ? (
              <>
                <span className="min-w-0 flex-1 truncate">{org.name}</span>
                <ChevronsUpDown className="size-3.5 text-sidebar-fg" />
              </>
            ) : null}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Organisations</DropdownMenuLabel>
          {orgs.map((o: Org) => (
            <DropdownMenuItem key={o.id} onSelect={() => void navigate(orgPath(o.id))}>
              <span className="flex-1 truncate">{o.name}</span>
              <span className="text-xs text-fg-muted">{o.role}</span>
              {o.id === org.id ? <Check /> : null}
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
        <DialogHeader>
          <DialogTitle>New organisation</DialogTitle>
        </DialogHeader>
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
          <DialogBody>
            <Label htmlFor="org-name">Name</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={80}
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
              Create
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
          className="flex size-8 items-center justify-center rounded-full bg-bg-muted text-xs font-semibold text-fg hover:bg-border"
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
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="truncate">
          <span className="block text-fg">{user.name || 'Signed in'}</span>
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
