import { AlertTriangle, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/api/client';

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: typeof Inbox;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-lg border border-border bg-bg-subtle">
        <Icon className="size-5 text-fg-muted" aria-hidden />
      </div>
      <p className="text-base font-semibold text-fg">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm leading-5 text-fg-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-5 flex items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-lg border border-danger/20 bg-danger-bg">
        <AlertTriangle className="size-5 text-danger" aria-hidden />
      </div>
      <p className="text-base font-semibold text-fg">Could not load this</p>
      <p className="mt-1.5 max-w-sm text-sm text-fg-muted">{errorMessage(error)}</p>
      {onRetry ? (
        <Button className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/** Same height as real table rows so nothing jumps when data arrives. */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div aria-busy aria-label="Loading" className="divide-y divide-border">
      <div className="flex h-10 items-center gap-6 bg-bg-subtle/70 px-5">
        {Array.from({ length: cols }).map((_, c) => (
          <Skeleton key={c} className="h-3" style={{ width: `${c === 0 ? 10 : 7}%` }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex h-12 items-center gap-6 px-5">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className="h-3.5"
              style={{ width: `${c === 0 ? 14 : 8 + ((r + c) % 4) * 6}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-busy className="space-y-3 p-5">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3.5" style={{ width: `${90 - i * 15}%` }} />
      ))}
    </div>
  );
}
