import { MESSAGE_STATUSES, type MessageStatus } from '@postrail/shared';

export const RANGE_PRESETS = ['24h', '7d', '30d', 'custom'] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

/** Everything the logs page needs lives in the URL, so a filtered view is a shareable link. */
export interface LogFilters {
  status: MessageStatus | '';
  mailbox: string;
  range: RangePreset;
  from: string;
  to: string;
  q: string;
  cursor: string;
}

const RANGE_MS: Record<Exclude<RangePreset, 'custom'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

export const DEFAULT_FILTERS: LogFilters = {
  status: '',
  mailbox: '',
  range: '7d',
  from: '',
  to: '',
  q: '',
  cursor: '',
};

function isStatus(value: string): value is MessageStatus {
  return (MESSAGE_STATUSES as readonly string[]).includes(value);
}

function isPreset(value: string): value is RangePreset {
  return (RANGE_PRESETS as readonly string[]).includes(value);
}

export function readFilters(params: URLSearchParams): LogFilters {
  const status = params.get('status') ?? '';
  const range = params.get('range') ?? DEFAULT_FILTERS.range;
  return {
    status: isStatus(status) ? status : '',
    mailbox: params.get('mailbox') ?? '',
    range: isPreset(range) ? range : DEFAULT_FILTERS.range,
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    q: params.get('q') ?? '',
    cursor: params.get('cursor') ?? '',
  };
}

/** Only non-default values are written, so plain `/logs` stays clean. */
export function writeFilters(
  filters: LogFilters,
  base: URLSearchParams = new URLSearchParams(),
): URLSearchParams {
  const params = new URLSearchParams(base);
  for (const key of Object.keys(DEFAULT_FILTERS) as Array<keyof LogFilters>) {
    const value = filters[key];
    if (value && value !== DEFAULT_FILTERS[key]) params.set(key, value);
    else params.delete(key);
  }
  return params;
}

/** Translates the URL state into API query parameters. */
export function toQuery(filters: LogFilters, now: Date = new Date()) {
  let from: string | undefined;
  let to: string | undefined;
  if (filters.range === 'custom') {
    from = filters.from ? new Date(filters.from).toISOString() : undefined;
    to = filters.to ? new Date(filters.to).toISOString() : undefined;
  } else {
    from = new Date(now.getTime() - RANGE_MS[filters.range]).toISOString();
  }
  return {
    limit: 25,
    ...(filters.cursor ? { cursor: filters.cursor } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.mailbox ? { mailbox_id: filters.mailbox } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(filters.q ? { q: filters.q } : {}),
  };
}
