import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
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
  const raw = previous === undefined ? null : formatDelta(value, previous);
  // "—" means no baseline either way; a pill would just be noise.
  const delta = raw === '—' ? null : raw;
  const up = previous !== undefined && value > previous;
  const down = previous !== undefined && value < previous;
  const good = invert ? down : up;
  const bad = invert ? up : down;
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-fg-muted">{label}</p>
        {delta ? (
          <span
            className={cn(
              'tabular inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium',
              good && 'bg-success-bg text-success-fg',
              bad && 'bg-danger-bg text-danger-fg',
              !good && !bad && 'bg-neutral-bg text-neutral-fg',
            )}
            title={hint}
          >
            <Icon className="size-3" aria-hidden />
            {delta}
          </span>
        ) : null}
      </div>
      <p className="tabular mt-3 text-3xl font-semibold leading-9 tracking-tight text-fg">
        {formatNumber(value)}
      </p>
      {hint ? <p className="mt-1 text-xs text-fg-faint">{hint}</p> : null}
    </Card>
  );
}

export function StatCardSkeleton() {
  return (
    <Card className="p-5" aria-busy>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-4 h-9 w-20" />
      <Skeleton className="mt-2 h-3 w-28" />
    </Card>
  );
}
