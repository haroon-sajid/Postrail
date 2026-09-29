import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
  className,
  sideOffset = 4,
  ...props
}: TooltipPrimitive.TooltipContentProps) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 max-w-xs rounded bg-navy px-2 py-1 text-xs text-white shadow-md dark:bg-bg-muted dark:text-fg',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

/** Wraps children in a tooltip when `label` is given; renders them plainly otherwise. */
export function WithTooltip({
  label,
  children,
}: {
  label?: string | undefined;
  children: React.ReactElement;
}) {
  if (!label) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
