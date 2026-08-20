from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query

from api.db.models import UserModel
from api.schemas.analytics import (
    AnalyticsOverviewResponse,
    CallsAnalyticsResponse,
    CrmAnalyticsResponse,
)
from api.services.analytics import AnalyticsService
from api.services.auth.depends import get_user_with_selected_organization

router = APIRouter(prefix="/organizations/analytics", tags=["analytics"])

MAX_RANGE_DAYS = 366


def _resolve_range(
    start: date | None, end: date | None
) -> tuple[datetime, datetime, date, date]:
    """Resolve and validate the [start, end] date range.

    Defaults to the last 30 days (UTC). Returns datetimes covering
    [start 00:00 UTC, (end + 1 day) 00:00 UTC) — end exclusive.
    """
    today = datetime.now(ZoneInfo("UTC")).date()
    end_date = end or today
    start_date = start or (end_date - timedelta(days=29))

    if start_date > end_date:
        raise HTTPException(status_code=400, detail="start must be on or before end")
    if (end_date - start_date).days >= MAX_RANGE_DAYS:
        raise HTTPException(
            status_code=400,
            detail=f"Date range cannot exceed {MAX_RANGE_DAYS} days",
        )

    utc = ZoneInfo("UTC")
    start_utc = datetime.combine(start_date, time.min, tzinfo=utc)
    end_utc = datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=utc)
    return start_utc, end_utc, start_date, end_date


@router.get("/overview", response_model=AnalyticsOverviewResponse)
async def get_analytics_overview(
    start: date | None = Query(None, description="Range start date (YYYY-MM-DD, UTC)"),
    end: date | None = Query(None, description="Range end date (YYYY-MM-DD, UTC)"),
    user: UserModel = Depends(get_user_with_selected_organization),
) -> AnalyticsOverviewResponse:
    """KPI summary for the organization over the date range."""
    start_utc, end_utc, start_date, end_date = _resolve_range(start, end)
    now = datetime.now(ZoneInfo("UTC"))

    service = AnalyticsService()
    overview = await service.get_overview(
        user.selected_organization_id, start_utc, end_utc, now
    )
    return AnalyticsOverviewResponse(start=start_date, end=end_date, **overview)


@router.get("/calls", response_model=CallsAnalyticsResponse)
async def get_calls_analytics(
    start: date | None = Query(None, description="Range start date (YYYY-MM-DD, UTC)"),
    end: date | None = Query(None, description="Range end date (YYYY-MM-DD, UTC)"),
    user: UserModel = Depends(get_user_with_selected_organization),
) -> CallsAnalyticsResponse:
    """Per-day call series, disposition breakdown, and duration buckets."""
    start_utc, end_utc, start_date, end_date = _resolve_range(start, end)

    service = AnalyticsService()
    result = await service.get_calls(user.selected_organization_id, start_utc, end_utc)
    return CallsAnalyticsResponse(start=start_date, end=end_date, **result)


@router.get("/crm", response_model=CrmAnalyticsResponse)
async def get_crm_analytics(
    start: date | None = Query(None, description="Range start date (YYYY-MM-DD, UTC)"),
    end: date | None = Query(None, description="Range end date (YYYY-MM-DD, UTC)"),
    user: UserModel = Depends(get_user_with_selected_organization),
) -> CrmAnalyticsResponse:
    """CRM analytics: contact growth/sources, deal stages, won/lost, activity mix."""
    start_utc, end_utc, start_date, end_date = _resolve_range(start, end)

    service = AnalyticsService()
    result = await service.get_crm(user.selected_organization_id, start_utc, end_utc)
    return CrmAnalyticsResponse(start=start_date, end=end_date, **result)
