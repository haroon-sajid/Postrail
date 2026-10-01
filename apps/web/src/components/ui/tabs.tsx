import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

/** Segmented control for switching views inside a card (code samples, HTML/text). */
export function TabsList({ className, ...props }: TabsPrimitive.TabsListProps) {
  return (
    <TabsPrimitive.List
      className={cn(
        'inline-flex h-9 items-center gap-1 rounded-md border border-border bg-bg-subtle p-1',
        className,
      )}
      {...props}
    />
  );
}

/** Underlined tabs for the sections of a page (billing). Pair with `LineTabsTrigger`. */
export function LineTabsList({ className, ...props }: TabsPrimitive.TabsListProps) {
  return (
    <TabsPrimitive.List
      className={cn('scrollbar-thin flex items-center gap-1 overflow-x-auto', className)}
      {...props}
    />
  );
}

export function LineTabsTrigger({ className, ...props }: TabsPrimitive.TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'relative inline-flex h-11 shrink-0 items-center px-4 text-sm font-medium text-fg-muted transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent after:transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40 data-[state=active]:text-fg data-[state=active]:after:bg-primary',
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: TabsPrimitive.TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex h-7 items-center rounded-sm px-3 text-sm font-medium text-fg-muted transition-colors hover:text-fg data-[state=active]:bg-bg data-[state=active]:text-fg data-[state=active]:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        className,
      )}
      {...props}
    />
  );
}
