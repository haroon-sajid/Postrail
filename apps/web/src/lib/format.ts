import { format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns';

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = typeof value === 'string' ? parseISO(value) : value;
  return isValid(date) ? date : null;
}

/** "3m ago", "2h ago", "5d ago". For table cells; pair with `formatAbsolute` in a title. */
export function formatRelative(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return '—';
  const text = formatDistanceToNowStrict(date, { addSuffix: true });
  return text
    .replace(' seconds', 's')
    .replace(' second', 's')
    .replace(' minutes', 'm')
    .replace(' minute', 'm')
    .replace(' hours', 'h')
    .replace(' hour', 'h')
    .replace(' days', 'd')
    .replace(' day', 'd')
    .replace(' months', 'mo')
    .replace(' month', 'mo')
    .replace(' years', 'y')
    .replace(' year', 'y');
}

/** "29 Sep 2026, 14:03:22" in the user's timezone. For drawers, tooltips and details. */
export function formatAbsolute(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? format(date, 'd MMM yyyy, HH:mm:ss') : '—';
}

export function formatDay(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? format(date, 'd MMM') : '—';
}

const numberFormat = new Intl.NumberFormat(undefined);

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

/** "+12%", "−8%", or "—" when there is no baseline. */
export function formatDelta(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? '—' : 'new';
  const pct = Math.round(((current - previous) / previous) * 100);
  return `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct)}%`;
}

export function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(100, Math.round((part / whole) * 100));
}
