"""Tests for organization membership roles and SaaS provider-config gating.

Covers:
- add_user_to_organization role defaults (first member owner, later agent)
- require_org_role 403/allow via PATCH /organizations
- members list / patch / delete rules
- DEPLOYMENT_MODE=saas gating of provider-config writes
- /organizations/context exposing role and org_name
"""

from api.enums import OrganizationRole
from api.services.auth import depends as auth_depends


async def _make_org(db_session, provider_id: str, creator_provider_id: str):
    creator, _ = await db_session.get_or_create_user_by_provider_id(creator_provider_id)
    org, _ = await db_session.get_or_create_organization_by_provider_id(
        provider_id, creator.id
    )
    return org


async def _make_member(db_session, provider_id: str, org, role: str, email=None):
    user, _ = await db_session.get_or_create_user_by_provider_id(provider_id)
    if email:
        await db_session.update_user_email(user.id, email)
    await db_session.add_user_to_organization(user.id, org.id, role=role)
    await db_session.update_user_selected_organization(user.id, org.id)
    # Reload so selected_organization_id is populated on the object.
    return await db_session.get_user_by_id(user.id)


async def test_first_member_is_owner_later_members_default_to_agent(db_session):
    org = await _make_org(db_session, "roles_default_org", "roles_default_creator")

    owner, _ = await db_session.get_or_create_user_by_provider_id("roles_default_owner")
    await db_session.add_user_to_organization(owner.id, org.id)
    assert (
        await db_session.get_organization_member_role(owner.id, org.id)
        == OrganizationRole.OWNER.value
    )

    agent, _ = await db_session.get_or_create_user_by_provider_id("roles_default_agent")
    await db_session.add_user_to_organization(agent.id, org.id)
    assert (
        await db_session.get_organization_member_role(agent.id, org.id)
        == OrganizationRole.AGENT.value
    )


async def test_org_role_dependency_allows_owner(db_session, test_client_factory):
    org = await _make_org(db_session, "roles_patch_org", "roles_patch_creator")
    owner = await _make_member(
        db_session, "roles_patch_owner", org, OrganizationRole.OWNER.value
    )

    async with test_client_factory(owner) as client:
        response = await client.patch(
            "/api/v1/organizations", json={"name": "Acme Corp"}
        )

    assert response.status_code == 200, response.text
    assert response.json()["name"] == "Acme Corp"


async def test_org_role_dependency_rejects_agent_and_non_member(
    db_session, test_client_factory
):
    org = await _make_org(db_session, "roles_403_org", "roles_403_creator")
    agent = await _make_member(
        db_session, "roles_403_agent", org, OrganizationRole.AGENT.value
    )
    admin = await _make_member(
        db_session, "roles_403_admin", org, OrganizationRole.ADMIN.value
    )
    # Selected org set without any membership row.
    outsider, _ = await db_session.get_or_create_user_by_provider_id(
        "roles_403_outsider"
    )
    await db_session.update_user_selected_organization(outsider.id, org.id)
    outsider = await db_session.get_user_by_id(outsider.id)

    for user in (agent, admin, outsider):
        async with test_client_factory(user) as client:
            response = await client.patch(
                "/api/v1/organizations", json={"name": "Nope"}
            )
        assert response.status_code == 403, (
            f"expected 403 for {user.provider_id}, got {response.status_code}"
        )


async def test_members_list_patch_delete_rules(db_session, test_client_factory):
    org = await _make_org(db_session, "members_org", "members_creator")
    owner = await _make_member(
        db_session,
        "members_owner",
        org,
        OrganizationRole.OWNER.value,
        email="owner@example.com",
    )
    agent = await _make_member(
        db_session,
        "members_agent",
        org,
        OrganizationRole.AGENT.value,
        email="agent@example.com",
    )

    # Any member can list.
    async with test_client_factory(agent) as client:
        response = await client.get("/api/v1/organizations/members")
    assert response.status_code == 200, response.text
    members = {m["user_id"]: m for m in response.json()}
    assert members[owner.id]["role"] == "owner"
    assert members[owner.id]["email"] == "owner@example.com"
    assert members[owner.id]["is_you"] is False
    assert members[agent.id]["role"] == "agent"
    assert members[agent.id]["is_you"] is True

    # An agent cannot change roles.
    async with test_client_factory(agent) as client:
        response = await client.patch(
            f"/api/v1/organizations/members/{owner.id}", json={"role": "agent"}
        )
    assert response.status_code == 403

    # An owner cannot change their own role.
    async with test_client_factory(owner) as client:
        response = await client.patch(
            f"/api/v1/organizations/members/{owner.id}", json={"role": "admin"}
        )
    assert response.status_code == 400

    # Invalid role values are rejected by schema validation.
    async with test_client_factory(owner) as client:
        response = await client.patch(
            f"/api/v1/organizations/members/{agent.id}", json={"role": "superadmin"}
        )
    assert response.status_code == 422

    # Owner can promote the agent.
    async with test_client_factory(owner) as client:
        response = await client.patch(
            f"/api/v1/organizations/members/{agent.id}", json={"role": "admin"}
        )
    assert response.status_code == 200, response.text
    assert response.json()["role"] == "admin"

    # Owner cannot remove themselves.
    async with test_client_factory(owner) as client:
        response = await client.delete(f"/api/v1/organizations/members/{owner.id}")
    assert response.status_code == 400

    # Owner can remove the member; their selected org is cleared with it.
    async with test_client_factory(owner) as client:
        response = await client.delete(f"/api/v1/organizations/members/{agent.id}")
    assert response.status_code == 200, response.text

    removed = await db_session.get_user_by_id(agent.id)
    assert removed.selected_organization_id is None
    assert (await db_session.get_organization_member_role(agent.id, org.id)) is None

    # Removing a non-member 404s.
    async with test_client_factory(owner) as client:
        response = await client.delete(f"/api/v1/organizations/members/{agent.id}")
    assert response.status_code == 404


async def test_organization_context_includes_role_and_org_name(
    db_session, test_client_factory
):
    org = await _make_org(db_session, "context_org", "context_creator")
    owner = await _make_member(
        db_session, "context_owner", org, OrganizationRole.OWNER.value
    )
    await db_session.update_organization_name(org.id, "Context Org")

    async with test_client_factory(owner) as client:
        response = await client.get("/api/v1/organizations/context")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["role"] == "owner"
    assert body["org_name"] == "Context Org"


async def test_saas_mode_gates_provider_config_writes(
    db_session, test_client_factory, monkeypatch
):
    monkeypatch.setattr(auth_depends, "DEPLOYMENT_MODE", "saas")
    org = await _make_org(db_session, "saas_gate_org", "saas_gate_creator")
    owner = await _make_member(
        db_session, "saas_gate_owner", org, OrganizationRole.OWNER.value
    )

    async with test_client_factory(owner) as client:
        response = await client.put(
            "/api/v1/organizations/model-configurations/v2", json={}
        )
        assert response.status_code == 403, response.text

        response = await client.post(
            "/api/v1/organizations/telephony-configs",
            json={
                "name": "Twilio",
                "config": {"provider": "twilio"},
            },
        )
        assert response.status_code == 403, response.text

        # Read-only GETs stay member-accessible in saas mode.
        response = await client.get("/api/v1/organizations/model-configurations/v2")
        assert response.status_code != 403

    # The platform team (superusers) can still write.
    owner.is_superuser = True
    async with test_client_factory(owner) as client:
        response = await client.put(
            "/api/v1/organizations/model-configurations/v2", json={}
        )
        assert response.status_code != 403

        response = await client.post(
            "/api/v1/organizations/telephony-configs",
            json={
                "name": "Twilio",
                "config": {"provider": "twilio"},
            },
        )
        assert response.status_code != 403


async def test_oss_mode_lets_members_write_provider_config(
    db_session, test_client_factory, monkeypatch
):
    monkeypatch.setattr(auth_depends, "DEPLOYMENT_MODE", "oss")
    org = await _make_org(db_session, "oss_gate_org", "oss_gate_creator")
    agent = await _make_member(
        db_session, "oss_gate_agent", org, OrganizationRole.AGENT.value
    )

    async with test_client_factory(agent) as client:
        # The request reaches the handler — a 403 would mean the gate fired.
        response = await client.put(
            "/api/v1/organizations/model-configurations/v2", json={}
        )
        assert response.status_code != 403, response.text
