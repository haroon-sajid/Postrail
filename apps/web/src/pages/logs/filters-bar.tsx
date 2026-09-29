import { MESSAGE_STATUSES } from '@postrail/shared/browser';
import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Mailbox } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DEFAULT_FILTERS, type LogFilters, RANGE_PRESETS, type RangePreset } from './filters';

const ALL = '__all__';
const RANGE_LABELS: Record<RangePreset, string> = {
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  custom: 'Custom range',
};

export interface FiltersBarProps {
  filters: LogFilters;
  mailboxes: Mailbox[];
  onChange: (next: LogFilters) => void;
}

/** Status, mailbox, date range and search. Any change resets the cursor to page one. */
export function FiltersBar({ filters, mailboxes, onChange }: FiltersBarProps) {
  const [q, setQ] = useState(filters.q);
  // Adopt an external change to `q` (Clear, back button) without an effect: the
  // "previous prop" pattern re-renders synchronously and keeps typing uninterrupted.
  const [seenQ, setSeenQ] = useState(filters.q);
  if (filters.q !== seenQ) {
    setSeenQ(filters.q);
    setQ(filters.q);
  }

  const update = (patch: Partial<LogFilters>) => onChange({ ...filters, ...patch, cursor: '' });
  const isDefault =
    !filters.status && !filters.mailbox && !filters.q && filters.range === DEFAULT_FILTERS.range;

  // Debounce typing; Enter applies immediately.
  useEffect(() => {
    if (q === filters.q) return;
    const t = setTimeout(() => update({ q }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex flex-wrap items-end gap-2" role="search" aria-label="Filter logs">
      <div className="w-full sm:w-64">
        <Label htmlFor="log-search" className="sr-only">
          Search by recipient or subject
        </Label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-2 size-4 text-fg-muted"
            aria-hidden
          />
          <Input
            id="log-search"
            placeholder="Search recipient or subject"
            className="pl-8"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') update({ q });
            }}
          />
        </div>
      </div>

      <div className="w-[calc(50%-4px)] sm:w-36">
        <Label htmlFor="log-status" className="sr-only">
          Status
        </Label>
        <Select
          value={filters.status || ALL}
          onValueChange={(v) => update({ status: v === ALL ? '' : (v as LogFilters['status']) })}
        >
          <SelectTrigger id="log-status" aria-label="Status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {MESSAGE_STATUSES.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-[calc(50%-4px)] sm:w-52">
        <Label htmlFor="log-mailbox" className="sr-only">
          Mailbox
        </Label>
        <Select
          value={filters.mailbox || ALL}
          onValueChange={(v) => update({ mailbox: v === ALL ? '' : v })}
        >
          <SelectTrigger id="log-mailbox" aria-label="Mailbox">
            <SelectValue placeholder="Mailbox" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All mailboxes</SelectItem>
            {mailboxes.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-[calc(50%-4px)] sm:w-40">
        <Label htmlFor="log-range" className="sr-only">
          Date range
        </Label>
        <Select value={filters.range} onValueChange={(v) => update({ range: v as RangePreset })}>
          <SelectTrigger id="log-range" aria-label="Date range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGE_PRESETS.map((r) => (
              <SelectItem key={r} value={r}>
                {RANGE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filters.range === 'custom' ? (
        <>
          <div className="w-[calc(50%-4px)] sm:w-44">
            <Label htmlFor="log-from" className="sr-only">
              From
            </Label>
            <Input
              id="log-from"
              type="datetime-local"
              aria-label="From"
              value={filters.from}
              onChange={(e) => update({ from: e.target.value })}
            />
          </div>
          <div className="w-[calc(50%-4px)] sm:w-44">
            <Label htmlFor="log-to" className="sr-only">
              To
            </Label>
            <Input
              id="log-to"
              type="datetime-local"
              aria-label="To"
              value={filters.to}
              onChange={(e) => update({ to: e.target.value })}
            />
          </div>
        </>
      ) : null}

      {!isDefault ? (
        <Button variant="ghost" size="sm" onClick={() => onChange({ ...DEFAULT_FILTERS })}>
          <X /> Clear
        </Button>
      ) : null}
    </div>
  );
}
