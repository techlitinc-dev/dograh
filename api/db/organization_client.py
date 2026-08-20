from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import delete, exists, func, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.future import select

from api.db.base_client import BaseDBClient
from api.db.models import (
    APIKeyModel,
    OrganizationModel,
    UserModel,
    organization_users_association,
)
from api.enums import OrganizationRole
from api.utils.api_key import generate_api_key


class OrganizationClient(BaseDBClient):
    async def get_organization_by_id(
        self, organization_id: int
    ) -> Optional[OrganizationModel]:
        """Get an organization by its ID."""
        async with self.async_session() as session:
            result = await session.execute(
                select(OrganizationModel).where(OrganizationModel.id == organization_id)
            )
            return result.scalars().first()

    async def get_organization_users(self, organization_id: int) -> list[UserModel]:
        """Get all users linked to an organization (many-to-many)."""
        async with self.async_session() as session:
            result = await session.execute(
                select(UserModel)
                .join(
                    organization_users_association,
                    organization_users_association.c.user_id == UserModel.id,
                )
                .where(
                    organization_users_association.c.organization_id == organization_id
                )
                .order_by(UserModel.id)
            )
            return list(result.scalars().all())

    async def get_or_create_organization_by_provider_id(
        self, org_provider_id: str, user_id: int
    ) -> tuple[OrganizationModel, bool]:
        """Get an existing organization by provider_id or create a new one.

        Returns:
            A tuple of (organization, was_created) where was_created is True if the organization
            was created in this call, False if it already existed.
        """
        async with self.async_session() as session:
            # First try to get existing organization
            result = await session.execute(
                select(OrganizationModel).where(
                    OrganizationModel.provider_id == org_provider_id
                )
            )
            organization = result.scalars().first()

            if organization is None:
                # Use PostgreSQL's INSERT ... ON CONFLICT DO NOTHING
                # This is atomic and handles race conditions at the database level

                stmt = insert(OrganizationModel.__table__).values(
                    provider_id=org_provider_id, created_at=datetime.now(timezone.utc)
                )
                # ON CONFLICT DO NOTHING - if another request already inserted, this becomes a no-op
                stmt = stmt.on_conflict_do_nothing(index_elements=["provider_id"])

                result = await session.execute(stmt)
                await session.commit()

                # Check if we actually inserted (rowcount > 0) or if there was a conflict (rowcount == 0)
                was_created = result.rowcount > 0

                # Now fetch the organization (either the one we just created or the one that existed)
                result = await session.execute(
                    select(OrganizationModel).where(
                        OrganizationModel.provider_id == org_provider_id
                    )
                )
                organization = result.scalars().first()

                if organization is None:
                    # This should never happen, but handle it just in case
                    error_msg = f"Failed to create or fetch organization with provider_id {org_provider_id}"
                    raise ValueError(error_msg)

                # Only create API key if we actually created the organization
                if was_created:
                    # Create a default API key for the new organization
                    _, key_hash, key_prefix = generate_api_key()

                    api_key = APIKeyModel(
                        organization_id=organization.id,
                        name="Default API Key",
                        key_hash=key_hash,
                        key_prefix=key_prefix,
                        is_active=True,
                        created_by=user_id,
                    )
                    session.add(api_key)
                    await session.commit()

                await session.refresh(organization)
                return organization, was_created
            return organization, False

    async def is_user_member_of_organization(
        self, user_id: int, organization_id: int
    ) -> bool:
        """Return True if the user belongs to the given organization."""
        async with self.async_session() as session:
            result = await session.execute(
                select(
                    exists().where(
                        (organization_users_association.c.user_id == user_id)
                        & (
                            organization_users_association.c.organization_id
                            == organization_id
                        )
                    )
                )
            )
            return bool(result.scalar())

    async def add_user_to_organization(
        self, user_id: int, organization_id: int, role: str | None = None
    ) -> None:
        """Ensure that a user is linked to an organization (many-to-many).

        The association is created only if it does not already exist.
        Uses INSERT ... ON CONFLICT DO NOTHING to handle race conditions.
        When ``role`` is None the membership defaults to 'owner' for the
        organization's first member and 'agent' for everyone who joins later.
        """
        async with self.async_session() as session:
            if role is None:
                member_count = await session.execute(
                    select(func.count())
                    .select_from(organization_users_association)
                    .where(
                        organization_users_association.c.organization_id
                        == organization_id
                    )
                )
                role = (
                    OrganizationRole.OWNER.value
                    if member_count.scalar_one() == 0
                    else OrganizationRole.AGENT.value
                )

            # Use PostgreSQL's INSERT ... ON CONFLICT DO NOTHING
            # This handles race conditions at the database level

            stmt = insert(organization_users_association).values(
                user_id=user_id, organization_id=organization_id, role=role
            )
            # ON CONFLICT DO NOTHING - if another request already inserted, this becomes a no-op
            # The primary key constraint on (user_id, organization_id) will trigger the conflict
            stmt = stmt.on_conflict_do_nothing()

            await session.execute(stmt)
            await session.commit()

    async def get_organization_member_role(
        self, user_id: int, organization_id: int
    ) -> str | None:
        """Return the user's role in the organization, or None if not a member."""
        async with self.async_session() as session:
            result = await session.execute(
                select(organization_users_association.c.role).where(
                    (organization_users_association.c.user_id == user_id)
                    & (
                        organization_users_association.c.organization_id
                        == organization_id
                    )
                )
            )
            return result.scalar_one_or_none()

    async def set_organization_member_role(
        self, user_id: int, organization_id: int, role: str
    ) -> bool:
        """Update a membership's role. Returns False if no membership exists."""
        async with self.async_session() as session:
            result = await session.execute(
                update(organization_users_association)
                .where(
                    (organization_users_association.c.user_id == user_id)
                    & (
                        organization_users_association.c.organization_id
                        == organization_id
                    )
                )
                .values(role=role)
            )
            await session.commit()
            return result.rowcount > 0

    async def remove_user_from_organization(
        self, user_id: int, organization_id: int
    ) -> bool:
        """Remove a membership row. Returns False if no membership existed."""
        async with self.async_session() as session:
            result = await session.execute(
                delete(organization_users_association).where(
                    (organization_users_association.c.user_id == user_id)
                    & (
                        organization_users_association.c.organization_id
                        == organization_id
                    )
                )
            )
            await session.commit()
            return result.rowcount > 0

    async def list_organization_members_with_roles(
        self, organization_id: int
    ) -> list[tuple[UserModel, str]]:
        """All members of an organization as (user, role) pairs, by user id."""
        async with self.async_session() as session:
            result = await session.execute(
                select(UserModel, organization_users_association.c.role)
                .join(
                    organization_users_association,
                    organization_users_association.c.user_id == UserModel.id,
                )
                .where(
                    organization_users_association.c.organization_id == organization_id
                )
                .order_by(UserModel.id)
            )
            return [(user, role) for user, role in result.all()]

    async def update_organization_name(
        self, organization_id: int, name: str | None
    ) -> Optional[OrganizationModel]:
        """Set the organization's display name. Returns the updated row."""
        async with self.async_session() as session:
            result = await session.execute(
                select(OrganizationModel).where(OrganizationModel.id == organization_id)
            )
            organization = result.scalars().first()
            if organization is None:
                return None
            organization.name = name
            await session.commit()
            await session.refresh(organization)
            return organization
