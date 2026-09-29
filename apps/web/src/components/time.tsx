import { formatAbsolute, formatRelative } from '@/lib/format';

/** Relative in tables, absolute on hover, both in the user's timezone. */
export function RelativeTime({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  if (!value) return <span className={className}>—</span>;
  return (
    <time dateTime={value} title={formatAbsolute(value)} className={className}>
      {formatRelative(value)}
    </time>
  );
}

export function AbsoluteTime({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  if (!value) return <span className={className}>—</span>;
  return (
    <time dateTime={value} className={className}>
      {formatAbsolute(value)}
    </time>
  );
}
