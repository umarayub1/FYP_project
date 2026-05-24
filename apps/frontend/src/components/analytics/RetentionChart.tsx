'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from 'recharts';

interface RetentionDatum {
  date: string;
  label: string;
  retentionRate: number;
  cardsReviewed: number;
}

interface RetentionTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: { retentionRate: number; cardsReviewed: number; label: string } }>;
  label?: string;
}

function RetentionTooltip({ active, payload, label }: RetentionTooltipProps) {
  if (!active || !payload?.length) return null;
  const { retentionRate, cardsReviewed } = payload[0]?.payload ?? { retentionRate: 0, cardsReviewed: 0, label: '' };
  return (
    <div className="bg-[hsl(var(--surface))] border border-[hsl(var(--border))] shadow-md rounded-md px-3 py-2">
      <p className="text-xs text-[hsl(var(--foreground-muted))] mb-1">{label}</p>
      <p className="font-mono text-xs">
        <span className="text-[hsl(var(--primary))] font-medium">{retentionRate}%</span>
        <span className="text-[hsl(var(--foreground-muted))] ml-2">retention</span>
      </p>
      <p className="font-mono text-xs text-[hsl(var(--foreground-muted))]">
        {cardsReviewed} cards reviewed
      </p>
    </div>
  );
}

export function RetentionChart({ data }: { data: RetentionDatum[] }) {
  const xTicks = data.filter((_, i) => i % 7 === 0).map(d => d.date);

  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="retentionFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="label"
          ticks={xTicks.map(d => data.find(e => e.date === d)?.label ?? '')}
          tick={{ fontFamily: 'var(--font-mono)', fontSize: 10, fill: 'hsl(var(--foreground-muted))' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fontFamily: 'var(--font-mono)', fontSize: 10, fill: 'hsl(var(--foreground-muted))' }}
          tickFormatter={v => `${v}%`}
          axisLine={false}
          tickLine={false}
          ticks={[0, 25, 50, 75, 100]}
        />
        <RechartsTooltip
          content={<RetentionTooltip />}
          cursor={{ stroke: 'hsl(var(--border-strong))', strokeWidth: 1 }}
        />
        <Area
          type="monotone"
          dataKey="retentionRate"
          stroke="hsl(var(--primary))"
          strokeWidth={1.5}
          fill="url(#retentionFill)"
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
