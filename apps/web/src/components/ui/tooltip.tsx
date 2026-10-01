import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

/** A light pill with a hairline border, so it reads as a label and not as an alert. */
export function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: TooltipPrimitive.TooltipContentProps) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 max-w-xs rounded-lg border border-border bg-bg-elevated px-2.5 py-1.5 text-xs font-medium text-fg shadow-md',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

/**
 * Wraps children in a tooltip when `label` is given; renders them plainly otherwise.
 * `side="right"` is for the collapsed sidebar, where the label names the icon beside it.
 */
export function WithTooltip({
  label,
  side = 'top',
  children,
}: {
  label?: string | undefined;
  side?: 'top' | 'right';
  children: React.ReactElement;
}) {
  if (!label) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} sideOffset={side === 'right' ? 10 : 6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
