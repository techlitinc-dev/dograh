"""FastAPI router for CRM Companies."""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status

from api.db import db_client
from api.db.models import UserModel
from api.schemas.crm import (
    CompanyCreate,
    CompanyResponse,
    CompanyUpdate,
)
from api.services.auth.depends import get_user_with_selected_organization

router = APIRouter(prefix="/companies", tags=["crm-companies"])


async def _validate_owner(org_id: int, owner_id: int | None) -> None:
    """404 when owner_id references a user outside the caller's org."""
    if owner_id is not None and not await db_client.user_is_org_member(
        owner_id, org_id
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Owner not found",
        )


@router.get("", response_model=List[CompanyResponse])
async def list_companies(
    user: UserModel = Depends(get_user_with_selected_organization),
) -> List[CompanyResponse]:
    """List all companies for the active organization."""
    org_id = user.selected_organization_id
    companies = await db_client.list_companies(org_id)
    return [CompanyResponse.model_validate(c) for c in companies]


@router.post("", response_model=CompanyResponse, status_code=status.HTTP_201_CREATED)
async def create_company(
    payload: CompanyCreate,
    user: UserModel = Depends(get_user_with_selected_organization),
) -> CompanyResponse:
    """Create a new company in the organization."""
    org_id = user.selected_organization_id
    await _validate_owner(org_id, payload.owner_id)
    try:
        company = await db_client.create_company(
            org_id,
            name=payload.name,
            domain=payload.domain,
            industry=payload.industry,
            size=payload.size,
            owner_id=payload.owner_id or user.id,
            custom_fields=payload.custom_fields,
        )
        return CompanyResponse.model_validate(company)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/{company_id}", response_model=CompanyResponse)
async def get_company(
    company_id: int,
    user: UserModel = Depends(get_user_with_selected_organization),
) -> CompanyResponse:
    """Get single company by ID."""
    org_id = user.selected_organization_id
    company = await db_client.get_company(company_id, org_id)
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found",
        )
    return CompanyResponse.model_validate(company)


@router.patch("/{company_id}", response_model=CompanyResponse)
async def update_company(
    company_id: int,
    payload: CompanyUpdate,
    user: UserModel = Depends(get_user_with_selected_organization),
) -> CompanyResponse:
    """Update company details."""
    org_id = user.selected_organization_id
    data = payload.model_dump(exclude_unset=True)
    await _validate_owner(org_id, data.get("owner_id"))
    updated = await db_client.update_company(company_id, org_id, **data)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found",
        )
    return CompanyResponse.model_validate(updated)


@router.delete("/{company_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_company(
    company_id: int,
    user: UserModel = Depends(get_user_with_selected_organization),
) -> None:
    """Delete a company."""
    org_id = user.selected_organization_id
    deleted = await db_client.delete_company(company_id, org_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found",
        )
