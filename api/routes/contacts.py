"""FastAPI router for CRM Contacts management."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from api.db import db_client
from api.db.models import UserModel
from api.schemas.crm import (
    ActivityResponse,
    ContactBulkImportRequest,
    ContactBulkImportResponse,
    ContactCreate,
    ContactListResponse,
    ContactResponse,
    ContactStatsResponse,
    ContactUpdate,
    TagResponse,
)
from api.services.auth.depends import get_user_with_selected_organization

router = APIRouter(prefix="/contacts", tags=["crm-contacts"])


async def _validate_contact_fks(
    org_id: int,
    *,
    company_id: Optional[int] = None,
    owner_id: Optional[int] = None,
) -> None:
    """404 on FK references that don't belong to the caller's org.

    The FK constraint only proves the row exists — it doesn't prove the
    caller is allowed to reference it (tenant isolation).
    """
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


@router.get("", response_model=ContactListResponse)
async def list_contacts(
    user: UserModel = Depends(get_user_with_selected_organization),
    search: Optional[str] = Query(None, description="Search by name, email, or phone"),
    lifecycle_stage: Optional[str] = Query(
        None, description="Filter by lifecycle stage"
    ),
    owner_id: Optional[int] = Query(None, description="Filter by owner user ID"),
    do_not_call: Optional[bool] = Query(None, description="Filter by DNC status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> ContactListResponse:
    """List org contacts with search and filtering."""
    org_id = user.selected_organization_id
    contacts, total = await db_client.list_contacts(
        organization_id=org_id,
        search=search,
        lifecycle_stage=lifecycle_stage,
        owner_id=owner_id,
        do_not_call=do_not_call,
        limit=limit,
        offset=offset,
    )
    return ContactListResponse(
        items=[ContactResponse.model_validate(c) for c in contacts],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/stats", response_model=ContactStatsResponse)
async def get_contact_stats(
    user: UserModel = Depends(get_user_with_selected_organization),
) -> ContactStatsResponse:
    """Retrieve overview metrics for contacts in the organization."""
    stats = await db_client.get_contact_stats(user.selected_organization_id)
    return ContactStatsResponse(**stats)


@router.get("/tags", response_model=List[TagResponse])
async def list_tags(
    user: UserModel = Depends(get_user_with_selected_organization),
) -> List[TagResponse]:
    """List all CRM tags in the active organization."""
    tags = await db_client.list_tags(user.selected_organization_id)
    return [TagResponse.model_validate(t) for t in tags]


@router.post("", response_model=ContactResponse, status_code=status.HTTP_201_CREATED)
async def create_contact(
    payload: ContactCreate,
    user: UserModel = Depends(get_user_with_selected_organization),
) -> ContactResponse:
    """Create a new contact in the active organization."""
    org_id = user.selected_organization_id
    await _validate_contact_fks(
        org_id, company_id=payload.company_id, owner_id=payload.owner_id
    )
    try:
        contact = await db_client.create_contact(
            organization_id=org_id,
            first_name=payload.first_name,
            last_name=payload.last_name,
            email=payload.email,
            phone=payload.phone,
            company_id=payload.company_id,
            source=payload.source,
            lifecycle_stage=payload.lifecycle_stage,
            owner_id=payload.owner_id or user.id,
            custom_fields=payload.custom_fields,
            do_not_call=payload.do_not_call,
            consent_at=payload.consent_at,
            consent_source=payload.consent_source,
            tag_names=payload.tag_names,
        )
        return ContactResponse.model_validate(contact)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/{contact_id}", response_model=ContactResponse)
async def get_contact(
    contact_id: int,
    user: UserModel = Depends(get_user_with_selected_organization),
) -> ContactResponse:
    """Retrieve details for a single contact."""
    org_id = user.selected_organization_id
    contact = await db_client.get_contact(contact_id, org_id)
    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found",
        )
    return ContactResponse.model_validate(contact)


@router.patch("/{contact_id}", response_model=ContactResponse)
async def update_contact(
    contact_id: int,
    payload: ContactUpdate,
    user: UserModel = Depends(get_user_with_selected_organization),
) -> ContactResponse:
    """Update contact attributes. ``tag_names`` replaces the contact's tags."""
    org_id = user.selected_organization_id
    data = payload.model_dump(exclude_unset=True)
    await _validate_contact_fks(
        org_id,
        company_id=data.get("company_id"),
        owner_id=data.get("owner_id"),
    )
    updated = await db_client.update_contact(contact_id, org_id, **data)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found",
        )
    return ContactResponse.model_validate(updated)


@router.delete("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contact(
    contact_id: int,
    user: UserModel = Depends(get_user_with_selected_organization),
) -> None:
    """Soft delete a contact."""
    org_id = user.selected_organization_id
    deleted = await db_client.soft_delete_contact(contact_id, org_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found",
        )


@router.get("/{contact_id}/activities", response_model=List[ActivityResponse])
async def list_contact_activities(
    contact_id: int,
    user: UserModel = Depends(get_user_with_selected_organization),
    limit: int = Query(100, ge=1, le=500),
) -> List[ActivityResponse]:
    """Retrieve the unified activity timeline for a contact (calls, notes, tasks, etc.)."""
    org_id = user.selected_organization_id
    contact = await db_client.get_contact(contact_id, org_id)
    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found",
        )
    activities = await db_client.list_activities_for_contact(
        contact_id, org_id, limit=limit
    )
    return [ActivityResponse.model_validate(a) for a in activities]


@router.post("/import", response_model=ContactBulkImportResponse)
async def bulk_import_contacts(
    payload: ContactBulkImportRequest,
    user: UserModel = Depends(get_user_with_selected_organization),
) -> ContactBulkImportResponse:
    """Bulk import contacts from CSV or integrated systems.

    Honors ``company_name`` (get-or-create company within the org),
    ``lifecycle_stage``, ``custom_fields`` and ``do_not_call`` per row.
    """
    org_id = user.selected_organization_id
    imported = 0
    errors = []

    for item in payload.contacts:
        if not item.phone:
            errors.append(
                f"Skipped contact {item.first_name} {item.last_name}: Missing phone number"
            )
            continue
        try:
            company_id = None
            if item.company_name:
                company = await db_client.get_or_create_company_by_name(
                    org_id, item.company_name
                )
                company_id = company.id
            await db_client.upsert_contact_by_phone(
                organization_id=org_id,
                phone=item.phone,
                first_name=item.first_name,
                last_name=item.last_name,
                email=item.email,
                source="csv",
                company_id=company_id,
                lifecycle_stage=item.lifecycle_stage,
                custom_fields=item.custom_fields,
                do_not_call=item.do_not_call,
            )
            imported += 1
        except Exception as e:
            errors.append(f"Error importing {item.phone}: {str(e)}")

    return ContactBulkImportResponse(
        imported_count=imported,
        errors=errors,
    )
