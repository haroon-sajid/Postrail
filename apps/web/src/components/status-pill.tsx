import { Badge, type BadgeTone } from '@/components/ui/badge';

const TONES: Record<string, BadgeTone> = {
  sent: 'success',
  delivered: 'success',
  active: 'success',
  queued: 'neutral',
  sending: 'neutral',
  pending: 'warning',
  paused: 'warning',
  failed: 'danger',
  disconnected: 'danger',
  revoked: 'danger',
};

/** One colour per status across the whole console (see DESIGN.md). */
export function StatusPill({ status }: { status: string }) {
  return (
    <Badge tone={TONES[status] ?? 'neutral'} className="capitalize">
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-70" />
      {status}
    </Badge>
  );
}
