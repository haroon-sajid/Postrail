import { Skeleton } from '@/components/ui/skeleton';

/** Shell-shaped placeholder while the session loads, so the layout never shifts. */
export function FullPageSkeleton() {
  return (
    <div className="flex min-h-screen bg-bg-subtle" aria-busy aria-label="Loading">
      <div className="hidden w-[var(--sidebar-width)] border-r border-sidebar-border bg-sidebar lg:block" />
      <div className="flex-1">
        <div className="h-[var(--topbar-height)] border-b border-border bg-bg" />
        <div className="mx-auto max-w-[var(--content-max)] space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-80" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
