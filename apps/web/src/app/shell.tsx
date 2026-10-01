import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpRight,
  ChevronRight,
  ChevronsUpDown,
  Info,
  LogOut,
  Megaphone,
  Menu as MenuIcon,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Rocket,
  Search,
  Settings,
  Sprout,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { authClient } from '@/api/auth';
import { meKey, useMe } from '@/api/me';
import { Logo, LogoMark } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTitle, DrawerContent, SheetContent } from '@/components/ui/dialog';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { WithTooltip } from '@/components/ui/tooltip';
import { readActiveOrgId, writeActiveOrgId } from '@/lib/active-org';
import { formatDay } from '@/lib/format';
import { useTheme, type ThemePreference } from '@/lib/theme';
import { useIsMobile, useMediaQuery } from '@/lib/use-media-query';
import { cn, initials } from '@/lib/utils';
import { useOnboardingStatus } from '@/pages/overview/hooks';
import { AssistantPanel } from './assistant';
import { AssistantContext, useAssistant, type AssistantContextValue } from './assistant-context';
import { CommandPalette } from './command-palette';
import { NAV_GROUPS, type NavItem } from './nav';
import { OrgContext, useOrg, type OrgContextValue } from './org-context';
import { OrgSwitcher } from './org-switcher';
import { PageHeaderSlotContext } from './page-header-slot';
import { FullPageSkeleton } from './shell-skeleton';
import { sidebarCardClass } from './sidebar-styles';
import { UPDATES } from './updates';

const COLLAPSE_KEY = 'postrail.sidebar-collapsed';
const ASSISTANT_KEY = 'postrail.assistant-open';

/**
 * The console frame: a flat sidebar on the page background and one white content panel
 * with a hairline border, inset from the edges. Everything the user is, or can switch,
 * lives in the sidebar (workspace at the top, account at the bottom); the panel is only
 * ever the page. Under 1024px the sidebar becomes a drawer behind a small header. The
 * assistant, opened from any page header, is a second panel to the right of the page.
 */
export function AppShell() {
  const me = useMe();
  const navigate = useNavigate();
  const [activeOrgId, setActiveOrgId] = useState(readActiveOrgId);
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  // The drawer remembers the path it was opened on, so navigating closes it without an effect.
  const [drawer, setDrawer] = useState<{ open: boolean; path: string }>({ open: false, path: '' });
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();
  const drawerOpen = drawer.open && drawer.path === location.pathname;
  const setDrawerOpen = (open: boolean) => setDrawer({ open, path: location.pathname });
  // The assistant docks beside the page when there is room and is a sheet otherwise. Only
  // the docked state is remembered: a sheet that reopened itself on load would be in the way.
  const canDock = useMediaQuery('(min-width: 1440px)');
  const [docked, setDocked] = useState(() => localStorage.getItem(ASSISTANT_KEY) === '1');
  const [sheet, setSheet] = useState(false);
  const assistant = useMemo<AssistantContextValue>(
    () => ({
      open: canDock ? docked : sheet,
      toggle: () => {
        if (!canDock) return setSheet((open) => !open);
        setDocked((open) => {
          localStorage.setItem(ASSISTANT_KEY, open ? '0' : '1');
          return !open;
        });
      },
    }),
    [canDock, docked, sheet],
  );

  // The page header is portalled into a fixed strip of the panel; see PageHeader.
  const [headerSlot, setHeaderSlot] = useState<HTMLDivElement | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // The scrolling element outlives the page, so a new page would inherit the old offset.
  useLayoutEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

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

  // The remembered org may be one the user has since left, or none yet: use their first.
  const org = me.data?.orgs.find((o) => o.id === activeOrgId) ?? me.data?.orgs[0];
  const switchOrg = useCallback(
    (orgId: string, to = '/') => {
      writeActiveOrgId(orgId);
      setActiveOrgId(orgId);
      // Whatever is on screen belongs to the org being left, so never stay on it.
      void navigate(to);
    },
    [navigate],
  );
  const ctx = useMemo<OrgContextValue | null>(() => {
    if (!me.data || !org) return null;
    return {
      org,
      orgs: me.data.orgs,
      user: me.data.user,
      canManage: org.role === 'owner' || org.role === 'admin',
      isOwner: org.role === 'owner',
      switchOrg,
    };
  }, [me.data, org, switchOrg]);

  if (me.isPending) return <FullPageSkeleton />;
  if (!ctx) return <Navigate to="/login" replace />;

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      return !c;
    });
  };
  const openSearch = () => setSearchOpen(true);

  return (
    <OrgContext.Provider value={ctx}>
      <AssistantContext.Provider value={assistant}>
        {/* The frame is exactly one viewport tall; only the inside of the page panel scrolls. */}
        <div className="flex h-dvh overflow-hidden bg-bg-subtle">
          {!isMobile ? (
            <aside
              className={cn(
                'group/sidebar hidden h-full shrink-0 flex-col transition-[width] duration-200 lg:flex',
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

          <div className="flex min-h-0 min-w-0 flex-1 flex-col p-2 lg:py-3 lg:pl-0 lg:pr-3">
            {isMobile ? (
              <div className="mb-2 flex h-11 shrink-0 items-center gap-2 px-1">
                <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Open navigation"
                    onClick={() => setDrawerOpen(true)}
                  >
                    <MenuIcon />
                  </Button>
                  <DrawerContent aria-label="Navigation" className="group/sidebar">
                    <SidebarContent collapsed={false} onSearch={openSearch} />
                  </DrawerContent>
                </Dialog>
                <Logo />
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

            <main className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-bg shadow-xs">
              <PageHeaderSlotContext.Provider value={headerSlot}>
                {/* PageHeader draws itself in here, above the part that scrolls. */}
                <div ref={setHeaderSlot} className="shrink-0" />
                {/* A column, so a page with nothing to list can centre its empty state. */}
                <div
                  ref={scroller}
                  className="scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-5"
                >
                  <Outlet />
                </div>
              </PageHeaderSlotContext.Provider>
            </main>
          </div>

          {canDock && docked ? (
            <aside className="h-full w-[380px] shrink-0 py-3 pr-3" aria-label="Assistant">
              <div className="h-full overflow-hidden rounded-xl border border-border bg-bg shadow-xs">
                <AssistantPanel onClose={assistant.toggle} />
              </div>
            </aside>
          ) : null}
        </div>
        <Dialog open={!canDock && sheet} onOpenChange={setSheet}>
          <SheetContent className="max-w-md" aria-describedby={undefined}>
            <DialogTitle className="sr-only">Assistant</DialogTitle>
            <AssistantPanel />
          </SheetContent>
        </Dialog>
      </AssistantContext.Provider>
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
  const assistant = useAssistant();
  return (
    <>
      {/* The logo lines up with the workspace tile and the nav icons under it, not the card edge. */}
      <div
        className={cn(
          'flex h-14 shrink-0 items-center',
          collapsed ? 'justify-center' : 'justify-between pl-[22px] pr-3',
        )}
      >
        {collapsed ? (
          onToggle ? (
            <ExpandMark onToggle={onToggle} />
          ) : null
        ) : (
          <>
            <Logo />
            {/* Out of the way until the pointer or keyboard is in the sidebar; always shown on touch. */}
            <div className="flex items-center transition-opacity duration-150 group-focus-within/sidebar:opacity-100 group-hover/sidebar:opacity-100 [@media(hover:hover)]:opacity-0">
              <WithTooltip label="Search (Ctrl+K)">
                <button
                  type="button"
                  onClick={onSearch}
                  className={headerButtonClass}
                  aria-label="Search (Ctrl+K)"
                >
                  <Search />
                </button>
              </WithTooltip>
              {onToggle ? (
                <WithTooltip label="Collapse sidebar">
                  <button
                    type="button"
                    onClick={onToggle}
                    className={headerButtonClass}
                    aria-label="Collapse sidebar"
                  >
                    <PanelLeftClose />
                  </button>
                </WithTooltip>
              ) : null}
            </div>
          </>
        )}
      </div>

      <div className={cn('px-3 pb-1', collapsed && 'px-2')}>
        <OrgSwitcher collapsed={collapsed} />
      </div>

      {/* The scrollbar's gutter is always reserved, so the right padding is what is left of 12px. */}
      <nav
        className={cn(
          'scrollbar-reveal flex-1 overflow-y-auto pb-2 pt-1',
          collapsed ? 'pl-2 pr-0.5' : 'pl-3 pr-1.5',
        )}
        aria-label="Main"
      >
        {NAV_GROUPS.map((group, i) => (
          <div key={group.title ?? 'top'}>
            {group.title ? (
              collapsed ? (
                <div className="mx-2.5 my-2.5 border-t border-border-strong" aria-hidden />
              ) : (
                <p className="mb-1 mt-3 px-2.5 text-[12px] font-semibold uppercase tracking-wider text-fg-faint">
                  {group.title}
                </p>
              )
            ) : null}
            <ul className={cn('space-y-0.5', i === 0 && !collapsed && 'mt-1')}>
              {group.items.map((item) => (
                <li key={item.to}>
                  <SidebarLink item={item} collapsed={collapsed} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* The rule keeps the pinned cards apart from the nav when the nav has to scroll. */}
      <div className={cn('mx-3 space-y-2 border-t border-border py-3', collapsed && 'mx-2')}>
        <GettingStartedCard collapsed={collapsed} />
        <PreviewCard collapsed={collapsed} />
        <UserCard collapsed={collapsed} />
        <div
          className={cn(
            'flex items-center pt-1',
            collapsed ? 'flex-col gap-1' : 'justify-between px-1',
          )}
        >
          {/* Help is the assistant: the one place that answers questions about the product. */}
          <WithTooltip label={collapsed ? 'Help' : undefined} side="right">
            <button
              type="button"
              onClick={() => {
                if (assistant && !assistant.open) assistant.toggle();
              }}
              className={cn(footerLinkClass, collapsed && 'size-8 justify-center px-0')}
              aria-label={collapsed ? 'Help' : undefined}
            >
              <Info />
              {!collapsed ? 'Help' : null}
            </button>
          </WithTooltip>
          {!collapsed ? <span className="h-4 w-px bg-border-strong" aria-hidden /> : null}
          <UpdatesButton collapsed={collapsed} />
        </div>
      </div>
    </>
  );
}

const headerButtonClass =
  'flex size-8 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-sidebar-active hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [&_svg]:size-4';

const footerLinkClass =
  'relative inline-flex h-8 items-center gap-2 rounded-md px-2.5 text-sm font-medium text-fg-muted transition-colors hover:bg-sidebar-active hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [&_svg]:size-4';

/**
 * Top of the collapsed rail: the mark, which turns into the expand control under the
 * pointer or keyboard focus. The rail has no room for a separate button.
 */
function ExpandMark({ onToggle }: { onToggle: () => void }) {
  return (
    <WithTooltip label="Expand sidebar" side="right">
      <button
        type="button"
        onClick={onToggle}
        aria-label="Expand sidebar"
        className="group relative flex size-9 items-center justify-center rounded-md transition-colors hover:bg-sidebar-active focus-visible:bg-sidebar-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <LogoMark className="transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0" />
        <PanelLeftOpen
          className="absolute size-[18px] text-fg opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden
        />
      </button>
    </WithTooltip>
  );
}

const UPDATES_SEEN_KEY = 'postrail.updates-seen';

/** "What's new", with a dot until the newest entry has been opened once in this browser. */
function UpdatesButton({ collapsed }: { collapsed: boolean }) {
  const newest = UPDATES[0]?.id ?? '';
  const [seen, setSeen] = useState(() => localStorage.getItem(UPDATES_SEEN_KEY) === newest);
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && !seen) {
          localStorage.setItem(UPDATES_SEEN_KEY, newest);
          setSeen(true);
        }
      }}
    >
      <WithTooltip label={collapsed && !open ? 'Updates' : undefined} side="right">
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(footerLinkClass, collapsed && 'size-8 justify-center px-0')}
            aria-label={seen ? 'Updates' : 'Updates (new)'}
          >
            <Megaphone />
            {!collapsed ? 'Updates' : null}
            {!seen ? (
              <span
                className="absolute right-1 top-1 size-1.5 rounded-full bg-danger"
                aria-hidden
              />
            ) : null}
          </button>
        </PopoverTrigger>
      </WithTooltip>
      <PopoverContent side="top" align="end" className="motion-menu w-80 p-0">
        <p className="border-b border-border px-4 py-3 text-sm font-semibold text-fg">
          What&apos;s new
        </p>
        <ul className="scrollbar-thin max-h-80 divide-y divide-border overflow-y-auto">
          {UPDATES.map((update) => (
            <li key={update.id} className="px-4 py-3">
              <p className="text-xs text-fg-muted">{formatDay(update.date)}</p>
              <p className="mt-0.5 text-sm font-medium text-fg">{update.title}</p>
              <p className="mt-0.5 text-xs leading-5 text-fg-muted">{update.body}</p>
              {update.to ? (
                <Link
                  to={update.to}
                  onClick={() => setOpen(false)}
                  className="mt-1 inline-flex text-xs font-medium text-primary underline-offset-4 hover:underline"
                >
                  Take a look
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/*
 * The active state hangs off aria-current, which NavLink sets itself. NavLink's function
 * form of className must not be used here: the tooltip trigger merges class names as
 * strings, which turned the function's source into the class and left the rail unstyled.
 */
const navItemClass =
  'group flex items-center rounded-md text-sm font-medium text-sidebar-fg transition-colors hover:bg-sidebar-active hover:text-sidebar-fg-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 aria-[current=page]:bg-sidebar-active aria-[current=page]:text-sidebar-fg-strong [&_svg]:shrink-0 [&_svg]:text-fg-muted aria-[current=page]:[&_svg]:text-sidebar-fg-strong';

function SidebarLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const className = cn(
    navItemClass,
    collapsed
      ? 'mx-auto size-9 justify-center [&_svg]:size-[18px]'
      : 'h-8 gap-2.5 px-2.5 [&_svg]:size-4',
  );
  const content = (
    <>
      <item.icon aria-hidden />
      {!collapsed ? (
        <>
          <span className="truncate">{item.label}</span>
          {item.badge === 'soon' ? (
            <span className="ml-auto rounded-full border border-border bg-bg px-1.5 text-[11px] font-medium leading-4 text-fg-muted">
              Soon
            </span>
          ) : null}
          {item.external ? (
            <ArrowUpRight className="ml-auto !size-3.5 !text-fg-faint" aria-hidden />
          ) : null}
        </>
      ) : null}
    </>
  );
  if (item.external) {
    return (
      <WithTooltip label={collapsed ? item.label : undefined} side="right">
        <a
          href={item.to}
          target="_blank"
          rel="noreferrer"
          aria-label={collapsed ? item.label : undefined}
          className={className}
        >
          {content}
        </a>
      </WithTooltip>
    );
  }
  return (
    <WithTooltip label={collapsed ? item.label : undefined} side="right">
      <NavLink
        to={item.to}
        end={item.end ?? false}
        aria-label={collapsed ? item.label : undefined}
        className={className}
      >
        {content}
      </NavLink>
    </WithTooltip>
  );
}

/** Progress toward a first email, until every step is done. Mirrors the overview card. */
function GettingStartedCard({ collapsed }: { collapsed: boolean }) {
  const { org } = useOrg();
  const status = useOnboardingStatus(org.id);
  if (!status.data) return null;
  const done = [status.data.hasMailbox, status.data.hasApiKey, status.data.hasSent].filter(
    Boolean,
  ).length;
  if (done === 3) return null;
  return (
    <SidebarCardLink
      to="/"
      label={`Getting started (${done}/3)`}
      icon={<Rocket className="text-primary" />}
      collapsed={collapsed}
    >
      <span className="flex-1 truncate text-sm font-medium text-fg">Getting started</span>
      <span className="text-xs tabular text-fg-muted">{done}/3</span>
    </SidebarCardLink>
  );
}

function PreviewCard({ collapsed }: { collapsed: boolean }) {
  return (
    <SidebarCardLink to="/billing" label="Free preview" icon={<Sprout />} collapsed={collapsed}>
      <span className="flex-1 truncate text-sm font-medium text-fg">Free preview</span>
    </SidebarCardLink>
  );
}

/** A sidebar card that is a link. On the collapsed rail it shrinks to its icon and a tooltip. */
function SidebarCardLink({
  to,
  label,
  icon,
  collapsed,
  children,
}: {
  to: string;
  label: string;
  icon: ReactNode;
  collapsed: boolean;
  children: ReactNode;
}) {
  return (
    <WithTooltip label={collapsed ? label : undefined} side="right">
      <Link
        to={to}
        aria-label={collapsed ? label : undefined}
        className={cn(
          sidebarCardClass,
          '[&_svg]:size-4 [&_svg]:shrink-0',
          collapsed ? 'mx-auto size-10 justify-center' : 'h-10 px-2.5',
        )}
      >
        <span className="text-fg-muted">{icon}</span>
        {!collapsed ? (
          <>
            {children}
            <ChevronRight className="text-fg-faint" aria-hidden />
          </>
        ) : null}
      </Link>
    </WithTooltip>
  );
}

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

function UserCard({ collapsed }: { collapsed: boolean }) {
  const { user } = useOrg();
  const { preference, setPreference } = useTheme();
  const ThemeIcon = THEME_OPTIONS.find((o) => o.value === preference)?.icon ?? Monitor;
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
        <DropdownMenuItem onSelect={() => void navigate('/settings/profile')}>
          <Settings /> Account settings
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ThemeIcon />
            Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {THEME_OPTIONS.map((option) => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={preference === option.value}
                onCheckedChange={() => setPreference(option.value)}
              >
                {option.label}
              </DropdownMenuCheckboxItem>
            ))}
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
