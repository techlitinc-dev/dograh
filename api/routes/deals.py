"""FastAPI router for CRM Deals & Pipeline Kanban."""

from collections import defaultdict
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from api.db import db_client
from api.db.models import UserModel
from api.enums import ActivityType
from api.schemas.crm import (
    DealCreate,
    DealResponse,
    DealUpdate,
    PipelineBoardResponse,
    StageColumn,
)
from api.services.auth.depends import get_user_with_selected_organization

router = APIRouter(prefix="/deals", tags=["crm-deals"])

DEFAULT_STAGES = [
    {"stage_id": "lead", "stage_name": "Lead In"},
    {"stage_id": "qualified", "stage_name": "Qualified"},
    {"stage_id": "meeting", "stage_name": "Meeting Scheduled"},
    {"stage_id": "proposal", "stage_name": "Proposal Sent"},
    {"stage_id": "negotiation", "stage_name": "Negotiation"},
    {"stage_id": "won", "stage_name": "Closed Won"},
    {"stage_id": "lost", "stage_name": "Closed Lost"},
]


async def _validate_deal_fks(
    org_id: int,
    *,
    contact_id: Optional[int] = None,
    company_id: Optional[int] = None,
    owner_id: Optional[int] = None,
) -> None:
    """404 on FK references that don't belong to the caller's org."""
    if contact_id is not None:
        if await db_client.get_contact(contact_id, org_id) is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Contact not found",
            )
    if company_id is not None:
        if await db_client.get_company(company_id, org_id) is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Company not found",
            )
    if owner_id is not None:
        if not await db_client.user_is_org_member(owner_id, org_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Owner not found",
            )


@router.get("", response_model=List[DealResponse])
async def list_deals(
    user: UserModel = Depends(get_user_with_selected_organization),
    status: Optional[str] = Query(
        None, description="Filter by status (open, won, lost)"
    ),
    pipeline: Optional[str] = Query(None, description="Filter by pipeline name"),
    contact_id: Optional[int] = Query(None, description="Filter by contact ID"),
) -> List[DealResponse]:
    """List deals with optional filtering."""
    org_id = user.selected_organization_id
    deals = await db_client.list_deals(
        org_id,
        status=status,
        pipeline=pipeline,
        contact_id=contact_id,
    )
    return [DealResponse.model_validate(d) for d in deals]


@router.get("/board", response_model=PipelineBoardResponse)
async def get_pipeline_board(
    user: UserModel = Depends(get_user_with_selected_organization),
    pipeline: str = Query("default", description="Pipeline identifier"),
) -> PipelineBoardResponse:
    """Retrieve full Kanban pipeline board grouped by stage.

    Deals in a stage not present in DEFAULT_STAGES (legacy/custom stages)
    still appear: each unknown stage is appended as its own column.
    """
    org_id = user.selected_organization_id
    deals = await db_client.list_deals(org_id, pipeline=pipeline)

    deals_by_stage = defaultdict(list)
    for deal in deals:
        stage_key = deal.stage or "lead"
        deals_by_stage[stage_key].append(DealResponse.model_validate(deal))

    total_value = sum(d.value or 0.0 for d in deals if d.status != "lost")
    total_count = len(deals)

    def _column(stage_id: str, stage_name: str) -> StageColumn:
        stage_deals = deals_by_stage.get(stage_id, [])
        return StageColumn(
            stage_id=stage_id,
            stage_name=stage_name,
            total_value=sum(d.value or 0.0 for d in stage_deals),
            deal_count=len(stage_deals),
            deals=stage_deals,
        )

    known = {s["stage_id"] for s in DEFAULT_STAGES}
    stage_columns = [_column(s["stage_id"], s["stage_name"]) for s in DEFAULT_STAGES]
    # Unknown stages get their own column so no deal silently disappears.
    for stage_key in sorted(deals_by_stage.keys() - known):
        stage_columns.append(_column(stage_key, stage_key))

    return PipelineBoardResponse(
        pipeline=pipeline,
        total_pipeline_value=total_value,
        total_deals_count=total_count,
        stages=stage_columns,
    )


@router.post("", response_model=DealResponse, status_code=status.HTTP_201_CREATED)
async def create_deal(
    payload: DealCreate,
    user: UserModel = Depends(get_user_with_selected_organization),
) -> DealResponse:
    """Create a new deal."""
    org_id = user.selected_organization_id
    await _validate_deal_fks(
        org_id,
        contact_id=payload.contact_id,
        company_id=payload.company_id,
        owner_id=payload.owner_id,
    )
    deal = await db_client.create_deal(
        org_id,
        title=payload.title,
        contact_id=payload.contact_id,
        company_id=payload.company_id,
        value=payload.value,
        currency=payload.currency,
        pipeline=payload.pipeline,
        stage=payload.stage,
        probability=payload.probability,
        expected_close_date=payload.expected_close_date,
        owner_id=payload.owner_id or user.id,
        status=payload.status,
        lost_reason=payload.lost_reason,
    )
    return DealResponse.model_validate(deal)


@router.get("/{deal_id}", response_model=DealResponse)
async def get_deal(
    deal_id: int,
    user: UserModel = Depends(get_user_with_selected_organization),
) -> DealResponse:
    """Get single deal by ID."""
    org_id = user.selected_organization_id
    deal = await db_client.get_deal(deal_id, org_id)
    if not deal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deal not found",
        )
    return DealResponse.model_validate(deal)


@router.patch("/{deal_id}", response_model=DealResponse)
async def update_deal(
    deal_id: int,
    payload: DealUpdate,
    user: UserModel = Depends(get_user_with_selected_organization),
) -> DealResponse:
    """Update deal properties such as stage, value, or status.

    An actual stage change automatically logs a ``stage_change`` activity on
    the deal's contact timeline (server-side, replacing the client double-write).
    """
    org_id = user.selected_organization_id
    data = payload.model_dump(exclude_unset=True)
    await _validate_deal_fks(
        org_id,
        contact_id=data.get("contact_id"),
        company_id=data.get("company_id"),
        owner_id=data.get("owner_id"),
    )

    deal = await db_client.get_deal(deal_id, org_id)
    if not deal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deal not found",
        )
    old_stage = deal.stage

    updated = await db_client.update_deal(deal_id, org_id, **data)

    new_stage = updated.stage
    contact_id = updated.contact_id
    if "stage" in data and new_stage != old_stage and contact_id is not None:
        await db_client.create_activity(
            org_id,
            contact_id=contact_id,
            type=ActivityType.STAGE_CHANGE.value,
            body=f"Deal '{updated.title}' moved from {old_stage} to {new_stage}",
            deal_id=updated.id,
            created_by=user.id,
        )
    return DealResponse.model_validate(updated)


@router.delete("/{deal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_deal(
    deal_id: int,
    user: UserModel = Depends(get_user_with_selected_organization),
) -> None:
    """Delete a deal."""
    org_id = user.selected_organization_id
    deleted = await db_client.delete_deal(deal_id, org_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deal not found",
        )
