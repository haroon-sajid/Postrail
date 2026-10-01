import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

// Portal clones its children with a ref for the exit animation, so this must forward it.
const Overlay = forwardRef<HTMLDivElement, DialogPrimitive.DialogOverlayProps>(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn('motion-overlay fixed inset-0 z-40 bg-navy/40 backdrop-blur-[2px]', className)}
      {...props}
    />
  ),
);
Overlay.displayName = 'DialogOverlay';

const closeClass =
  'absolute right-4 top-4 rounded-md p-1.5 text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40';

export interface DialogContentProps extends DialogPrimitive.DialogContentProps {
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Width by what the modal holds: `sm` (448px) a confirmation or a field or two, `md`
 * (528px) a form or a secret to copy, `lg` (672px) search and bulk content.
 */
// In px: the root font size is 14px, so rem-based max-w-* classes come out 12% narrower.
const sizeClass = { sm: 'max-w-[448px]', md: 'max-w-[528px]', lg: 'max-w-[672px]' } as const;

/**
 * Centered modal. Focus is trapped; Escape and the overlay close it. Never taller than
 * the viewport: a long form scrolls inside the modal instead of running off screen.
 */
export function DialogContent({ className, children, size = 'md', ...props }: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        className={cn(
          'motion-modal scrollbar-thin fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-bg-elevated p-0 shadow-lg outline-none',
          sizeClass[size],
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className={closeClass} aria-label="Close">
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-6 pb-2 pr-14 pt-6', className)} {...props} />;
}

export function DialogTitle({ className, ...props }: DialogPrimitive.DialogTitleProps) {
  return <DialogPrimitive.Title className={cn('text-lg font-semibold', className)} {...props} />;
}

export function DialogDescription({ className, ...props }: DialogPrimitive.DialogDescriptionProps) {
  return (
    <DialogPrimitive.Description
      className={cn('mt-1 text-sm text-fg-muted', className)}
      {...props}
    />
  );
}

export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-6 py-4', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-2 rounded-b-xl border-t border-border bg-bg-subtle/60 px-6 py-4',
        className,
      )}
      {...props}
    />
  );
}

/** Right-side drawer built on the same primitive. */
export function SheetContent({
  className,
  children,
  ...props
}: DialogPrimitive.DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        className={cn(
          'motion-sheet fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-border bg-bg-elevated shadow-lg outline-none',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className={closeClass} aria-label="Close">
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Left-side drawer for the mobile navigation. */
export function DrawerContent({
  className,
  children,
  ...props
}: DialogPrimitive.DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        className={cn(
          'motion-drawer fixed inset-y-0 left-0 z-50 flex w-[288px] max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar outline-none',
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
