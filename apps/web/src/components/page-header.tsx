import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { AssistantToggle } from '@/app/assistant';
import { navItemFor } from '@/app/nav';
import { usePageHeaderSlot } from '@/app/page-header-slot';
import { cn } from '@/lib/utils';

/**
 * The strip at the top of the content panel: the section's icon and the page title on
 * the left, the primary actions on the right, an optional one-line description under
 * the title. The icon comes from the nav item that owns the current route, so pages
 * never pass it.
 *
 * Inside the shell it is drawn in the panel's fixed header slot, so it stays put while
 * the page scrolls under it. Without a slot it renders in place, pulled out to the edges
 * of a padded container.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  const item = navItemFor(useLocation().pathname);
  const slot = usePageHeaderSlot();
  const header = (
    <div
      className={cn(
        'flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5',
        !slot && '-mx-4 -mt-4 mb-4 sm:-mx-5 sm:-mt-5 sm:mb-5',
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {item ? (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-bg-subtle text-fg-muted [&_svg]:size-4">
            <item.icon aria-hidden />
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold leading-6 text-fg">{title}</h1>
          {description ? <p className="truncate text-xs text-fg-muted">{description}</p> : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <AssistantToggle />
        {actions}
      </div>
    </div>
  );
  return slot ? createPortal(header, slot) : header;
}
