import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * The Postrail mark: a "P" whose bowl is an envelope, on an emerald tile. Drawn inline so
 * it is sharp at any size and needs no request. The same artwork lives in
 * public/brand/postrail-icon.svg (favicon) and /brand at the repo root.
 */
export function LogoMark({ className }: { className?: string }) {
  // Several marks can be on screen at once; each needs its own gradient id.
  const gradient = useId();
  return (
    <svg viewBox="0 0 512 512" className={cn('size-7 shrink-0', className)} aria-hidden>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#10B981" />
          <stop offset="1" stopColor="#047857" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="124" fill={`url(#${gradient})`} />
      <path
        d="M154 142H268a90 90 0 0 1 0 180H198V370H154Z"
        fill="#fff"
        stroke="#fff"
        strokeWidth="28"
        strokeLinejoin="round"
      />
      <path
        d="M190 190 258 246 326 190"
        fill="none"
        stroke="#059669"
        strokeWidth="26"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Mark plus wordmark. The name is live text in the interface font, so it follows the
 * theme. `lg` is for the sign-in and invite cards.
 */
export function Logo({ size = 'md', className }: { size?: 'md' | 'lg'; className?: string }) {
  return (
    <span
      role="img"
      aria-label="Postrail"
      className={cn('inline-flex items-center', size === 'lg' ? 'gap-3' : 'gap-2.5', className)}
    >
      <LogoMark className={size === 'lg' ? 'size-10' : 'size-7'} />
      <span
        aria-hidden
        className={cn(
          'font-semibold tracking-tight text-fg',
          size === 'lg' ? 'text-2xl' : 'text-lg',
        )}
      >
        Postrail
      </span>
    </span>
  );
}
