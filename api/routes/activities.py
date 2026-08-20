"""FastAPI router for CRM Activities & Tasks."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from api.db import db_client
from api.db.models import UserModel
from api.schemas.crm import (
    ActivityCreate,
    ActivityResponse,
)
from api.services.auth.depends import get_user_with_selected_organization

router = APIRouter(prefix="/activities", tags=["crm-activities"])


@router.post("", response_model=ActivityResponse, status_code=status.HTTP_201_CREATED)
async def create_activity(
    payload: ActivityCreate,
    user: UserModel = Depends(get_user_with_selected_organization),
) -> ActivityResponse:
    """Create a new CRM activity (note, task, call record, meeting, etc.).

    All FK references must belong to the caller's organization.
    """
    org_id = user.selected_organization_id
    if await db_client.get_contact(payload.contact_id, org_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found",
        )
    if payload.deal_id is not None:
        if await db_client.get_deal(payload.deal_id, org_id) is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Deal not found",
            )
    if payload.workflow_run_id is not None:
        run_org_id = await db_client.get_organization_id_by_workflow_run_id(
            payload.workflow_run_id
        )
        if run_org_id != org_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workflow run not found",
            )
    activity = await db_client.create_activity(
        org_id,
        contact_id=payload.contact_id,
        type=payload.type,
        body=payload.body,
        deal_id=payload.deal_id,
        workflow_run_id=payload.workflow_run_id,
        created_by=user.id,
        due_at=payload.due_at,
    )
    return ActivityResponse.model_validate(activity)


@router.get("/tasks", response_model=List[ActivityResponse])
async def list_open_tasks(
    user: UserModel = Depends(get_user_with_selected_organization),
    owner_id: Optional[int] = Query(
        None, description="Filter tasks assigned to/created by user ID"
    ),
) -> List[ActivityResponse]:
    """List open CRM tasks and follow-up callbacks sorted by due date."""
    org_id = user.selected_organization_id
    tasks = await db_client.list_open_tasks(org_id, owner_id=owner_id)
    return [ActivityResponse.model_validate(t) for t in tasks]


@router.post("/tasks/{activity_id}/complete", response_model=ActivityResponse)
async def complete_task(
    activity_id: int,
    user: UserModel = Depends(get_user_with_selected_organization),
) -> ActivityResponse:
    """Mark a pending task or callback as completed."""
    org_id = user.selected_organization_id
    completed = await db_client.complete_task(activity_id, org_id)
    if not completed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task activity not found or already completed",
        )
    return ActivityResponse.model_validate(completed)
