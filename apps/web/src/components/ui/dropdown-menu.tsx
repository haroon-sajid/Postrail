import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;

export function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: Menu.DropdownMenuContentProps) {
  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-44 overflow-hidden rounded border border-border bg-bg-elevated p-1 text-sm shadow-md',
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
        'flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 outline-none data-[highlighted]:bg-bg-muted data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-fg-muted',
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
        'flex cursor-default select-none items-center gap-2 rounded-sm py-1.5 pl-7 pr-2 outline-none data-[highlighted]:bg-bg-muted',
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <Menu.ItemIndicator>
          <Check className="size-3.5" />
        </Menu.ItemIndicator>
      </span>
      {children}
    </Menu.CheckboxItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: Menu.DropdownMenuLabelProps) {
  return (
    <Menu.Label
      className={cn('px-2 py-1.5 text-xs font-medium text-fg-muted', className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({ className, ...props }: Menu.DropdownMenuSeparatorProps) {
  return <Menu.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />;
}
