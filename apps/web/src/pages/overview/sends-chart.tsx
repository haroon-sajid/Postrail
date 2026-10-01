import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Overview } from '@/api/types';
import { formatDay, formatNumber } from '@/lib/format';

type Point = Overview['series'][number];

/** Small legend for the card header. */
export function SendsLegend() {
  return (
    <div className="flex items-center gap-4 text-xs text-fg-muted">
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-sm bg-primary" aria-hidden /> Sent
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-sm bg-danger" aria-hidden /> Failed
      </span>
    </div>
  );
}

/**
 * 30 days of sends, stacked sent over failed. Colours come straight from the tokens.
 * `label` replaces the description when the points are not one per day.
 */
export function SendsChart({
  series,
  label = 'Sends per day for the last 30 days, sent versus failed',
}: {
  series: Point[];
  label?: string;
}) {
  const total = series.reduce((n, p) => n + p.sent + p.failed, 0);
  const empty = total === 0;
  return (
    <div className="relative">
      <div
        className={empty ? 'h-64 w-full opacity-60' : 'h-64 w-full'}
        role="img"
        aria-label={empty ? 'No sends in the last 30 days' : label}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={series} margin={{ top: 8, right: 0, bottom: 0, left: -16 }} barGap={2}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => formatDay(d)}
              tick={{ fontSize: 11, fill: 'var(--fg-faint)' }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={28}
              dy={6}
            />
            <YAxis
              allowDecimals={false}
              domain={empty ? [0, 4] : ['auto', 'auto']}
              tick={{ fontSize: 11, fill: 'var(--fg-faint)' }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            {!empty ? (
              <Tooltip
                cursor={{ fill: 'var(--bg-muted)', radius: 4 }}
                contentStyle={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  boxShadow: 'var(--shadow-md)',
                  fontSize: 12,
                  color: 'var(--fg)',
                  padding: '8px 12px',
                }}
                labelStyle={{ color: 'var(--fg-muted)', marginBottom: 4 }}
                labelFormatter={(d) => (typeof d === 'string' ? formatDay(d) : '')}
                formatter={(value, name) => [
                  formatNumber(Number(value)),
                  name === 'sent' ? 'Sent' : 'Failed',
                ]}
              />
            ) : null}
            <Bar dataKey="sent" stackId="a" fill="var(--primary)" radius={[0, 0, 0, 0]} />
            <Bar dataKey="failed" stackId="a" fill="var(--danger)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {empty ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-md border border-border bg-bg/95 px-4 py-2.5 text-center shadow-xs">
            <p className="text-sm font-medium text-fg">No sends in the last 30 days</p>
            <p className="text-xs text-fg-muted">Your daily volume shows here once you send.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
