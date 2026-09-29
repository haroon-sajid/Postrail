import { Command as CommandPrimitive } from 'cmdk';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent } from './dialog';

export function CommandDialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[12%] translate-y-0 overflow-hidden p-0 [&>button]:hidden"
        aria-describedby={undefined}
      >
        <CommandPrimitive
          label="Global search"
          className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-muted"
        >
          {children}
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}

export function CommandInput({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-4">
      <Search className="size-4 shrink-0 text-fg-muted" aria-hidden />
      <CommandPrimitive.Input
        className={cn(
          'h-12 w-full bg-transparent text-base outline-none placeholder:text-fg-faint',
          className,
        )}
        {...props}
      />
      <kbd className="rounded-sm border border-border bg-bg-subtle px-1.5 py-0.5 text-[10px] font-medium text-fg-muted">
        ESC
      </kbd>
    </div>
  );
}

export function CommandList(props: React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List className="scrollbar-thin max-h-80 overflow-y-auto p-1.5" {...props} />
  );
}

export function CommandEmpty(props: React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty className="px-3 py-8 text-center text-sm text-fg-muted" {...props} />
  );
}

export const CommandGroup = CommandPrimitive.Group;

export function CommandItem({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      className={cn(
        'flex cursor-default select-none items-center gap-2.5 rounded-md px-3 py-2.5 text-sm outline-none data-[selected=true]:bg-bg-muted [&_svg]:size-4 [&_svg]:text-fg-muted',
        className,
      )}
      {...props}
    />
  );
}
