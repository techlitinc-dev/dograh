'use client';

import { format, parseISO } from 'date-fns';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type {
  CallsAnalyticsResponse,
  CrmAnalyticsResponse,
} from '@/client/types.gen';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

const formatAxisDate = (date: string): string => {
  try {
    return format(parseISO(date), 'MMM d');
  } catch {
    return date;
  }
};

const formatUsd = (value: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-background border rounded-lg shadow-lg p-3 text-sm">
      {label && <p className="font-semibold mb-1">{formatAxisDate(label)}</p>}
      {payload.map((entry, i) => (
        <p key={i} className="flex items-center gap-2">
          {entry.color && (
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
          )}
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium">{entry.value}</span>
        </p>
      ))}
    </div>
  );
}

function ChartCard({
  title,
  empty,
  emptyMessage,
  children,
}: {
  title: string;
  empty?: boolean;
  emptyMessage?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {empty ? (
          <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm text-center px-4">
            {emptyMessage ?? 'No data for this range yet'}
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

const axisTick = { fontSize: 12, fill: 'var(--muted-foreground)' };

interface ChartsGridProps {
  calls: CallsAnalyticsResponse;
  crm: CrmAnalyticsResponse;
}

export function ChartsGrid({ calls, crm }: ChartsGridProps) {
  const daily = calls.daily;
  const hasDaily = daily.some((d) => d.total > 0);

  const dispositions = calls.dispositions;
  const hasDispositions = dispositions.some((d) => d.count > 0);

  let cumulative = 0;
  const growth = crm.contacts_growth.map((p) => {
    cumulative += p.count;
    return { date: p.date, new: p.count, total: cumulative };
  });
  const hasGrowth = cumulative > 0;

  const stages = crm.deals_by_stage;
  const hasStages = stages.some((s) => s.count > 0);

  const wonPerDay = crm.deals_won_lost_per_day;
  const hasWon = wonPerDay.some((d) => d.won_value > 0 || d.lost_count > 0);

  const activityTypes = Array.from(
    new Set(crm.activities_per_day_by_type.map((a) => a.type)),
  );
  const activityByDate = new Map<string, Record<string, number | string>>();
  for (const point of crm.activities_per_day_by_type) {
    const row = activityByDate.get(point.date) ?? { date: point.date };
    row[point.type] = ((row[point.type] as number) ?? 0) + point.count;
    activityByDate.set(point.date, row);
  }
  const activities = Array.from(activityByDate.values()).sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  );
  const hasActivities = activities.length > 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {/* 1. Calls per day */}
      <ChartCard
        title="Calls per Day"
        empty={!hasDaily}
        emptyMessage="No calls in this range — launch a voice agent to start calling"
      >
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={daily} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
            <XAxis dataKey="date" tickFormatter={formatAxisDate} tick={axisTick} />
            <YAxis tick={axisTick} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="total" name="Total" fill="var(--chart-1)" fillOpacity={0.5} radius={[3, 3, 0, 0]} />
            <Line dataKey="completed" name="Completed" stroke="var(--chart-2)" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 2. Call dispositions */}
      <ChartCard title="Call Dispositions" empty={!hasDispositions}>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart
            data={dispositions}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" opacity={0.1} horizontal={false} />
            <XAxis type="number" tick={axisTick} allowDecimals={false} />
            <YAxis type="category" dataKey="disposition" width={110} tick={axisTick} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'transparent' }} />
            <Bar dataKey="count" name="Calls" radius={[0, 4, 4, 0]}>
              {dispositions.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 3. Contact growth */}
      <ChartCard
        title="Contact Growth"
        empty={!hasGrowth}
        emptyMessage="No new contacts in this range — import or add contacts to grow your list"
      >
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={growth} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
            <XAxis dataKey="date" tickFormatter={formatAxisDate} tick={axisTick} />
            <YAxis tick={axisTick} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} />
            <Area
              type="monotone"
              dataKey="total"
              name="Total contacts"
              stroke="var(--chart-3)"
              fill="var(--chart-3)"
              fillOpacity={0.2}
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="new"
              name="New"
              stroke="var(--chart-4)"
              fill="var(--chart-4)"
              fillOpacity={0.15}
              strokeWidth={1.5}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 4. Deals by stage */}
      <ChartCard
        title="Deals by Stage"
        empty={!hasStages}
        emptyMessage="No deals yet — create deals in your pipeline to track stages"
      >
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={stages} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
            <XAxis dataKey="stage" tick={axisTick} />
            <YAxis tick={axisTick} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: 'transparent' }}
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const stage = payload[0].payload as { stage: string; count: number; total_value: number };
                return (
                  <div className="bg-background border rounded-lg shadow-lg p-3 text-sm">
                    <p className="font-semibold mb-1">{stage.stage}</p>
                    <p className="text-muted-foreground">
                      Deals: <span className="text-foreground font-medium">{stage.count}</span>
                    </p>
                    <p className="text-muted-foreground">
                      Value: <span className="text-foreground font-medium">{formatUsd(stage.total_value)}</span>
                    </p>
                  </div>
                );
              }}
            />
            <Bar dataKey="count" name="Deals" fill="var(--chart-1)" radius={[4, 4, 0, 0]}>
              {stages.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 5. Revenue won per day */}
      <ChartCard
        title="Revenue Won"
        empty={!hasWon}
        emptyMessage="No deals closed in this range"
      >
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={wonPerDay} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
            <XAxis dataKey="date" tickFormatter={formatAxisDate} tick={axisTick} />
            <YAxis tick={axisTick} tickFormatter={(v: number) => formatUsd(v)} width={70} />
            <Tooltip
              cursor={{ fill: 'transparent' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.[0]) return null;
                const point = payload[0].payload as { won_value: number; lost_count: number };
                return (
                  <div className="bg-background border rounded-lg shadow-lg p-3 text-sm">
                    {label && <p className="font-semibold mb-1">{formatAxisDate(String(label))}</p>}
                    <p className="text-muted-foreground">
                      Won: <span className="text-foreground font-medium">{formatUsd(point.won_value)}</span>
                    </p>
                    <p className="text-muted-foreground">
                      Lost deals: <span className="text-foreground font-medium">{point.lost_count}</span>
                    </p>
                  </div>
                );
              }}
            />
            <Bar dataKey="won_value" name="Won" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 6. Activities by type */}
      <ChartCard
        title="Activities by Type"
        empty={!hasActivities}
        emptyMessage="No activities logged in this range"
      >
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={activities} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
            <XAxis dataKey="date" tickFormatter={formatAxisDate} tick={axisTick} />
            <YAxis tick={axisTick} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'transparent' }} />
            {activityTypes.map((type, i) => (
              <Bar
                key={type}
                dataKey={type}
                name={type}
                stackId="activities"
                fill={CHART_COLORS[i % CHART_COLORS.length]}
                radius={i === activityTypes.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
