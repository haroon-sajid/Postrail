import { Skeleton } from '@/components/ui/skeleton';

/** Shell-shaped placeholder while the session loads, so the layout never shifts. */
export function FullPageSkeleton() {
  return (
    <div className="flex min-h-screen bg-bg-subtle" aria-busy aria-label="Loading">
      <div className="hidden w-[var(--sidebar-width)] bg-sidebar lg:block" />
      <div className="flex-1">
        <div className="h-[var(--topbar-height)] border-b border-border bg-bg" />
        <div className="mx-auto max-w-[var(--content-max)] space-y-4 p-4 sm:p-6">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-80" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      </div>
    </div>
  );
}
