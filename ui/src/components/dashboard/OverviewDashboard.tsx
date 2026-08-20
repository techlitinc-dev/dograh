'use client';

import { format, subDays } from 'date-fns';
import { RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getAnalyticsOverviewApiV1OrganizationsAnalyticsOverviewGet,
  getCallsAnalyticsApiV1OrganizationsAnalyticsCallsGet,
  getCrmAnalyticsApiV1OrganizationsAnalyticsCrmGet,
} from '@/client/sdk.gen';
import type {
  AnalyticsOverviewResponse,
  CallsAnalyticsResponse,
  CrmAnalyticsResponse,
} from '@/client/types.gen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrgConfig } from '@/context/OrgConfigContext';
import { detailFromError } from '@/lib/apiError';
import { useAuth } from '@/lib/auth';

import { ChartsGrid } from './ChartsGrid';
import { KpiCards } from './KpiCards';

const RANGE_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

export function OverviewDashboard() {
  const { user, loading: authLoading } = useAuth();
  const { orgName } = useOrgConfig();

  const [days, setDays] = useState('30');
  const [overview, setOverview] = useState<AnalyticsOverviewResponse | null>(null);
  const [calls, setCalls] = useState<CallsAnalyticsResponse | null>(null);
  const [crm, setCrm] = useState<CrmAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dedupes StrictMode double-invocation while still refetching on range change.
  const lastFetchedKey = useRef<string | null>(null);

  const fetchAnalytics = useCallback(async (rangeDays: string) => {
    setLoading(true);
    setError(null);

    const end = format(new Date(), 'yyyy-MM-dd');
    const start = format(subDays(new Date(), parseInt(rangeDays) - 1), 'yyyy-MM-dd');
    const query = { start, end };

    try {
      const [overviewRes, callsRes, crmRes] = await Promise.all([
        getAnalyticsOverviewApiV1OrganizationsAnalyticsOverviewGet({ query }),
        getCallsAnalyticsApiV1OrganizationsAnalyticsCallsGet({ query }),
        getCrmAnalyticsApiV1OrganizationsAnalyticsCrmGet({ query }),
      ]);

      const firstError = overviewRes.error ?? callsRes.error ?? crmRes.error;
      if (firstError) {
        setError(detailFromError(firstError, 'Failed to load analytics'));
        return;
      }

      setOverview(overviewRes.data ?? null);
      setCalls(callsRes.data ?? null);
      setCrm(crmRes.data ?? null);
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
      setError('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    const key = `${days}`;
    if (lastFetchedKey.current === key) return;
    lastFetchedKey.current = key;
    fetchAnalytics(days);
  }, [authLoading, user, days, fetchAnalytics]);

  const isEmpty =
    overview !== null &&
    overview.calls.total === 0 &&
    overview.contacts.new_in_range === 0 &&
    overview.deals.open_count === 0 &&
    overview.deals.won_count === 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold font-display gradient-text">Overview</h1>
          <p className="text-muted-foreground">
            {orgName ? `${orgName} workspace at a glance` : 'Your workspace at a glance'}
          </p>
        </div>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Date range" />
          </SelectTrigger>
          <SelectContent>
            {RANGE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[110px]" />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[320px]" />
            ))}
          </div>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <Card className="p-6 flex flex-col items-center gap-4">
          <p className="text-center text-red-500">{error}</p>
          <Button variant="outline" size="sm" onClick={() => fetchAnalytics(days)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </Card>
      )}

      {/* Dashboard Content */}
      {overview && calls && crm && !loading && !error && (
        <>
          <KpiCards overview={overview} />

          {isEmpty ? (
            <Card className="p-10 flex flex-col items-center gap-4 text-center">
              <p className="text-lg font-medium">No activity yet</p>
              <p className="text-muted-foreground max-w-md">
                No calls, contacts, or deals in this range. Launch your first voice agent
                to start seeing analytics here.
              </p>
              <div className="flex gap-3">
                <Button asChild>
                  <Link href="/workflow">Launch a voice agent</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/contacts">Add contacts</Link>
                </Button>
              </div>
            </Card>
          ) : (
            <ChartsGrid calls={calls} crm={crm} />
          )}
        </>
      )}
    </div>
  );
}
