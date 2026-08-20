"""Pydantic schemas for CRM entities: Contacts, Companies, Deals, Activities, Tags."""

from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


# ----------------------------------------------------------------------
# Tags
# ----------------------------------------------------------------------


class TagCreate(BaseModel):
    name: str = Field(..., max_length=64)


class TagResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    organization_id: int
    name: str
    created_at: datetime


# ----------------------------------------------------------------------
# Contacts
# ----------------------------------------------------------------------


class ContactCreate(BaseModel):
    first_name: Optional[str] = Field(None, max_length=120)
    last_name: Optional[str] = Field(None, max_length=120)
    email: Optional[str] = Field(None, max_length=320)
    phone: Optional[str] = Field(None, max_length=32, description="E.164 phone number")
    company_id: Optional[int] = None
    source: str = "manual"
    lifecycle_stage: str = "lead"
    owner_id: Optional[int] = None
    custom_fields: Dict[str, Any] = Field(default_factory=dict)
    do_not_call: bool = False
    consent_at: Optional[datetime] = None
    consent_source: Optional[str] = Field(None, max_length=255)
    tag_names: Optional[List[str]] = Field(default_factory=list)


class ContactUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    company_id: Optional[int] = None
    lifecycle_stage: Optional[str] = None
    owner_id: Optional[int] = None
    custom_fields: Optional[Dict[str, Any]] = None
    do_not_call: Optional[bool] = None
    consent_at: Optional[datetime] = None
    consent_source: Optional[str] = None
    tag_names: Optional[List[str]] = None


class ContactResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    organization_id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    company_id: Optional[int] = None
    source: str
    lifecycle_stage: str
    owner_id: Optional[int] = None
    custom_fields: Dict[str, Any] = Field(default_factory=dict)
    do_not_call: bool = False
    consent_at: Optional[datetime] = None
    consent_source: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime] = None
    tags: List[TagResponse] = Field(default_factory=list)


class ContactListResponse(BaseModel):
    items: List[ContactResponse]
    total: int
    limit: int
    offset: int


class ContactBulkImportItem(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    # Optional at the schema level: rows without a phone are skipped with a
    # per-row error in the response instead of 422ing the whole import.
    phone: Optional[str] = None
    company_name: Optional[str] = None
    lifecycle_stage: Optional[str] = "lead"
    custom_fields: Optional[Dict[str, Any]] = None
    do_not_call: bool = False


class ContactBulkImportRequest(BaseModel):
    contacts: List[ContactBulkImportItem]


class ContactBulkImportResponse(BaseModel):
    imported_count: int
    errors: List[str] = Field(default_factory=list)


class ContactStatsResponse(BaseModel):
    total_contacts: int
    leads: int
    mqls: int
    sqls: int
    opportunities: int
    customers: int
    do_not_call_count: int
    contacts_created_this_week: int


# ----------------------------------------------------------------------
# Companies
# ----------------------------------------------------------------------


class CompanyCreate(BaseModel):
    name: str = Field(..., max_length=255)
    domain: Optional[str] = Field(None, max_length=255)
    industry: Optional[str] = Field(None, max_length=120)
    size: Optional[str] = Field(None, max_length=64)
    owner_id: Optional[int] = None
    custom_fields: Dict[str, Any] = Field(default_factory=dict)


class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    domain: Optional[str] = None
    industry: Optional[str] = None
    size: Optional[str] = None
    owner_id: Optional[int] = None
    custom_fields: Optional[Dict[str, Any]] = None


class CompanyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    organization_id: int
    name: str
    domain: Optional[str] = None
    industry: Optional[str] = None
    size: Optional[str] = None
    owner_id: Optional[int] = None
    custom_fields: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


# ----------------------------------------------------------------------
# Deals
# ----------------------------------------------------------------------


class DealCreate(BaseModel):
    title: str = Field(..., max_length=255)
    contact_id: Optional[int] = None
    company_id: Optional[int] = None
    value: Optional[float] = None
    currency: str = "USD"
    pipeline: str = "default"
    # Must be a real stage on the default board (routes/deals.py DEFAULT_STAGES)
    # or the deal would be invisible in the Kanban UI.
    stage: str = "lead"
    probability: Optional[int] = Field(None, ge=0, le=100)
    expected_close_date: Optional[datetime] = None
    owner_id: Optional[int] = None
    status: str = "open"
    lost_reason: Optional[str] = None


class DealUpdate(BaseModel):
    title: Optional[str] = None
    contact_id: Optional[int] = None
    company_id: Optional[int] = None
    value: Optional[float] = None
    currency: Optional[str] = None
    pipeline: Optional[str] = None
    stage: Optional[str] = None
    probability: Optional[int] = None
    expected_close_date: Optional[datetime] = None
    owner_id: Optional[int] = None
    status: Optional[str] = None
    lost_reason: Optional[str] = None


class DealResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    organization_id: int
    contact_id: Optional[int] = None
    company_id: Optional[int] = None
    title: str
    value: Optional[float] = None
    currency: str
    pipeline: str
    stage: str
    probability: Optional[int] = None
    expected_close_date: Optional[datetime] = None
    owner_id: Optional[int] = None
    status: str
    lost_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class StageColumn(BaseModel):
    stage_id: str
    stage_name: str
    total_value: float
    deal_count: int
    deals: List[DealResponse]


class PipelineBoardResponse(BaseModel):
    pipeline: str
    total_pipeline_value: float
    total_deals_count: int
    stages: List[StageColumn]


# ----------------------------------------------------------------------
# Activities & Tasks
# ----------------------------------------------------------------------


class ActivityCreate(BaseModel):
    contact_id: int
    type: str = Field(..., description="call, note, email, meeting, task, stage_change")
    body: Optional[str] = None
    deal_id: Optional[int] = None
    workflow_run_id: Optional[int] = None
    due_at: Optional[datetime] = None


class ActivityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    organization_id: int
    contact_id: int
    deal_id: Optional[int] = None
    type: str
    body: Optional[str] = None
    workflow_run_id: Optional[int] = None
    created_by: Optional[int] = None
    due_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime


# ----------------------------------------------------------------------
# Billing / Subscriptions
# ----------------------------------------------------------------------


class CheckoutSessionRequest(BaseModel):
    plan: str = Field(..., description="starter, growth, scale, enterprise")
    success_url: str
    cancel_url: str


class CheckoutSessionResponse(BaseModel):
    checkout_url: str
    session_id: str


class CustomerPortalResponse(BaseModel):
    portal_url: str


class SubscriptionResponse(BaseModel):
    plan: str
    status: str
    seats: int
    current_period_end: Optional[datetime] = None
    trial_ends_at: Optional[datetime] = None
    is_active: bool
