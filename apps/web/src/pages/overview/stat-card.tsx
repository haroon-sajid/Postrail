import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDelta, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface StatCardProps {
  label: string;
  value: number;
  /** Baseline for the delta. Omit for counts that have no previous period. */
  previous?: number;
  /** For failures, going up is bad. */
  invert?: boolean;
  hint?: string;
}

export function StatCard({ label, value, previous, invert = false, hint }: StatCardProps) {
  const delta = previous === undefined ? null : formatDelta(value, previous);
  const up = previous !== undefined && value > previous;
  const down = previous !== undefined && value < previous;
  const good = invert ? down : up;
  const bad = invert ? up : down;
  return (
    <Card className="px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="tabular text-2xl font-semibold text-fg">{formatNumber(value)}</span>
        {delta ? (
          <span
            className={cn(
              'tabular text-xs font-medium',
              good && 'text-success-fg',
              bad && 'text-danger-fg',
              !good && !bad && 'text-fg-muted',
            )}
            title={hint}
          >
            {delta}
          </span>
        ) : null}
      </div>
      {hint ? <p className="mt-0.5 text-xs text-fg-faint">{hint}</p> : null}
    </Card>
  );
}

export function StatCardSkeleton() {
  return (
    <Card className="px-4 py-3" aria-busy>
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-2 h-7 w-16" />
      <Skeleton className="mt-1.5 h-3 w-24" />
    </Card>
  );
}
