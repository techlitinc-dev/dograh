from datetime import datetime
from typing import Any

from api.db import db_client

# Same 6-bucket shape as the daily report's call_duration_distribution.
DURATION_BUCKETS = [
    ("0-10", 0, 10),
    ("10-30", 10, 30),
    ("30-60", 30, 60),
    ("60-120", 60, 120),
    ("120-180", 120, 180),
    (">180", 180, None),
]


class AnalyticsService:
    """Composes org-scoped analytics aggregates and derives rates.

    All heavy lifting (grouping, summing) happens in SQL via the analytics
    db client; this layer only computes ratios and fixed bucket shapes.
    """

    async def get_overview(
        self,
        organization_id: int,
        start_utc: datetime,
        end_utc: datetime,
        now: datetime,
    ) -> dict[str, Any]:
        calls = await db_client.get_calls_overview(organization_id, start_utc, end_utc)
        contacts = await db_client.get_contacts_overview(
            organization_id, start_utc, end_utc
        )
        deals = await db_client.get_deals_overview(organization_id, start_utc, end_utc)
        tasks = await db_client.get_tasks_overview(
            organization_id, start_utc, end_utc, now
        )

        total_calls = calls["total"]
        calls["connect_rate"] = (
            round(calls["completed"] / total_calls, 4) if total_calls > 0 else 0.0
        )

        won = deals["won_count"]
        lost = deals["lost_count"]
        deals["win_rate"] = round(won / (won + lost), 4) if (won + lost) > 0 else 0.0

        return {
            "calls": calls,
            "contacts": contacts,
            "deals": deals,
            "tasks": tasks,
        }

    async def get_calls(
        self, organization_id: int, start_utc: datetime, end_utc: datetime
    ) -> dict[str, Any]:
        daily = await db_client.get_calls_daily_series(
            organization_id, start_utc, end_utc
        )
        dispositions = await db_client.get_calls_disposition_breakdown(
            organization_id, start_utc, end_utc
        )
        bucket_counts = await db_client.get_calls_duration_buckets(
            organization_id, start_utc, end_utc
        )

        duration_buckets = [
            {
                "bucket": label,
                "range_start": range_start,
                "range_end": range_end,
                "count": bucket_counts.get(label, 0),
            }
            for label, range_start, range_end in DURATION_BUCKETS
        ]

        return {
            "daily": daily,
            "dispositions": dispositions,
            "duration_buckets": duration_buckets,
        }

    async def get_crm(
        self, organization_id: int, start_utc: datetime, end_utc: datetime
    ) -> dict[str, Any]:
        return {
            "contacts_growth": await db_client.get_contacts_growth_daily(
                organization_id, start_utc, end_utc
            ),
            "contacts_by_source": await db_client.get_contacts_by_source(
                organization_id
            ),
            "deals_by_stage": await db_client.get_deals_by_stage(organization_id),
            "deals_won_lost_per_day": await db_client.get_deals_won_lost_daily(
                organization_id, start_utc, end_utc
            ),
            "activities_per_day_by_type": await db_client.get_activities_daily_by_type(
                organization_id, start_utc, end_utc
            ),
        }
