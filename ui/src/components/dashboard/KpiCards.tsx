'use client';

import { DollarSign, type LucideIcon, Phone, PhoneCall, Timer, Trophy, Users } from 'lucide-react';

import type { AnalyticsOverviewResponse } from '@/client/types.gen';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface KpiCardsProps {
  overview: AnalyticsOverviewResponse;
}

const formatDuration = (seconds: number): string => {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const formatUsd = (value: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);

function KpiCard({
  title,
  value,
  sub,
  icon: Icon,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
}) {
  return (
    <Card className="glass-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-glow" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold font-display">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function KpiCards({ overview }: KpiCardsProps) {
  const { calls, contacts, deals } = overview;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <KpiCard
        title="Total Calls"
        value={calls.total.toLocaleString()}
        sub={`${calls.inbound} inbound · ${calls.outbound} outbound`}
        icon={Phone}
      />
      <KpiCard
        title="Connect Rate"
        value={`${Math.round(calls.connect_rate * 100)}%`}
        sub={`${calls.completed} completed calls`}
        icon={PhoneCall}
      />
      <KpiCard
        title="Avg Call Duration"
        value={formatDuration(calls.avg_duration_seconds)}
        sub={`${formatUsd(calls.total_cost_usd)} total cost`}
        icon={Timer}
      />
      <KpiCard
        title="New Contacts"
        value={contacts.new_in_range.toLocaleString()}
        sub={`${contacts.total.toLocaleString()} total contacts`}
        icon={Users}
      />
      <KpiCard
        title="Open Pipeline"
        value={formatUsd(deals.open_value)}
        sub={`${deals.open_count} open deals`}
        icon={DollarSign}
      />
      <KpiCard
        title="Win Rate"
        value={`${Math.round(deals.win_rate * 100)}%`}
        sub={`${deals.won_count} won · ${deals.lost_count} lost`}
        icon={Trophy}
      />
    </div>
  );
}
