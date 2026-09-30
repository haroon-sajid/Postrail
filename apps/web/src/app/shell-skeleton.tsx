import { Skeleton } from '@/components/ui/skeleton';

/** Shell-shaped placeholder while the session loads, so the layout never shifts. */
export function FullPageSkeleton() {
  return (
    <div className="flex min-h-screen bg-bg-subtle" aria-busy aria-label="Loading">
      <div className="hidden w-[var(--sidebar-width)] shrink-0 flex-col gap-3 p-3 lg:flex">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-12 rounded-lg" />
        <div className="space-y-2 pt-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9" />
          ))}
        </div>
      </div>
      <div className="flex-1 p-2 lg:py-3 lg:pr-3 lg:pl-0">
        <div className="min-h-[calc(100vh-24px)] rounded-xl border border-border bg-bg shadow-xs">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <Skeleton className="size-8 rounded-md" />
            <Skeleton className="h-5 w-40" />
          </div>
          <div className="space-y-6 p-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-72 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
