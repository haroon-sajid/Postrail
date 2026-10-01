import { Command } from 'cmdk';
import {
  Briefcase,
  Check,
  ChevronsUpDown,
  Ellipsis,
  Plus,
  Search,
  SquareTerminal,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { useCreateOrg, type Org } from '@/api/me';
import { Button } from '@/components/ui/button';
import { CommandItem } from '@/components/ui/command';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Label, inputClass } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useOrg } from './org-context';
import { sidebarCardClass } from './sidebar-styles';

/**
 * The workspace card at the top of the sidebar. A popover with a filter box rather than a
 * menu: a text field inside a Radix menu fights its typeahead and loses focus to whichever
 * row the pointer crosses.
 */
export function OrgSwitcher({ collapsed }: { collapsed: boolean }) {
  const { org, orgs, switchOrg } = useOrg();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const needle = query.trim().toLowerCase();
  const matches = orgs.filter((o: Org) => o.name.toLowerCase().includes(needle));
  const close = () => {
    setOpen(false);
    setQuery('');
  };
  return (
    <>
      <Popover open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              sidebarCardClass,
              collapsed
                ? 'mx-auto size-11 justify-center rounded-xl'
                : 'h-14 gap-3 rounded-xl px-2.5',
            )}
            aria-label={`Switch workspace (current: ${org.name})`}
          >
            <OrgAvatar name={org.name} className={collapsed ? 'size-8' : 'size-9'} />
            {!collapsed ? (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs leading-4 text-fg-muted">Workspace</span>
                  <span className="block truncate text-base font-medium leading-5 text-fg">
                    {org.name}
                  </span>
                </span>
                <ChevronsUpDown className="size-4 shrink-0 text-fg-muted" aria-hidden />
              </>
            ) : null}
          </button>
        </PopoverTrigger>
        <PopoverContent className="motion-menu w-72 p-0">
          {/* The list is already filtered by name above; cmdk only drives the keyboard. */}
          <Command label="Search workspaces" shouldFilter={false} defaultValue={org.id}>
            <div className="relative p-2">
              <Search
                className="pointer-events-none absolute left-4.5 top-1/2 size-4 -translate-y-1/2 text-fg-faint"
                aria-hidden
              />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Search…"
                className={cn(inputClass, 'pl-8')}
              />
            </div>
            <Command.List className="scrollbar-thin max-h-72 overflow-y-auto px-1.5 pb-1.5">
              {matches.map((o) => (
                <CommandItem
                  key={o.id}
                  value={o.id}
                  className="gap-3 px-2 py-1.5"
                  onSelect={() => {
                    close();
                    if (o.id !== org.id) switchOrg(o.id);
                  }}
                >
                  <OrgAvatar name={o.name} className="size-8" />
                  <span className="min-w-0 flex-1 truncate font-medium text-fg">{o.name}</span>
                  {o.id === org.id ? (
                    <Check className="shrink-0 !text-fg" aria-label="Current workspace" />
                  ) : null}
                </CommandItem>
              ))}
              {matches.length === 0 ? (
                <p className="px-2 py-5 text-center text-sm text-fg-muted">No workspace found.</p>
              ) : null}
              <div className="-mx-1.5 my-1.5 h-px bg-border" role="separator" />
              <CommandItem
                value="add-workspace"
                className="gap-3 px-2 py-1.5 text-fg-muted data-[selected=true]:text-fg"
                onSelect={() => {
                  close();
                  setCreating(true);
                }}
              >
                {/* Same footprint as a workspace tile, so the label lines up with the names. */}
                <span className="flex size-8 shrink-0 items-center justify-center">
                  <Plus />
                </span>
                Add another workspace
              </CommandItem>
            </Command.List>
          </Command>
        </PopoverContent>
      </Popover>
      <CreateOrgDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

/** A stable hue for a name, so each workspace keeps its own colour everywhere. */
function hueFor(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 360;
  return hash;
}

/**
 * The tile that stands for a workspace: its initial on a gradient of its own hue. The
 * colours are derived from the name, not the palette, so two workspaces never look alike.
 */
function OrgAvatar({ name, className }: { name: string; className?: string }) {
  const hue = hueFor(name);
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg text-sm font-semibold uppercase text-white',
        className,
      )}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 82% 60%), hsl(${(hue + 40) % 360} 78% 42%))`,
        boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.35), inset 0 0 0 1px rgb(255 255 255 / 0.12)',
      }}
    >
      {name.trim().charAt(0) || '?'}
    </span>
  );
}

interface Persona {
  id: string;
  icon: LucideIcon;
  title: string;
  body: string;
  /** The page a workspace of this kind most likely needs first. */
  start: string;
}

const PERSONAS: Persona[] = [
  {
    id: 'business',
    icon: Briefcase,
    title: 'Business',
    body: 'Sending from our own product',
    start: '/mailboxes',
  },
  {
    id: 'agency',
    icon: Users,
    title: 'Agency',
    body: 'Setting up sending for clients',
    start: '/settings/members',
  },
  {
    id: 'developer',
    icon: SquareTerminal,
    title: 'Developer',
    body: 'Building on the API',
    start: '/api-keys',
  },
  { id: 'other', icon: Ellipsis, title: 'Other', body: 'None of the above', start: '/' },
];

/**
 * Name the workspace and, optionally, say what it is for. The answer is not stored: it
 * only decides which page the new workspace opens on.
 */
function CreateOrgDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [persona, setPersona] = useState<Persona | null>(null);
  const create = useCreateOrg();
  const { switchOrg } = useOrg();
  const close = () => {
    onOpenChange(false);
    setName('');
    setPersona(null);
  };
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-[600px]" aria-describedby={undefined}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const org = await create.mutateAsync(name.trim());
              toast.success(`Created ${org.name}`);
              close();
              switchOrg(org.id, persona?.start);
            } catch (error) {
              toast.error(errorMessage(error));
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Create your workspace</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-6">
            <div>
              <Label htmlFor="org-name">Workspace name</Label>
              <Input
                id="org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                maxLength={80}
                placeholder="Acme Company"
              />
            </div>
            <div role="radiogroup" aria-labelledby="persona-label">
              <p id="persona-label" className="text-sm font-medium text-fg">
                What best describes you?
              </p>
              <p className="text-xs text-fg-muted">
                Optional. We&apos;ll open the page you are most likely to need first.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {PERSONAS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={persona?.id === p.id}
                    onClick={() => setPersona(persona?.id === p.id ? null : p)}
                    className="rounded-lg border border-border bg-bg p-4 text-left shadow-xs transition-[border-color,background-color,box-shadow] hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 aria-checked:border-primary aria-checked:bg-primary/[0.05] aria-checked:ring-1 aria-checked:ring-primary"
                  >
                    <p.icon className="size-5 text-primary" aria-hidden />
                    <span className="mt-4 block text-sm font-medium text-fg">{p.title}</span>
                    <span className="mt-0.5 block text-sm text-fg-muted">{p.body}</span>
                  </button>
                ))}
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={close}>
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
