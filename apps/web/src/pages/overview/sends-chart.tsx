import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Overview } from '@/api/types';
import { formatDay, formatNumber } from '@/lib/format';

type Point = Overview['series'][number];

/** 30 days of sends, stacked sent over failed. Colours come straight from the tokens. */
export function SendsChart({ series }: { series: Point[] }) {
  const total = series.reduce((n, p) => n + p.sent + p.failed, 0);
  if (total === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-fg-muted">
        No sends in the last 30 days.
      </div>
    );
  }
  return (
    <div
      className="h-56 w-full"
      role="img"
      aria-label="Sends per day for the last 30 days, sent versus failed"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={series}
          margin={{ top: 4, right: 4, bottom: 0, left: -18 }}
          barCategoryGap={2}
        >
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => formatDay(d)}
            tick={{ fontSize: 11, fill: 'var(--fg-muted)' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: 'var(--fg-muted)' }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            cursor={{ fill: 'var(--bg-muted)' }}
            contentStyle={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: 12,
              color: 'var(--fg)',
            }}
            labelFormatter={(d) => (typeof d === 'string' ? formatDay(d) : '')}
            formatter={(value, name) => [
              formatNumber(Number(value)),
              name === 'sent' ? 'Sent' : 'Failed',
            ]}
          />
          <Bar dataKey="sent" stackId="a" fill="var(--emerald)" radius={[0, 0, 0, 0]} />
          <Bar dataKey="failed" stackId="a" fill="var(--danger)" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
