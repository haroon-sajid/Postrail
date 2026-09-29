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
        className="top-[15%] translate-y-0 overflow-hidden p-0"
        aria-describedby={undefined}
      >
        <CommandPrimitive
          label="Global search"
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-muted"
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
    <div className="flex items-center gap-2 border-b border-border px-3">
      <Search className="size-4 shrink-0 text-fg-muted" aria-hidden />
      <CommandPrimitive.Input
        className={cn(
          'h-11 w-full bg-transparent text-sm outline-none placeholder:text-fg-faint',
          className,
        )}
        {...props}
      />
      <kbd className="rounded border border-border px-1 text-[10px] text-fg-muted">ESC</kbd>
    </div>
  );
}

export function CommandList(props: React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>) {
  return <CommandPrimitive.List className="max-h-80 overflow-y-auto p-1" {...props} />;
}

export function CommandEmpty(props: React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty className="px-2 py-6 text-center text-sm text-fg-muted" {...props} />
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
        'flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[selected=true]:bg-bg-muted [&_svg]:size-4 [&_svg]:text-fg-muted',
        className,
      )}
      {...props}
    />
  );
}
