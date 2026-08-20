"""Database client for CRM contacts, companies, deals, activities and tags.

Mirrors the per-entity client pattern of campaign_client.py. Every method is
org-scoped: the caller passes organization_id and queries filter on it.
"""

from datetime import UTC, datetime, timedelta
from typing import Optional

from loguru import logger
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from api.db.base_client import BaseDBClient
from api.db.models import (
    ActivityModel,
    CompanyModel,
    ContactModel,
    DealModel,
    TagModel,
    WorkflowRunModel,
)
from api.enums import ActivityType, ContactLifecycleStage, ContactSource


class CrmClient(BaseDBClient):
    # ------------------------------------------------------------------
    # Contacts
    # ------------------------------------------------------------------

    async def create_contact(
        self,
        organization_id: int,
        *,
        first_name: Optional[str] = None,
        last_name: Optional[str] = None,
        email: Optional[str] = None,
        phone: Optional[str] = None,
        company_id: Optional[int] = None,
        source: str = ContactSource.MANUAL.value,
        lifecycle_stage: Optional[str] = None,
        owner_id: Optional[int] = None,
        custom_fields: Optional[dict] = None,
        do_not_call: bool = False,
        consent_at: Optional[datetime] = None,
        consent_source: Optional[str] = None,
        tag_names: Optional[list[str]] = None,
    ) -> ContactModel:
        """Create a contact. Raises ValueError on duplicate (org, phone)."""
        async with self.async_session() as session:
            contact = ContactModel(
                organization_id=organization_id,
                first_name=first_name,
                last_name=last_name,
                email=email,
                phone=phone,
                company_id=company_id,
                source=source,
                lifecycle_stage=lifecycle_stage or ContactLifecycleStage.LEAD.value,
                owner_id=owner_id,
                custom_fields=custom_fields or {},
                do_not_call=do_not_call,
                consent_at=consent_at,
                consent_source=consent_source,
            )
            if tag_names:
                contact.tags = [
                    await self._get_or_create_tag_in_session(
                        session, organization_id, name
                    )
                    for name in tag_names
                ]
            session.add(contact)
            try:
                await session.commit()
            except IntegrityError as e:
                await session.rollback()
                raise ValueError(f"Contact already exists: {e}") from e
            await session.refresh(contact, attribute_names=["tags"])
            return contact

    async def get_contact(
        self, contact_id: int, organization_id: int
    ) -> Optional[ContactModel]:
        async with self.async_session() as session:
            result = await session.execute(
                select(ContactModel).where(
                    ContactModel.id == contact_id,
                    ContactModel.organization_id == organization_id,
                    ContactModel.deleted_at.is_(None),
                )
            )
            return result.scalar_one_or_none()

    async def list_contacts(
        self,
        organization_id: int,
        *,
        search: Optional[str] = None,
        lifecycle_stage: Optional[str] = None,
        owner_id: Optional[int] = None,
        do_not_call: Optional[bool] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[ContactModel], int]:
        """Filtered contact list + total count (pre-pagination)."""
        async with self.async_session() as session:
            query = select(ContactModel).where(
                ContactModel.organization_id == organization_id,
                ContactModel.deleted_at.is_(None),
            )
            if search:
                like = f"%{search}%"
                query = query.where(
                    (ContactModel.first_name.ilike(like))
                    | (ContactModel.last_name.ilike(like))
                    | (ContactModel.email.ilike(like))
                    | (ContactModel.phone.ilike(like))
                )
            if lifecycle_stage:
                query = query.where(ContactModel.lifecycle_stage == lifecycle_stage)
            if owner_id is not None:
                query = query.where(ContactModel.owner_id == owner_id)
            if do_not_call is not None:
                query = query.where(ContactModel.do_not_call.is_(do_not_call))

            count_q = select(func.count()).select_from(query.subquery())
            total = (await session.execute(count_q)).scalar_one()

            rows = await session.execute(
                query.order_by(ContactModel.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
            return list(rows.scalars().all()), total

    async def update_contact(
        self, contact_id: int, organization_id: int, **fields
    ) -> Optional[ContactModel]:
        """Partial update of allowed contact columns.

        ``tag_names`` (list of strings) replaces the contact's tag set;
        unknown names are created as org-scoped tags.
        """
        tag_names = fields.pop("tag_names", None)
        allowed = {
            "first_name",
            "last_name",
            "email",
            "phone",
            "company_id",
            "lifecycle_stage",
            "owner_id",
            "custom_fields",
            "do_not_call",
            "consent_at",
            "consent_source",
        }
        updates = {k: v for k, v in fields.items() if k in allowed}
        async with self.async_session() as session:
            result = await session.execute(
                select(ContactModel).where(
                    ContactModel.id == contact_id,
                    ContactModel.organization_id == organization_id,
                )
            )
            contact = result.scalar_one_or_none()
            if contact is None:
                return None
            for k, v in updates.items():
                setattr(contact, k, v)
            if tag_names is not None:
                contact.tags = [
                    await self._get_or_create_tag_in_session(
                        session, organization_id, name
                    )
                    for name in tag_names
                ]
            await session.commit()
            await session.refresh(contact, attribute_names=["tags"])
            return contact

    async def soft_delete_contact(self, contact_id: int, organization_id: int) -> bool:
        async with self.async_session() as session:
            result = await session.execute(
                select(ContactModel).where(
                    ContactModel.id == contact_id,
                    ContactModel.organization_id == organization_id,
                )
            )
            contact = result.scalar_one_or_none()
            if contact is None:
                return False
            contact.deleted_at = datetime.now(UTC)
            await session.commit()
            return True

    async def upsert_contact_by_phone(
        self,
        organization_id: int,
        phone: str,
        *,
        source: str = ContactSource.CALL.value,
        first_name: Optional[str] = None,
        last_name: Optional[str] = None,
        email: Optional[str] = None,
        company_id: Optional[int] = None,
        lifecycle_stage: Optional[str] = None,
        custom_fields: Optional[dict] = None,
        do_not_call: Optional[bool] = None,
    ) -> ContactModel:
        """Find-or-create by (org, phone). The join key for call->CRM sync.

        Optional extra fields are applied on create and overwrite the existing
        contact when explicitly provided (used by CSV import).
        """
        async with self.async_session() as session:
            result = await session.execute(
                select(ContactModel).where(
                    ContactModel.organization_id == organization_id,
                    ContactModel.phone == phone,
                    ContactModel.deleted_at.is_(None),
                )
            )
            contact = result.scalar_one_or_none()
            if contact is not None:
                if first_name is not None:
                    contact.first_name = first_name
                if last_name is not None:
                    contact.last_name = last_name
                if email is not None:
                    contact.email = email
                if company_id is not None:
                    contact.company_id = company_id
                if lifecycle_stage is not None:
                    contact.lifecycle_stage = lifecycle_stage
                if custom_fields is not None:
                    contact.custom_fields = custom_fields
                if do_not_call is not None:
                    contact.do_not_call = do_not_call
                await session.commit()
                await session.refresh(contact, attribute_names=["tags"])
                return contact
            contact = ContactModel(
                organization_id=organization_id,
                phone=phone,
                first_name=first_name,
                last_name=last_name,
                email=email,
                company_id=company_id,
                source=source,
                lifecycle_stage=lifecycle_stage or ContactLifecycleStage.LEAD.value,
                custom_fields=custom_fields or {},
                do_not_call=bool(do_not_call),
            )
            session.add(contact)
            try:
                await session.commit()
            except IntegrityError:
                # Concurrent creation: fetch the winner.
                await session.rollback()
                result = await session.execute(
                    select(ContactModel).where(
                        ContactModel.organization_id == organization_id,
                        ContactModel.phone == phone,
                    )
                )
                return result.scalar_one()
            await session.refresh(contact, attribute_names=["tags"])
            return contact

    async def contact_is_do_not_call(self, organization_id: int, phone: str) -> bool:
        """True when a live contact with this phone is marked do-not-call."""
        async with self.async_session() as session:
            result = await session.execute(
                select(ContactModel.do_not_call).where(
                    ContactModel.organization_id == organization_id,
                    ContactModel.phone == phone,
                    ContactModel.deleted_at.is_(None),
                )
            )
            row = result.scalar_one_or_none()
            return bool(row)

    async def count_contacts(self, organization_id: int) -> int:
        async with self.async_session() as session:
            result = await session.execute(
                select(func.count())
                .select_from(ContactModel)
                .where(
                    ContactModel.organization_id == organization_id,
                    ContactModel.deleted_at.is_(None),
                )
            )
            return result.scalar_one()

    async def get_contact_stats(self, organization_id: int) -> dict:
        """Aggregate contact metrics for the org in SQL (no row fetching)."""
        seven_days_ago = datetime.now(UTC) - timedelta(days=7)
        async with self.async_session() as session:
            result = await session.execute(
                select(
                    func.count().label("total_contacts"),
                    func.count()
                    .filter(
                        ContactModel.lifecycle_stage == ContactLifecycleStage.LEAD.value
                    )
                    .label("leads"),
                    func.count()
                    .filter(
                        ContactModel.lifecycle_stage == ContactLifecycleStage.MQL.value
                    )
                    .label("mqls"),
                    func.count()
                    .filter(
                        ContactModel.lifecycle_stage == ContactLifecycleStage.SQL.value
                    )
                    .label("sqls"),
                    func.count()
                    .filter(
                        ContactModel.lifecycle_stage
                        == ContactLifecycleStage.OPPORTUNITY.value
                    )
                    .label("opportunities"),
                    func.count()
                    .filter(
                        ContactModel.lifecycle_stage
                        == ContactLifecycleStage.CUSTOMER.value
                    )
                    .label("customers"),
                    func.count()
                    .filter(ContactModel.do_not_call.is_(True))
                    .label("do_not_call_count"),
                    func.count()
                    .filter(ContactModel.created_at >= seven_days_ago)
                    .label("contacts_created_this_week"),
                ).where(
                    ContactModel.organization_id == organization_id,
                    ContactModel.deleted_at.is_(None),
                )
            )
            return dict(result.one()._mapping)

    # ------------------------------------------------------------------
    # Companies
    # ------------------------------------------------------------------

    async def create_company(
        self, organization_id: int, *, name: str, **fields
    ) -> CompanyModel:
        async with self.async_session() as session:
            company = CompanyModel(organization_id=organization_id, name=name, **fields)
            session.add(company)
            try:
                await session.commit()
            except IntegrityError as e:
                await session.rollback()
                raise ValueError(f"Company already exists: {e}") from e
            await session.refresh(company)
            return company

    async def get_company(
        self, company_id: int, organization_id: int
    ) -> Optional[CompanyModel]:
        async with self.async_session() as session:
            result = await session.execute(
                select(CompanyModel).where(
                    CompanyModel.id == company_id,
                    CompanyModel.organization_id == organization_id,
                )
            )
            return result.scalar_one_or_none()

    async def list_companies(self, organization_id: int) -> list[CompanyModel]:
        async with self.async_session() as session:
            result = await session.execute(
                select(CompanyModel)
                .where(CompanyModel.organization_id == organization_id)
                .order_by(CompanyModel.name.asc())
            )
            return list(result.scalars().all())

    async def update_company(
        self, company_id: int, organization_id: int, **fields
    ) -> Optional[CompanyModel]:
        allowed = {"name", "domain", "industry", "size", "owner_id", "custom_fields"}
        updates = {k: v for k, v in fields.items() if k in allowed}
        async with self.async_session() as session:
            result = await session.execute(
                select(CompanyModel).where(
                    CompanyModel.id == company_id,
                    CompanyModel.organization_id == organization_id,
                )
            )
            company = result.scalar_one_or_none()
            if company is None:
                return None
            for k, v in updates.items():
                setattr(company, k, v)
            await session.commit()
            await session.refresh(company)
            return company

    async def delete_company(self, company_id: int, organization_id: int) -> bool:
        async with self.async_session() as session:
            result = await session.execute(
                select(CompanyModel).where(
                    CompanyModel.id == company_id,
                    CompanyModel.organization_id == organization_id,
                )
            )
            company = result.scalar_one_or_none()
            if company is None:
                return False
            await session.delete(company)
            await session.commit()
            return True

    async def get_or_create_company_by_name(
        self, organization_id: int, name: str
    ) -> CompanyModel:
        """Find-or-create a company by (org, name) — used by CSV import."""
        async with self.async_session() as session:
            result = await session.execute(
                select(CompanyModel).where(
                    CompanyModel.organization_id == organization_id,
                    CompanyModel.name == name,
                )
            )
            company = result.scalar_one_or_none()
            if company is not None:
                return company
            company = CompanyModel(organization_id=organization_id, name=name)
            session.add(company)
            try:
                await session.commit()
            except IntegrityError:
                # Concurrent creation: fetch the winner.
                await session.rollback()
                result = await session.execute(
                    select(CompanyModel).where(
                        CompanyModel.organization_id == organization_id,
                        CompanyModel.name == name,
                    )
                )
                return result.scalar_one()
            await session.refresh(company)
            return company

    async def user_is_org_member(self, user_id: int, organization_id: int) -> bool:
        """True when the user has a membership row in the organization.

        Used to validate ``owner_id`` FK writes — the FK only proves the user
        exists, not that they belong to the caller's org.
        """
        from api.db.models import organization_users_association

        async with self.async_session() as session:
            result = await session.execute(
                select(organization_users_association.c.user_id).where(
                    (organization_users_association.c.user_id == user_id)
                    & (
                        organization_users_association.c.organization_id
                        == organization_id
                    )
                )
            )
            return result.scalar_one_or_none() is not None

    # ------------------------------------------------------------------
    # Deals
    # ------------------------------------------------------------------

    async def create_deal(
        self, organization_id: int, *, title: str, **fields
    ) -> DealModel:
        async with self.async_session() as session:
            deal = DealModel(organization_id=organization_id, title=title, **fields)
            session.add(deal)
            await session.commit()
            await session.refresh(deal)
            return deal

    async def get_deal(self, deal_id: int, organization_id: int) -> Optional[DealModel]:
        async with self.async_session() as session:
            result = await session.execute(
                select(DealModel).where(
                    DealModel.id == deal_id,
                    DealModel.organization_id == organization_id,
                )
            )
            return result.scalar_one_or_none()

    async def list_deals(
        self,
        organization_id: int,
        *,
        status: Optional[str] = None,
        pipeline: Optional[str] = None,
        contact_id: Optional[int] = None,
    ) -> list[DealModel]:
        async with self.async_session() as session:
            query = select(DealModel).where(
                DealModel.organization_id == organization_id
            )
            if status:
                query = query.where(DealModel.status == status)
            if pipeline:
                query = query.where(DealModel.pipeline == pipeline)
            if contact_id:
                query = query.where(DealModel.contact_id == contact_id)
            result = await session.execute(query.order_by(DealModel.created_at.desc()))
            return list(result.scalars().all())

    async def update_deal(
        self, deal_id: int, organization_id: int, **fields
    ) -> Optional[DealModel]:
        allowed = {
            "title",
            "value",
            "currency",
            "pipeline",
            "stage",
            "probability",
            "expected_close_date",
            "owner_id",
            "status",
            "lost_reason",
            "contact_id",
            "company_id",
        }
        updates = {k: v for k, v in fields.items() if k in allowed}
        async with self.async_session() as session:
            result = await session.execute(
                select(DealModel).where(
                    DealModel.id == deal_id,
                    DealModel.organization_id == organization_id,
                )
            )
            deal = result.scalar_one_or_none()
            if deal is None:
                return None
            for k, v in updates.items():
                setattr(deal, k, v)
            await session.commit()
            await session.refresh(deal)
            return deal

    async def delete_deal(self, deal_id: int, organization_id: int) -> bool:
        async with self.async_session() as session:
            result = await session.execute(
                select(DealModel).where(
                    DealModel.id == deal_id,
                    DealModel.organization_id == organization_id,
                )
            )
            deal = result.scalar_one_or_none()
            if deal is None:
                return False
            await session.delete(deal)
            await session.commit()
            return True

    # ------------------------------------------------------------------
    # Activities (timeline)
    # ------------------------------------------------------------------

    async def create_activity(
        self,
        organization_id: int,
        *,
        contact_id: int,
        type: str,
        body: Optional[str] = None,
        deal_id: Optional[int] = None,
        workflow_run_id: Optional[int] = None,
        created_by: Optional[int] = None,
        due_at: Optional[datetime] = None,
    ) -> ActivityModel:
        async with self.async_session() as session:
            activity = ActivityModel(
                organization_id=organization_id,
                contact_id=contact_id,
                type=type,
                body=body,
                deal_id=deal_id,
                workflow_run_id=workflow_run_id,
                created_by=created_by,
                due_at=due_at,
            )
            session.add(activity)
            await session.commit()
            await session.refresh(activity)
            return activity

    async def list_activities_for_contact(
        self, contact_id: int, organization_id: int, *, limit: int = 100
    ) -> list[ActivityModel]:
        async with self.async_session() as session:
            result = await session.execute(
                select(ActivityModel)
                .where(
                    ActivityModel.contact_id == contact_id,
                    ActivityModel.organization_id == organization_id,
                )
                .order_by(ActivityModel.created_at.desc())
                .limit(limit)
            )
            return list(result.scalars().all())

    async def list_open_tasks(
        self, organization_id: int, *, owner_id: Optional[int] = None
    ) -> list[ActivityModel]:
        async with self.async_session() as session:
            query = select(ActivityModel).where(
                ActivityModel.organization_id == organization_id,
                ActivityModel.type == ActivityType.TASK.value,
                ActivityModel.completed_at.is_(None),
            )
            if owner_id is not None:
                query = query.where(ActivityModel.created_by == owner_id)
            result = await session.execute(
                query.order_by(ActivityModel.due_at.asc().nullslast())
            )
            return list(result.scalars().all())

    async def complete_task(
        self, activity_id: int, organization_id: int
    ) -> Optional[ActivityModel]:
        async with self.async_session() as session:
            result = await session.execute(
                select(ActivityModel).where(
                    ActivityModel.id == activity_id,
                    ActivityModel.organization_id == organization_id,
                    ActivityModel.type == ActivityType.TASK.value,
                )
            )
            activity = result.scalar_one_or_none()
            if activity is None:
                return None
            activity.completed_at = datetime.now(UTC)
            await session.commit()
            await session.refresh(activity)
            return activity

    async def find_call_activity_by_run(
        self, workflow_run_id: int
    ) -> Optional[ActivityModel]:
        async with self.async_session() as session:
            result = await session.execute(
                select(ActivityModel).where(
                    ActivityModel.workflow_run_id == workflow_run_id,
                    ActivityModel.type == ActivityType.CALL.value,
                )
            )
            return result.scalar_one_or_none()

    # ------------------------------------------------------------------
    # Tags
    # ------------------------------------------------------------------

    async def _get_or_create_tag_in_session(
        self, session, organization_id: int, name: str
    ) -> TagModel:
        """Get-or-create an org tag within an existing session/transaction."""
        result = await session.execute(
            select(TagModel).where(
                TagModel.organization_id == organization_id,
                TagModel.name == name,
            )
        )
        tag = result.scalar_one_or_none()
        if tag is not None:
            return tag
        tag = TagModel(organization_id=organization_id, name=name)
        session.add(tag)
        await session.flush()
        return tag

    async def get_or_create_tag(self, organization_id: int, name: str) -> TagModel:
        async with self.async_session() as session:
            result = await session.execute(
                select(TagModel).where(
                    TagModel.organization_id == organization_id,
                    TagModel.name == name,
                )
            )
            tag = result.scalar_one_or_none()
            if tag is not None:
                return tag
            tag = TagModel(organization_id=organization_id, name=name)
            session.add(tag)
            try:
                await session.commit()
            except IntegrityError:
                await session.rollback()
                result = await session.execute(
                    select(TagModel).where(
                        TagModel.organization_id == organization_id,
                        TagModel.name == name,
                    )
                )
                return result.scalar_one()
            await session.refresh(tag)
            return tag

    async def list_tags(self, organization_id: int) -> list[TagModel]:
        async with self.async_session() as session:
            result = await session.execute(
                select(TagModel)
                .where(TagModel.organization_id == organization_id)
                .order_by(TagModel.name.asc())
            )
            return list(result.scalars().all())

    # ------------------------------------------------------------------
    # Call → timeline sync
    # ------------------------------------------------------------------

    async def sync_workflow_run_to_timeline(
        self, workflow_run_id: int
    ) -> Optional[int]:
        """Upsert a contact by the run's peer phone number and write a ``call``
        activity linking the run. Returns the contact id, or None when the run
        has no usable phone number (web/chat runs) or no resolvable org —
        nothing to sync.

        Idempotent: the unique partial index on (workflow_run_id) for call
        activities means a retried completion never double-logs a call.
        """
        async with self.async_session() as session:
            run = (
                await session.execute(
                    select(WorkflowRunModel)
                    .where(WorkflowRunModel.id == workflow_run_id)
                    .options(selectinload(WorkflowRunModel.workflow))
                )
            ).scalar_one_or_none()
            if run is None:
                logger.warning(
                    f"Timeline sync: workflow run {workflow_run_id} not found; skipping"
                )
                return None

            # WorkflowRunModel has no organization_id column — the run's
            # workflow carries it.
            org_id = run.workflow.organization_id if run.workflow else None
            if org_id is None:
                logger.warning(
                    f"Timeline sync: cannot resolve organization for workflow run "
                    f"{workflow_run_id} (workflow_id={run.workflow_id}); skipping"
                )
                return None

            initial = run.initial_context or {}
            gathered = run.gathered_context or {}
            direction = (initial.get("direction") or "").lower()
            # Outbound: the peer is who we dialed. Inbound: the peer is the caller.
            phone = (
                initial.get("called_number")
                if direction == "outbound"
                else initial.get("caller_number")
            )
            phone = phone or initial.get("phone_number")
            if not phone:
                logger.debug(
                    f"Timeline sync: run {workflow_run_id} has no peer phone; skipping"
                )
                return None

            usage_info = run.usage_info or {}
            duration = usage_info.get("call_duration_seconds")
            disposition = gathered.get("mapped_call_disposition")
            summary = gathered.get("call_summary") or gathered.get("summary")

        contact = await self.upsert_contact_by_phone(org_id, phone)

        existing = await self.find_call_activity_by_run(workflow_run_id)
        if existing is not None:
            return contact.id

        parts = []
        if summary:
            parts.append(str(summary))
        if disposition:
            parts.append(f"Disposition: {disposition}")
        if duration is not None:
            parts.append(f"Duration: {duration}s")

        await self.create_activity(
            org_id,
            contact_id=contact.id,
            type=ActivityType.CALL.value,
            body="\n".join(parts) if parts else None,
            workflow_run_id=workflow_run_id,
        )
        return contact.id
