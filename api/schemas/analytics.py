"""Response schemas for the org-scoped CRM analytics dashboard endpoints."""

from datetime import date

from pydantic import BaseModel


class CallsOverview(BaseModel):
    total: int
    completed: int
    connect_rate: float
    avg_duration_seconds: float
    total_cost_usd: float
    inbound: int
    outbound: int


class ContactsOverview(BaseModel):
    total: int
    new_in_range: int
    by_lifecycle_stage: dict[str, int]


class DealsOverview(BaseModel):
    open_count: int
    open_value: float
    won_count: int
    won_value_in_range: float
    lost_count: int
    win_rate: float


class TasksOverview(BaseModel):
    open: int
    completed_in_range: int
    overdue: int


class AnalyticsOverviewResponse(BaseModel):
    start: date
    end: date
    calls: CallsOverview
    contacts: ContactsOverview
    deals: DealsOverview
    tasks: TasksOverview


class CallsDailyPoint(BaseModel):
    date: date
    total: int
    completed: int
    avg_duration_seconds: float
    cost_usd: float


class DispositionCount(BaseModel):
    disposition: str
    count: int


class DurationBucket(BaseModel):
    bucket: str
    range_start: int
    range_end: int | None
    count: int


class CallsAnalyticsResponse(BaseModel):
    start: date
    end: date
    daily: list[CallsDailyPoint]
    dispositions: list[DispositionCount]
    duration_buckets: list[DurationBucket]


class ContactsGrowthPoint(BaseModel):
    date: date
    count: int


class ContactSourceCount(BaseModel):
    source: str
    count: int


class DealStageCount(BaseModel):
    stage: str
    count: int
    total_value: float


class DealsWonLostPoint(BaseModel):
    date: date
    won_value: float
    lost_count: int


class ActivityTypePoint(BaseModel):
    date: date
    type: str
    count: int


class CrmAnalyticsResponse(BaseModel):
    start: date
    end: date
    contacts_growth: list[ContactsGrowthPoint]
    contacts_by_source: list[ContactSourceCount]
    deals_by_stage: list[DealStageCount]
    deals_won_lost_per_day: list[DealsWonLostPoint]
    activities_per_day_by_type: list[ActivityTypePoint]
