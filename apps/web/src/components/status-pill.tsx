import { Badge, type BadgeTone } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const TONES: Record<string, BadgeTone> = {
  sent: 'success',
  delivered: 'success',
  active: 'success',
  queued: 'neutral',
  sending: 'info',
  pending: 'warning',
  paused: 'warning',
  failed: 'danger',
  disconnected: 'danger',
  revoked: 'danger',
};

/** One colour per status across the whole console (see DESIGN.md). */
export function StatusPill({ status }: { status: string }) {
  const live = status === 'sending';
  return (
    <Badge tone={TONES[status] ?? 'neutral'} className="capitalize">
      <span
        aria-hidden
        className={cn('size-1.5 rounded-full bg-current', live ? 'animate-pulse' : 'opacity-70')}
      />
      {status}
    </Badge>
  );
}
