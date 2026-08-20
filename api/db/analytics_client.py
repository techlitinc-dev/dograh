"""Org-scoped SQL aggregate queries for the CRM analytics dashboard.

All methods aggregate in SQL (GROUP BY / filtered aggregates) — no row
fetching into Python. Every query filters by organization_id, either
directly (CRM tables) or through the workflow join (workflow_runs).

Ranges are [start_utc, end_utc) — end exclusive.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import Date, String, and_, case, cast, func, select

from api.db.base_client import BaseDBClient
from api.db.models import (
    ActivityModel,
    ContactModel,
    DealModel,
    WorkflowModel,
    WorkflowRunModel,
)
from api.enums import ActivityType, CallType, DealStatus


def _duration_seconds_expr():
    return WorkflowRunModel.usage_info["call_duration_seconds"].as_float()


def _charge_usd_expr():
    return WorkflowRunModel.cost_info["charge_usd"].as_float()


def _disposition_expr():
    # JSON (not JSONB) column: follow the reports_client extraction pattern —
    # cast to String yields quoted JSON text, so strip quotes.
    return func.coalesce(
        func.replace(
            func.replace(
                cast(
                    WorkflowRunModel.gathered_context["mapped_call_disposition"],
                    String,
                ),
                '"',
                "",
            ),
            "'",
            "",
        ),
        "UNKNOWN",
    )


def _day_expr(column):
    return cast(func.timezone("UTC", column), Date)


class AnalyticsClient(BaseDBClient):
    """Client for org-scoped analytics aggregation queries."""

    def _runs_base_where(
        self, organization_id: int, start_utc: datetime, end_utc: datetime
    ):
        return and_(
            WorkflowModel.organization_id == organization_id,
            WorkflowRunModel.created_at >= start_utc,
            WorkflowRunModel.created_at < end_utc,
        )

    async def get_calls_overview(
        self, organization_id: int, start_utc: datetime, end_utc: datetime
    ) -> dict[str, Any]:
        async with self.async_session() as session:
            duration = _duration_seconds_expr()
            result = await session.execute(
                select(
                    func.count(WorkflowRunModel.id).label("total"),
                    func.count(WorkflowRunModel.id)
                    .filter(WorkflowRunModel.is_completed == True)
                    .label("completed"),
                    func.coalesce(func.avg(duration), 0.0).label(
                        "avg_duration_seconds"
                    ),
                    func.coalesce(func.sum(_charge_usd_expr()), 0.0).label(
                        "total_cost_usd"
                    ),
                    func.count(WorkflowRunModel.id)
                    .filter(WorkflowRunModel.call_type == CallType.INBOUND.value)
                    .label("inbound"),
                    func.count(WorkflowRunModel.id)
                    .filter(WorkflowRunModel.call_type == CallType.OUTBOUND.value)
                    .label("outbound"),
                )
                .select_from(WorkflowRunModel)
                .join(WorkflowModel, WorkflowRunModel.workflow_id == WorkflowModel.id)
                .where(self._runs_base_where(organization_id, start_utc, end_utc))
            )
            row = result.one()
            return {
                "total": row.total,
                "completed": row.completed,
                "avg_duration_seconds": float(row.avg_duration_seconds or 0.0),
                "total_cost_usd": float(row.total_cost_usd or 0.0),
                "inbound": row.inbound,
                "outbound": row.outbound,
            }

    async def get_calls_daily_series(
        self, organization_id: int, start_utc: datetime, end_utc: datetime
    ) -> list[dict[str, Any]]:
        async with self.async_session() as session:
            day = _day_expr(WorkflowRunModel.created_at)
            duration = _duration_seconds_expr()
            result = await session.execute(
                select(
                    day.label("date"),
                    func.count(WorkflowRunModel.id).label("total"),
                    func.count(WorkflowRunModel.id)
                    .filter(WorkflowRunModel.is_completed == True)
                    .label("completed"),
                    func.coalesce(func.avg(duration), 0.0).label(
                        "avg_duration_seconds"
                    ),
                    func.coalesce(func.sum(_charge_usd_expr()), 0.0).label("cost_usd"),
                )
                .select_from(WorkflowRunModel)
                .join(WorkflowModel, WorkflowRunModel.workflow_id == WorkflowModel.id)
                .where(self._runs_base_where(organization_id, start_utc, end_utc))
                .group_by(day)
                .order_by(day)
            )
            return [
                {
                    "date": row.date.isoformat(),
                    "total": row.total,
                    "completed": row.completed,
                    "avg_duration_seconds": float(row.avg_duration_seconds or 0.0),
                    "cost_usd": float(row.cost_usd or 0.0),
                }
                for row in result
            ]

    async def get_calls_disposition_breakdown(
        self, organization_id: int, start_utc: datetime, end_utc: datetime
    ) -> list[dict[str, Any]]:
        async with self.async_session() as session:
            disposition = _disposition_expr()
            result = await session.execute(
                select(
                    disposition.label("disposition"),
                    func.count(WorkflowRunModel.id).label("count"),
                )
                .select_from(WorkflowRunModel)
                .join(WorkflowModel, WorkflowRunModel.workflow_id == WorkflowModel.id)
                .where(
                    self._runs_base_where(organization_id, start_utc, end_utc),
                    WorkflowRunModel.gathered_context.isnot(None),
                )
                .group_by(disposition)
                .order_by(func.count(WorkflowRunModel.id).desc())
            )
            return [
                {"disposition": row.disposition, "count": row.count} for row in result
            ]

    async def get_calls_duration_buckets(
        self, organization_id: int, start_utc: datetime, end_utc: datetime
    ) -> dict[str, int]:
        """Return {bucket_label: count} for runs that have a duration."""
        async with self.async_session() as session:
            duration = _duration_seconds_expr()
            bucket = case(
                (duration < 10, "0-10"),
                (duration < 30, "10-30"),
                (duration < 60, "30-60"),
                (duration < 120, "60-120"),
                (duration < 180, "120-180"),
                else_=">180",
            )
            result = await session.execute(
                select(
                    bucket.label("bucket"),
                    func.count(WorkflowRunModel.id).label("count"),
                )
                .select_from(WorkflowRunModel)
                .join(WorkflowModel, WorkflowRunModel.workflow_id == WorkflowModel.id)
                .where(
                    self._runs_base_where(organization_id, start_utc, end_utc),
                    duration.isnot(None),
                )
                .group_by(bucket)
            )
            return {row.bucket: row.count for row in result}

    async def get_contacts_overview(
        self, organization_id: int, start_utc: datetime, end_utc: datetime
    ) -> dict[str, Any]:
        async with self.async_session() as session:
            base_where = and_(
                ContactModel.organization_id == organization_id,
                ContactModel.deleted_at.is_(None),
            )
            totals = await session.execute(
                select(
                    func.count(ContactModel.id).label("total"),
                    func.count(ContactModel.id)
                    .filter(
                        ContactModel.created_at >= start_utc,
                        ContactModel.created_at < end_utc,
                    )
                    .label("new_in_range"),
                ).where(base_where)
            )
            totals_row = totals.one()

            stages = await session.execute(
                select(
                    ContactModel.lifecycle_stage.label("stage"),
                    func.count(ContactModel.id).label("count"),
                )
                .where(base_where)
                .group_by(ContactModel.lifecycle_stage)
            )
            return {
                "total": totals_row.total,
                "new_in_range": totals_row.new_in_range,
                "by_lifecycle_stage": {row.stage: row.count for row in stages},
            }

    async def get_contacts_growth_daily(
        self, organization_id: int, start_utc: datetime, end_utc: datetime
    ) -> list[dict[str, Any]]:
        async with self.async_session() as session:
            day = _day_expr(ContactModel.created_at)
            result = await session.execute(
                select(
                    day.label("date"),
                    func.count(ContactModel.id).label("count"),
                )
                .where(
                    ContactModel.organization_id == organization_id,
                    ContactModel.deleted_at.is_(None),
                    ContactModel.created_at >= start_utc,
                    ContactModel.created_at < end_utc,
                )
                .group_by(day)
                .order_by(day)
            )
            return [
                {"date": row.date.isoformat(), "count": row.count} for row in result
            ]

    async def get_contacts_by_source(
        self, organization_id: int
    ) -> list[dict[str, Any]]:
        async with self.async_session() as session:
            result = await session.execute(
                select(
                    ContactModel.source.label("source"),
                    func.count(ContactModel.id).label("count"),
                )
                .where(
                    ContactModel.organization_id == organization_id,
                    ContactModel.deleted_at.is_(None),
                )
                .group_by(ContactModel.source)
                .order_by(func.count(ContactModel.id).desc())
            )
            return [{"source": row.source, "count": row.count} for row in result]

    async def get_deals_overview(
        self, organization_id: int, start_utc: datetime, end_utc: datetime
    ) -> dict[str, Any]:
        """Open pipeline snapshot plus won/lost counts for the range.

        Won/lost "in range" is keyed on updated_at — deals carry no closed_at
        column, so the last update is the close event approximation.
        """
        async with self.async_session() as session:
            open_q = await session.execute(
                select(
                    func.count(DealModel.id).label("open_count"),
                    func.coalesce(func.sum(DealModel.value), 0.0).label("open_value"),
                ).where(
                    DealModel.organization_id == organization_id,
                    DealModel.status == DealStatus.OPEN.value,
                )
            )
            open_row = open_q.one()

            closed_q = await session.execute(
                select(
                    func.count(DealModel.id)
                    .filter(DealModel.status == DealStatus.WON.value)
                    .label("won_count"),
                    func.coalesce(
                        func.sum(DealModel.value).filter(
                            DealModel.status == DealStatus.WON.value
                        ),
                        0.0,
                    ).label("won_value"),
                    func.count(DealModel.id)
                    .filter(DealModel.status == DealStatus.LOST.value)
                    .label("lost_count"),
                ).where(
                    DealModel.organization_id == organization_id,
                    DealModel.status.in_([DealStatus.WON.value, DealStatus.LOST.value]),
                    DealModel.updated_at >= start_utc,
                    DealModel.updated_at < end_utc,
                )
            )
            closed_row = closed_q.one()

            return {
                "open_count": open_row.open_count,
                "open_value": float(open_row.open_value or 0.0),
                "won_count": closed_row.won_count,
                "won_value_in_range": float(closed_row.won_value or 0.0),
                "lost_count": closed_row.lost_count,
            }

    async def get_deals_by_stage(self, organization_id: int) -> list[dict[str, Any]]:
        """Open deals grouped by pipeline stage."""
        async with self.async_session() as session:
            result = await session.execute(
                select(
                    DealModel.stage.label("stage"),
                    func.count(DealModel.id).label("count"),
                    func.coalesce(func.sum(DealModel.value), 0.0).label("total_value"),
                )
                .where(
                    DealModel.organization_id == organization_id,
                    DealModel.status == DealStatus.OPEN.value,
                )
                .group_by(DealModel.stage)
                .order_by(func.count(DealModel.id).desc())
            )
            return [
                {
                    "stage": row.stage,
                    "count": row.count,
                    "total_value": float(row.total_value or 0.0),
                }
                for row in result
            ]

    async def get_deals_won_lost_daily(
        self, organization_id: int, start_utc: datetime, end_utc: datetime
    ) -> list[dict[str, Any]]:
        """Per-day won value and lost count, keyed on updated_at."""
        async with self.async_session() as session:
            day = _day_expr(DealModel.updated_at)
            result = await session.execute(
                select(
                    day.label("date"),
                    func.coalesce(
                        func.sum(DealModel.value).filter(
                            DealModel.status == DealStatus.WON.value
                        ),
                        0.0,
                    ).label("won_value"),
                    func.count(DealModel.id)
                    .filter(DealModel.status == DealStatus.LOST.value)
                    .label("lost_count"),
                )
                .where(
                    DealModel.organization_id == organization_id,
                    DealModel.status.in_([DealStatus.WON.value, DealStatus.LOST.value]),
                    DealModel.updated_at >= start_utc,
                    DealModel.updated_at < end_utc,
                )
                .group_by(day)
                .order_by(day)
            )
            return [
                {
                    "date": row.date.isoformat(),
                    "won_value": float(row.won_value or 0.0),
                    "lost_count": row.lost_count,
                }
                for row in result
            ]

    async def get_activities_daily_by_type(
        self, organization_id: int, start_utc: datetime, end_utc: datetime
    ) -> list[dict[str, Any]]:
        async with self.async_session() as session:
            day = _day_expr(ActivityModel.created_at)
            result = await session.execute(
                select(
                    day.label("date"),
                    ActivityModel.type.label("type"),
                    func.count(ActivityModel.id).label("count"),
                )
                .where(
                    ActivityModel.organization_id == organization_id,
                    ActivityModel.created_at >= start_utc,
                    ActivityModel.created_at < end_utc,
                )
                .group_by(day, ActivityModel.type)
                .order_by(day)
            )
            return [
                {"date": row.date.isoformat(), "type": row.type, "count": row.count}
                for row in result
            ]

    async def get_tasks_overview(
        self,
        organization_id: int,
        start_utc: datetime,
        end_utc: datetime,
        now: datetime,
    ) -> dict[str, Any]:
        async with self.async_session() as session:
            result = await session.execute(
                select(
                    func.count(ActivityModel.id)
                    .filter(ActivityModel.completed_at.is_(None))
                    .label("open"),
                    func.count(ActivityModel.id)
                    .filter(
                        ActivityModel.completed_at >= start_utc,
                        ActivityModel.completed_at < end_utc,
                    )
                    .label("completed_in_range"),
                    func.count(ActivityModel.id)
                    .filter(
                        ActivityModel.completed_at.is_(None),
                        ActivityModel.due_at.isnot(None),
                        ActivityModel.due_at < now,
                    )
                    .label("overdue"),
                ).where(
                    ActivityModel.organization_id == organization_id,
                    ActivityModel.type == ActivityType.TASK.value,
                )
            )
            row = result.one()
            return {
                "open": row.open,
                "completed_in_range": row.completed_in_range,
                "overdue": row.overdue,
            }
