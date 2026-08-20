"""Tests for the CRM subsystem: contacts, companies, deals, activities, tags.

Covers:
- Org isolation: org B cannot read/write org A's CRM rows; cross-org FK
  references are rejected with 404
- Deal stage default + pipeline board visibility (incl. unknown stages)
- Automatic stage_change activity logging on PATCH /deals/{id}
- Tags round-trip via tag_names and GET /contacts/tags
- GET /contacts/stats aggregate correctness
- CSV import honoring company_name/lifecycle_stage/custom_fields/do_not_call
- sync_workflow_run_to_timeline creating a call activity with correct
  org/duration (and skipping runs with no resolvable org)
"""

from api.enums import OrganizationRole


async def _make_org(db_session, prefix: str):
    """Create an org; return (org, owner-user with selected org set)."""
    creator, _ = await db_session.get_or_create_user_by_provider_id(f"{prefix}_creator")
    org, _ = await db_session.get_or_create_organization_by_provider_id(
        f"{prefix}_org", creator.id
    )
    await db_session.add_user_to_organization(
        creator.id, org.id, role=OrganizationRole.OWNER.value
    )
    await db_session.update_user_selected_organization(creator.id, org.id)
    return org, await db_session.get_user_by_id(creator.id)


async def _create_contact(client, **overrides):
    payload = {"first_name": "Jane", "last_name": "Doe", "phone": "+15550000001"}
    payload.update(overrides)
    response = await client.post("/api/v1/contacts", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


async def test_org_isolation_and_cross_org_fk_rejected(db_session, test_client_factory):
    org_a, user_a = await _make_org(db_session, "crm_iso_a")
    org_b, user_b = await _make_org(db_session, "crm_iso_b")

    async with test_client_factory(user_a) as client_a:
        company = (
            await client_a.post("/api/v1/companies", json={"name": "Acme A"})
        ).json()
        contact = await _create_contact(client_a, company_id=company["id"])
        deal = (
            await client_a.post(
                "/api/v1/deals",
                json={
                    "title": "Deal A",
                    "contact_id": contact["id"],
                    "company_id": company["id"],
                },
            )
        ).json()

    async with test_client_factory(user_b) as client_b:
        # Org B cannot read or write org A's rows.
        assert (
            await client_b.get(f"/api/v1/contacts/{contact['id']}")
        ).status_code == 404
        assert (
            await client_b.get(f"/api/v1/companies/{company['id']}")
        ).status_code == 404
        assert (await client_b.get(f"/api/v1/deals/{deal['id']}")).status_code == 404
        assert (
            await client_b.patch(
                f"/api/v1/contacts/{contact['id']}", json={"first_name": "Hax"}
            )
        ).status_code == 404
        assert (
            await client_b.delete(f"/api/v1/contacts/{contact['id']}")
        ).status_code == 404
        assert (
            await client_b.get(f"/api/v1/contacts/{contact['id']}/activities")
        ).status_code == 404

        # Cross-org FK references are rejected with 404.
        assert (
            await client_b.post(
                "/api/v1/contacts",
                json={"phone": "+15559990001", "company_id": company["id"]},
            )
        ).status_code == 404
        assert (
            await client_b.post(
                "/api/v1/deals",
                json={"title": "Evil", "contact_id": contact["id"]},
            )
        ).status_code == 404
        assert (
            await client_b.post(
                "/api/v1/deals",
                json={"title": "Evil", "company_id": company["id"]},
            )
        ).status_code == 404
        assert (
            await client_b.post(
                "/api/v1/activities",
                json={"contact_id": contact["id"], "type": "note", "body": "x"},
            )
        ).status_code == 404

    # owner_id must be a member of the caller's org.
    async with test_client_factory(user_a) as client_a:
        assert (
            await client_a.post(
                "/api/v1/contacts",
                json={"phone": "+15559990002", "owner_id": user_b.id},
            )
        ).status_code == 404


async def test_deal_stage_default_and_board_visibility(db_session, test_client_factory):
    org, user = await _make_org(db_session, "crm_board")

    async with test_client_factory(user) as client:
        # Default stage is "lead" — visible on the default board.
        response = await client.post("/api/v1/deals", json={"title": "Default stage"})
        assert response.status_code == 201, response.text
        deal = response.json()
        assert deal["stage"] == "lead"

        # A deal in a stage outside DEFAULT_STAGES (legacy row) must not
        # disappear from the board.
        legacy = await db_session.create_deal(
            org.id, title="Legacy stage deal", stage="legacy_custom"
        )

        response = await client.get("/api/v1/deals/board")
        assert response.status_code == 200, response.text
        board = response.json()
        columns = {c["stage_id"]: c for c in board["stages"]}

        assert columns["lead"]["deal_count"] == 1
        assert columns["lead"]["deals"][0]["id"] == deal["id"]
        assert "legacy_custom" in columns
        assert columns["legacy_custom"]["deal_count"] == 1
        assert columns["legacy_custom"]["deals"][0]["id"] == legacy.id
        assert board["total_deals_count"] == 2


async def test_stage_change_activity_logged_on_patch(db_session, test_client_factory):
    org, user = await _make_org(db_session, "crm_stage")

    async with test_client_factory(user) as client:
        contact = await _create_contact(client)
        deal = (
            await client.post(
                "/api/v1/deals",
                json={"title": "Big deal", "contact_id": contact["id"]},
            )
        ).json()
        assert deal["stage"] == "lead"

        # An actual stage change logs a stage_change activity.
        response = await client.patch(
            f"/api/v1/deals/{deal['id']}", json={"stage": "qualified"}
        )
        assert response.status_code == 200, response.text

        response = await client.get(f"/api/v1/contacts/{contact['id']}/activities")
        activities = response.json()
        stage_changes = [a for a in activities if a["type"] == "stage_change"]
        assert len(stage_changes) == 1
        assert "lead" in stage_changes[0]["body"]
        assert "qualified" in stage_changes[0]["body"]
        assert stage_changes[0]["deal_id"] == deal["id"]

        # Re-sending the same stage, or changing an unrelated field, logs nothing.
        await client.patch(f"/api/v1/deals/{deal['id']}", json={"stage": "qualified"})
        await client.patch(f"/api/v1/deals/{deal['id']}", json={"value": 1000})
        response = await client.get(f"/api/v1/contacts/{contact['id']}/activities")
        stage_changes = [a for a in response.json() if a["type"] == "stage_change"]
        assert len(stage_changes) == 1


async def test_tags_round_trip(db_session, test_client_factory):
    org, user = await _make_org(db_session, "crm_tags")

    async with test_client_factory(user) as client:
        contact = await _create_contact(
            client, phone="+15550000010", tag_names=["vip", "newsletter"]
        )
        assert {t["name"] for t in contact["tags"]} == {"vip", "newsletter"}
        assert all(t["organization_id"] == org.id for t in contact["tags"])

        # Org tag list endpoint.
        response = await client.get("/api/v1/contacts/tags")
        assert response.status_code == 200, response.text
        assert {t["name"] for t in response.json()} == {"vip", "newsletter"}

        # Get-or-create semantics: reusing "vip" must not duplicate it.
        await _create_contact(client, phone="+15550000011", tag_names=["vip"])
        response = await client.get("/api/v1/contacts/tags")
        assert len(response.json()) == 2

        # tag_names on update replaces the tag set (association only).
        response = await client.patch(
            f"/api/v1/contacts/{contact['id']}", json={"tag_names": ["vip"]}
        )
        assert response.status_code == 200, response.text
        assert {t["name"] for t in response.json()["tags"]} == {"vip"}

        response = await client.get(f"/api/v1/contacts/{contact['id']}")
        assert {t["name"] for t in response.json()["tags"]} == {"vip"}

        # The unused tag row stays in the org tag list.
        response = await client.get("/api/v1/contacts/tags")
        assert {t["name"] for t in response.json()} == {"vip", "newsletter"}


async def test_contact_stats_aggregates(db_session, test_client_factory):
    org, user = await _make_org(db_session, "crm_stats")

    async with test_client_factory(user) as client:
        await _create_contact(client, phone="+15550000020")  # lead by default
        await _create_contact(client, phone="+15550000021")  # lead by default
        await _create_contact(client, phone="+15550000022", lifecycle_stage="customer")
        await _create_contact(
            client, phone="+15550000023", lifecycle_stage="mql", do_not_call=True
        )
        deleted = await _create_contact(client, phone="+15550000024")
        await client.delete(f"/api/v1/contacts/{deleted['id']}")

        response = await client.get("/api/v1/contacts/stats")
        assert response.status_code == 200, response.text
        stats = response.json()
        assert stats["total_contacts"] == 4  # soft-deleted excluded
        assert stats["leads"] == 2
        assert stats["mqls"] == 1
        assert stats["sqls"] == 0
        assert stats["opportunities"] == 0
        assert stats["customers"] == 1
        assert stats["do_not_call_count"] == 1
        assert stats["contacts_created_this_week"] == 4

    # Stats are org-scoped.
    _, user_b = await _make_org(db_session, "crm_stats_b")
    async with test_client_factory(user_b) as client_b:
        stats = (await client_b.get("/api/v1/contacts/stats")).json()
        assert stats["total_contacts"] == 0


async def test_import_honors_all_fields(db_session, test_client_factory):
    org, user = await _make_org(db_session, "crm_import")

    async with test_client_factory(user) as client:
        response = await client.post(
            "/api/v1/contacts/import",
            json={
                "contacts": [
                    {
                        "first_name": "John",
                        "last_name": "Smith",
                        "email": "john@acme.com",
                        "phone": "+15550000030",
                        "company_name": "Acme Inc",
                        "lifecycle_stage": "sql",
                        "custom_fields": {"tier": "gold"},
                        "do_not_call": True,
                    },
                    {"first_name": "NoPhone"},  # skipped: missing phone
                ]
            },
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["imported_count"] == 1
        assert len(body["errors"]) == 1

        # Company was get-or-created within the org.
        companies = (await client.get("/api/v1/companies")).json()
        acme = next(c for c in companies if c["name"] == "Acme Inc")

        response = await client.get(
            "/api/v1/contacts", params={"search": "+15550000030"}
        )
        contact = response.json()["items"][0]
        assert contact["first_name"] == "John"
        assert contact["company_id"] == acme["id"]
        assert contact["lifecycle_stage"] == "sql"
        assert contact["custom_fields"] == {"tier": "gold"}
        assert contact["do_not_call"] is True
        assert contact["source"] == "csv"

        # Re-import upserts by (org, phone) and applies provided fields.
        response = await client.post(
            "/api/v1/contacts/import",
            json={
                "contacts": [
                    {
                        "phone": "+15550000030",
                        "do_not_call": False,
                        "lifecycle_stage": "opportunity",
                    }
                ]
            },
        )
        assert response.json()["imported_count"] == 1
        response = await client.get(
            "/api/v1/contacts", params={"search": "+15550000030"}
        )
        assert response.json()["total"] == 1
        contact = response.json()["items"][0]
        assert contact["do_not_call"] is False
        assert contact["lifecycle_stage"] == "opportunity"


async def test_sync_workflow_run_to_timeline(db_session, async_session):
    org, user = await _make_org(db_session, "crm_sync")

    workflow = await db_session.create_workflow(
        name="Sync WF",
        workflow_definition={},
        user_id=user.id,
        organization_id=org.id,
    )
    run = await db_session.create_workflow_run(
        name="run-1",
        workflow_id=workflow.id,
        mode="twilio",
        user_id=user.id,
        initial_context={
            "direction": "outbound",
            "called_number": "+15550000040",
        },
    )
    run.usage_info = {"call_duration_seconds": 87}
    run.gathered_context = {
        "call_summary": "Discussed pricing",
        "mapped_call_disposition": "interested",
    }
    await async_session.commit()

    contact_id = await db_session.sync_workflow_run_to_timeline(run.id)
    assert contact_id is not None

    # Contact upserted in the run's org, keyed by the peer phone number.
    contact = await db_session.get_contact(contact_id, org.id)
    assert contact is not None
    assert contact.phone == "+15550000040"
    assert contact.organization_id == org.id
    assert contact.source == "call"

    activities = await db_session.list_activities_for_contact(contact_id, org.id)
    assert len(activities) == 1
    activity = activities[0]
    assert activity.type == "call"
    assert activity.workflow_run_id == run.id
    assert activity.organization_id == org.id
    assert "Discussed pricing" in activity.body
    assert "Disposition: interested" in activity.body
    assert "Duration: 87s" in activity.body

    # Idempotent: a retried completion does not double-log the call.
    assert await db_session.sync_workflow_run_to_timeline(run.id) == contact_id
    activities = await db_session.list_activities_for_contact(contact_id, org.id)
    assert len(activities) == 1


async def test_sync_skips_run_without_org(db_session):
    _, user = await _make_org(db_session, "crm_sync_noorg")

    # Legacy workflow with no organization: sync must skip, not write org 0.
    workflow = await db_session.create_workflow(
        name="Orphan WF",
        workflow_definition={},
        user_id=user.id,
        organization_id=None,
    )
    run = await db_session.create_workflow_run(
        name="run-orphan",
        workflow_id=workflow.id,
        mode="twilio",
        user_id=user.id,
        initial_context={
            "direction": "outbound",
            "called_number": "+15550000041",
        },
    )

    assert await db_session.sync_workflow_run_to_timeline(run.id) is None
    assert await db_session.count_contacts(0) == 0

    # Unknown run id also skips cleanly.
    assert await db_session.sync_workflow_run_to_timeline(999999999) is None
