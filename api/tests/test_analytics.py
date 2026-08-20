"""Tests for the org-scoped analytics endpoints (/organizations/analytics/*).

Covers:
- KPI math on a small known fixture (connect rate, win rate, avg duration, cost)
- Per-day call series and range boundaries (runs outside the range excluded)
- Disposition aggregation from gathered_context JSON
- Duration bucket shape (fixed 6 buckets)
- CRM series: contact growth/sources, deals by stage, won/lost per day, activities by type
- Org isolation: org B sees only its own data
- Range validation and default (last 30 days) behavior
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from api.enums import CallType, OrganizationRole

UTC = ZoneInfo("UTC")

# Fixed test range: all of August 2026 (UTC).
RANGE_START = "2026-08-01"
RANGE_END = "2026-08-31"


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


async def _make_run(
    db_session,
    async_session,
    org,
    user,
    workflow,
    *,
    created_at: datetime,
    is_completed: bool,
    duration: float,
    charge_usd: float,
    disposition: str,
    call_type: CallType = CallType.OUTBOUND,
):
    run = await db_session.create_workflow_run(
        name=f"run-{created_at.isoformat()}-{disposition}",
        workflow_id=workflow.id,
        mode="twilio",
        user_id=user.id,
        call_type=call_type,
    )
    run.created_at = created_at
    run.is_completed = is_completed
    run.call_type = call_type.value
    run.usage_info = {"call_duration_seconds": duration}
    run.cost_info = {"charge_usd": charge_usd}
    run.gathered_context = {"mapped_call_disposition": disposition}
    await async_session.commit()
    return run


async def _seed_org_a(db_session, async_session):
    """Seed org A with a known analytics fixture; return (org, user)."""
    org, user = await _make_org(db_session, "analytics_a")
    workflow = await db_session.create_workflow(
        name="Analytics WF",
        workflow_definition={},
        user_id=user.id,
        organization_id=org.id,
    )

    # Runs inside the August range.
    await _make_run(
        db_session,
        async_session,
        org,
        user,
        workflow,
        created_at=datetime(2026, 8, 10, 12, 0, tzinfo=UTC),
        is_completed=True,
        duration=100,
        charge_usd=0.5,
        disposition="interested",
    )
    await _make_run(
        db_session,
        async_session,
        org,
        user,
        workflow,
        created_at=datetime(2026, 8, 10, 13, 0, tzinfo=UTC),
        is_completed=False,
        duration=20,
        charge_usd=0.1,
        disposition="no_answer",
    )
    await _make_run(
        db_session,
        async_session,
        org,
        user,
        workflow,
        created_at=datetime(2026, 8, 15, 9, 0, tzinfo=UTC),
        is_completed=True,
        duration=300,
        charge_usd=1.5,
        disposition="interested",
        call_type=CallType.INBOUND,
    )
    # Run outside the range — must be excluded from all aggregates.
    await _make_run(
        db_session,
        async_session,
        org,
        user,
        workflow,
        created_at=datetime(2026, 7, 1, 9, 0, tzinfo=UTC),
        is_completed=True,
        duration=999,
        charge_usd=9.99,
        disposition="interested",
    )

    # Contacts: 3 active (2 created in range, 1 older), 1 soft-deleted.
    c1 = await db_session.create_contact(org.id, phone="+15550100001")
    c1.created_at = datetime(2026, 8, 5, tzinfo=UTC)
    c2 = await db_session.create_contact(
        org.id, phone="+15550100002", lifecycle_stage="customer", source="csv"
    )
    c2.created_at = datetime(2026, 8, 20, tzinfo=UTC)
    c3 = await db_session.create_contact(org.id, phone="+15550100003")
    c3.created_at = datetime(2026, 7, 1, tzinfo=UTC)  # older than range
    c4 = await db_session.create_contact(org.id, phone="+15550100004")
    c4.created_at = datetime(2026, 8, 6, tzinfo=UTC)
    c4.deleted_at = datetime(2026, 8, 7, tzinfo=UTC)  # soft-deleted: excluded

    # Deals: one open, one won (closed in range), one lost (closed in range).
    await db_session.create_deal(org.id, title="Open deal", value=1000, stage="lead")
    won_deal = await db_session.create_deal(
        org.id, title="Won deal", value=500, stage="lead", status="won"
    )
    won_deal.updated_at = datetime(2026, 8, 12, tzinfo=UTC)
    lost_deal = await db_session.create_deal(
        org.id, title="Lost deal", value=200, stage="lead", status="lost"
    )
    lost_deal.updated_at = datetime(2026, 8, 12, tzinfo=UTC)

    # Activities: an overdue open task, a task completed in range, a note.
    overdue_task = await db_session.create_activity(
        org.id, contact_id=c1.id, type="task", body="overdue"
    )
    overdue_task.created_at = datetime(2026, 8, 5, tzinfo=UTC)
    overdue_task.due_at = datetime.now(UTC) - timedelta(days=1)
    done_task = await db_session.create_activity(
        org.id, contact_id=c1.id, type="task", body="done"
    )
    done_task.created_at = datetime(2026, 8, 5, tzinfo=UTC)
    done_task.completed_at = datetime(2026, 8, 9, tzinfo=UTC)
    note = await db_session.create_activity(
        org.id, contact_id=c1.id, type="note", body="note"
    )
    note.created_at = datetime(2026, 8, 5, tzinfo=UTC)

    await async_session.commit()
    return org, user


async def test_overview_kpi_math_and_org_isolation(
    db_session, async_session, test_client_factory
):
    await _seed_org_a(db_session, async_session)
    _, user_b = await _make_org(db_session, "analytics_b")

    async with test_client_factory(user_b) as client_b:
        # Org B is empty: everything zero.
        response = await client_b.get(
            "/api/v1/organizations/analytics/overview",
            params={"start": RANGE_START, "end": RANGE_END},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["calls"] == {
            "total": 0,
            "completed": 0,
            "connect_rate": 0.0,
            "avg_duration_seconds": 0.0,
            "total_cost_usd": 0.0,
            "inbound": 0,
            "outbound": 0,
        }
        assert body["contacts"]["total"] == 0
        assert body["deals"]["open_count"] == 0
        assert body["tasks"]["open"] == 0

    # Re-seed: _seed_org_a created its own user; fetch it back for a client.
    user_a = await db_session.get_or_create_user_by_provider_id("analytics_a_creator")
    async with test_client_factory(user_a[0]) as client_a:
        response = await client_a.get(
            "/api/v1/organizations/analytics/overview",
            params={"start": RANGE_START, "end": RANGE_END},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["start"] == RANGE_START
        assert body["end"] == RANGE_END

        calls = body["calls"]
        assert calls["total"] == 3
        assert calls["completed"] == 2
        assert calls["connect_rate"] == round(2 / 3, 4)
        assert calls["avg_duration_seconds"] == 140.0  # (100+20+300)/3
        assert abs(calls["total_cost_usd"] - 2.1) < 1e-9
        assert calls["inbound"] == 1
        assert calls["outbound"] == 2

        contacts = body["contacts"]
        assert contacts["total"] == 3  # soft-deleted excluded
        assert contacts["new_in_range"] == 2
        assert contacts["by_lifecycle_stage"] == {"lead": 2, "customer": 1}

        deals = body["deals"]
        assert deals["open_count"] == 1
        assert deals["open_value"] == 1000.0
        assert deals["won_count"] == 1
        assert deals["won_value_in_range"] == 500.0
        assert deals["lost_count"] == 1
        assert deals["win_rate"] == 0.5

        tasks = body["tasks"]
        assert tasks["open"] == 1
        assert tasks["completed_in_range"] == 1
        assert tasks["overdue"] == 1


async def test_calls_series_dispositions_and_buckets(
    db_session, async_session, test_client_factory
):
    await _seed_org_a(db_session, async_session)
    user_a = await db_session.get_or_create_user_by_provider_id("analytics_a_creator")

    async with test_client_factory(user_a[0]) as client:
        response = await client.get(
            "/api/v1/organizations/analytics/calls",
            params={"start": RANGE_START, "end": RANGE_END},
        )
        assert response.status_code == 200, response.text
        body = response.json()

        daily = {d["date"]: d for d in body["daily"]}
        assert set(daily) == {"2026-08-10", "2026-08-15"}  # July run excluded
        assert daily["2026-08-10"]["total"] == 2
        assert daily["2026-08-10"]["completed"] == 1
        assert daily["2026-08-10"]["avg_duration_seconds"] == 60.0
        assert abs(daily["2026-08-10"]["cost_usd"] - 0.6) < 1e-9
        assert daily["2026-08-15"]["total"] == 1
        assert daily["2026-08-15"]["avg_duration_seconds"] == 300.0

        dispositions = {d["disposition"]: d["count"] for d in body["dispositions"]}
        assert dispositions == {"interested": 2, "no_answer": 1}

        buckets = {b["bucket"]: b["count"] for b in body["duration_buckets"]}
        assert buckets == {
            "0-10": 0,
            "10-30": 1,
            "30-60": 0,
            "60-120": 1,
            "120-180": 0,
            ">180": 1,
        }
        # Fixed 6-bucket shape preserved.
        assert [b["bucket"] for b in body["duration_buckets"]] == [
            "0-10",
            "10-30",
            "30-60",
            "60-120",
            "120-180",
            ">180",
        ]


async def test_crm_analytics(db_session, async_session, test_client_factory):
    await _seed_org_a(db_session, async_session)
    user_a = await db_session.get_or_create_user_by_provider_id("analytics_a_creator")

    async with test_client_factory(user_a[0]) as client:
        response = await client.get(
            "/api/v1/organizations/analytics/crm",
            params={"start": RANGE_START, "end": RANGE_END},
        )
        assert response.status_code == 200, response.text
        body = response.json()

        growth = {g["date"]: g["count"] for g in body["contacts_growth"]}
        assert growth == {"2026-08-05": 1, "2026-08-20": 1}  # deleted + July excluded

        sources = {s["source"]: s["count"] for s in body["contacts_by_source"]}
        assert sources == {"manual": 2, "csv": 1}

        stages = {s["stage"]: s for s in body["deals_by_stage"]}
        assert set(stages) == {"lead"}  # only open deals
        assert stages["lead"]["count"] == 1
        assert stages["lead"]["total_value"] == 1000.0

        won_lost = {d["date"]: d for d in body["deals_won_lost_per_day"]}
        assert won_lost == {
            "2026-08-12": {"date": "2026-08-12", "won_value": 500.0, "lost_count": 1}
        }

        activities = {
            (a["date"], a["type"]): a["count"]
            for a in body["activities_per_day_by_type"]
        }
        assert activities == {
            ("2026-08-05", "task"): 2,
            ("2026-08-05", "note"): 1,
        }

    # Org isolation: org B sees none of org A's CRM data.
    _, user_b = await _make_org(db_session, "analytics_crm_b")
    async with test_client_factory(user_b) as client_b:
        body = (
            await client_b.get(
                "/api/v1/organizations/analytics/crm",
                params={"start": RANGE_START, "end": RANGE_END},
            )
        ).json()
        assert body["contacts_growth"] == []
        assert body["contacts_by_source"] == []
        assert body["deals_by_stage"] == []
        assert body["deals_won_lost_per_day"] == []
        assert body["activities_per_day_by_type"] == []


async def test_range_validation(db_session, test_client_factory):
    _, user = await _make_org(db_session, "analytics_validate")

    async with test_client_factory(user) as client:
        # start after end → 400
        response = await client.get(
            "/api/v1/organizations/analytics/overview",
            params={"start": "2026-08-10", "end": "2026-08-01"},
        )
        assert response.status_code == 400

        # Range over 366 days → 400
        response = await client.get(
            "/api/v1/organizations/analytics/overview",
            params={"start": "2025-01-01", "end": "2026-12-31"},
        )
        assert response.status_code == 400

        # Invalid date format → 422
        response = await client.get(
            "/api/v1/organizations/analytics/overview", params={"start": "not-a-date"}
        )
        assert response.status_code == 422


async def test_default_range_is_last_30_days(
    db_session, async_session, test_client_factory
):
    org, user = await _make_org(db_session, "analytics_default")
    workflow = await db_session.create_workflow(
        name="Default WF",
        workflow_definition={},
        user_id=user.id,
        organization_id=org.id,
    )
    # A run created "now" falls inside the default last-30-days range.
    await db_session.create_workflow_run(
        name="run-now",
        workflow_id=workflow.id,
        mode="twilio",
        user_id=user.id,
    )

    async with test_client_factory(user) as client:
        response = await client.get("/api/v1/organizations/analytics/overview")
        assert response.status_code == 200, response.text
        body = response.json()

        today = datetime.now(UTC).date()
        assert body["end"] == today.isoformat()
        assert body["start"] == (today - timedelta(days=29)).isoformat()
        assert body["calls"]["total"] == 1
