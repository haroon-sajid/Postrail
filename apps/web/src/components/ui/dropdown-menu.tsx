import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: Menu.DropdownMenuContentProps) {
  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={sideOffset}
        className={cn(
          'motion-menu z-50 min-w-48 overflow-hidden rounded-lg border border-border bg-bg-elevated p-1 text-sm shadow-md',
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  );
}

export function DropdownMenuItem({
  className,
  destructive,
  ...props
}: Menu.DropdownMenuItemProps & { destructive?: boolean }) {
  return (
    <Menu.Item
      className={cn(
        'flex cursor-default select-none items-center gap-2.5 rounded-md px-2.5 py-2 outline-none data-[highlighted]:bg-bg-muted data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-fg-muted',
        destructive && 'text-danger-fg data-[highlighted]:bg-danger-bg [&_svg]:text-danger-fg',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: Menu.DropdownMenuCheckboxItemProps) {
  return (
    <Menu.CheckboxItem
      className={cn(
        'relative flex cursor-default select-none items-center gap-2 rounded-md py-2 pl-8 pr-2.5 outline-none data-[highlighted]:bg-bg-muted',
        className,
      )}
      {...props}
    >
      <span className="absolute left-2.5 flex size-4 items-center justify-center">
        <Menu.ItemIndicator>
          <Check className="size-3.5 text-primary" />
        </Menu.ItemIndicator>
      </span>
      {children}
    </Menu.CheckboxItem>
  );
}

export const DropdownMenuSub = Menu.Sub;

/** Opens a nested menu to the side. Shows a chevron on the right. */
export function DropdownMenuSubTrigger({
  className,
  children,
  ...props
}: Menu.DropdownMenuSubTriggerProps) {
  return (
    <Menu.SubTrigger
      className={cn(
        'flex cursor-default select-none items-center gap-2.5 rounded-md px-2.5 py-2 outline-none data-[highlighted]:bg-bg-muted data-[state=open]:bg-bg-muted [&_svg]:size-4 [&_svg]:text-fg-muted',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto" aria-hidden />
    </Menu.SubTrigger>
  );
}

export function DropdownMenuSubContent({
  className,
  sideOffset = 6,
  ...props
}: Menu.DropdownMenuSubContentProps) {
  return (
    <Menu.Portal>
      <Menu.SubContent
        sideOffset={sideOffset}
        className={cn(
          'motion-menu z-50 min-w-40 overflow-hidden rounded-lg border border-border bg-bg-elevated p-1 text-sm shadow-md',
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  );
}

export function DropdownMenuLabel({ className, ...props }: Menu.DropdownMenuLabelProps) {
  return (
    <Menu.Label
      className={cn('px-2.5 py-2 text-xs font-medium text-fg-muted', className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({ className, ...props }: Menu.DropdownMenuSeparatorProps) {
  return <Menu.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />;
}
