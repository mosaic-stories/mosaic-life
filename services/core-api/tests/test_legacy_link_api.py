"""Tests for Legacy Link API endpoints."""

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy, LegacyMember
from app.models.legacy_link import LegacyLink
from app.models.person import Person
from app.models.user import User

from .conftest import create_auth_headers_for_user


@pytest_asyncio.fixture
async def shared_person(db_session: AsyncSession) -> Person:
    """Create a person shared by two legacies."""
    person = Person(canonical_name="Jane Doe")
    db_session.add(person)
    await db_session.commit()
    await db_session.refresh(person)
    return person


@pytest_asyncio.fixture
async def requester_legacy(
    db_session: AsyncSession, test_user: User, shared_person: Person
) -> Legacy:
    """Create a legacy owned by test_user that references shared_person."""
    legacy = Legacy(
        name="Requester Legacy",
        biography="Requester biography",
        created_by=test_user.id,
        visibility="private",
        person_id=shared_person.id,
    )
    db_session.add(legacy)
    await db_session.flush()

    member = LegacyMember(
        legacy_id=legacy.id,
        user_id=test_user.id,
        role="creator",
    )
    db_session.add(member)
    await db_session.commit()
    await db_session.refresh(legacy)
    return legacy


@pytest_asyncio.fixture
async def target_legacy(
    db_session: AsyncSession, test_user_2: User, shared_person: Person
) -> Legacy:
    """Create a legacy owned by test_user_2 that references the same shared_person."""
    legacy = Legacy(
        name="Target Legacy",
        biography="Target biography",
        created_by=test_user_2.id,
        visibility="private",
        person_id=shared_person.id,
    )
    db_session.add(legacy)
    await db_session.flush()

    member = LegacyMember(
        legacy_id=legacy.id,
        user_id=test_user_2.id,
        role="creator",
    )
    db_session.add(member)
    await db_session.commit()
    await db_session.refresh(legacy)
    return legacy


@pytest_asyncio.fixture
async def pending_link(
    db_session: AsyncSession,
    test_user: User,
    requester_legacy: Legacy,
    target_legacy: Legacy,
    shared_person: Person,
) -> LegacyLink:
    """Create a pending link request from requester_legacy to target_legacy."""
    link = LegacyLink(
        person_id=shared_person.id,
        requester_legacy_id=requester_legacy.id,
        target_legacy_id=target_legacy.id,
        requested_by=test_user.id,
        status="pending",
    )
    db_session.add(link)
    await db_session.commit()
    await db_session.refresh(link)
    return link


@pytest_asyncio.fixture
async def active_link(
    db_session: AsyncSession,
    test_user: User,
    test_user_2: User,
    requester_legacy: Legacy,
    target_legacy: Legacy,
    shared_person: Person,
) -> LegacyLink:
    """Create an active link between the two legacies."""
    link = LegacyLink(
        person_id=shared_person.id,
        requester_legacy_id=requester_legacy.id,
        target_legacy_id=target_legacy.id,
        requested_by=test_user.id,
        responded_by=test_user_2.id,
        status="active",
    )
    db_session.add(link)
    await db_session.commit()
    await db_session.refresh(link)
    return link


@pytest.mark.asyncio
class TestCreateLinkRequest:
    async def test_requires_auth(
        self,
        client: AsyncClient,
        requester_legacy: Legacy,
        target_legacy: Legacy,
        shared_person: Person,
    ):
        response = await client.post(
            "/api/legacy-links/",
            params={"requester_legacy_id": str(requester_legacy.id)},
            json={
                "target_legacy_id": str(target_legacy.id),
                "person_id": str(shared_person.id),
            },
        )
        assert response.status_code == 401

    async def test_create_link_request_success(
        self,
        client: AsyncClient,
        auth_headers: dict,
        requester_legacy: Legacy,
        target_legacy: Legacy,
        shared_person: Person,
    ):
        response = await client.post(
            "/api/legacy-links/",
            params={"requester_legacy_id": str(requester_legacy.id)},
            json={
                "target_legacy_id": str(target_legacy.id),
                "person_id": str(shared_person.id),
            },
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["status"] == "pending"
        assert data["requester_legacy_id"] == str(requester_legacy.id)
        assert data["target_legacy_id"] == str(target_legacy.id)
        assert data["person_id"] == str(shared_person.id)
        assert data["requester_legacy_name"] == "Requester Legacy"
        assert data["target_legacy_name"] == "Target Legacy"
        assert data["person_name"] == "Jane Doe"

    async def test_create_link_missing_requester_id(
        self,
        client: AsyncClient,
        auth_headers: dict,
        target_legacy: Legacy,
        shared_person: Person,
    ):
        response = await client.post(
            "/api/legacy-links/",
            json={
                "target_legacy_id": str(target_legacy.id),
                "person_id": str(shared_person.id),
            },
            headers=auth_headers,
        )
        assert response.status_code == 422

    async def test_create_link_duplicate_returns_409(
        self,
        client: AsyncClient,
        auth_headers: dict,
        requester_legacy: Legacy,
        target_legacy: Legacy,
        shared_person: Person,
        pending_link: LegacyLink,
    ):
        response = await client.post(
            "/api/legacy-links/",
            params={"requester_legacy_id": str(requester_legacy.id)},
            json={
                "target_legacy_id": str(target_legacy.id),
                "person_id": str(shared_person.id),
            },
            headers=auth_headers,
        )
        assert response.status_code == 409


@pytest.mark.asyncio
class TestListLinks:
    async def test_requires_auth(self, client: AsyncClient):
        response = await client.get("/api/legacy-links/")
        assert response.status_code == 401

    async def test_list_links_empty(self, client: AsyncClient, auth_headers: dict):
        response = await client.get("/api/legacy-links/", headers=auth_headers)
        assert response.status_code == 200
        assert response.json() == []

    async def test_list_links_returns_user_links(
        self,
        client: AsyncClient,
        auth_headers: dict,
        pending_link: LegacyLink,
    ):
        response = await client.get("/api/legacy-links/", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["id"] == str(pending_link.id)
        assert data[0]["status"] == "pending"
        assert data[0]["requester_legacy_name"] == "Requester Legacy"
        assert data[0]["target_legacy_name"] == "Target Legacy"
        assert data[0]["person_name"] == "Jane Doe"


@pytest.mark.asyncio
class TestGetLinkDetail:
    async def test_requires_auth(self, client: AsyncClient, pending_link: LegacyLink):
        response = await client.get(f"/api/legacy-links/{pending_link.id}")
        assert response.status_code == 401

    async def test_get_link_detail_success(
        self,
        client: AsyncClient,
        auth_headers: dict,
        pending_link: LegacyLink,
    ):
        response = await client.get(
            f"/api/legacy-links/{pending_link.id}",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(pending_link.id)
        assert data["status"] == "pending"
        assert data["requester_legacy_name"] == "Requester Legacy"
        assert data["target_legacy_name"] == "Target Legacy"
        assert data["person_name"] == "Jane Doe"

    async def test_get_link_not_found(
        self,
        client: AsyncClient,
        auth_headers: dict,
    ):
        import uuid

        fake_id = uuid.uuid4()
        response = await client.get(
            f"/api/legacy-links/{fake_id}",
            headers=auth_headers,
        )
        assert response.status_code == 404

    async def test_get_link_forbidden_for_unrelated_user(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        pending_link: LegacyLink,
    ):
        # Create a third user with no link access
        third_user = User(
            email="third@example.com",
            google_id="google_third_789",
            name="Third User",
        )
        db_session.add(third_user)
        await db_session.commit()
        await db_session.refresh(third_user)

        third_headers = create_auth_headers_for_user(third_user)
        response = await client.get(
            f"/api/legacy-links/{pending_link.id}",
            headers=third_headers,
        )
        assert response.status_code == 403


@pytest.mark.asyncio
class TestRespondToLink:
    async def test_requires_auth(self, client: AsyncClient, pending_link: LegacyLink):
        response = await client.patch(
            f"/api/legacy-links/{pending_link.id}/respond",
            json={"action": "accept"},
        )
        assert response.status_code == 401

    async def test_accept_link_as_target_user(
        self,
        client: AsyncClient,
        test_user_2: User,
        pending_link: LegacyLink,
    ):
        headers = create_auth_headers_for_user(test_user_2)
        response = await client.patch(
            f"/api/legacy-links/{pending_link.id}/respond",
            json={"action": "accept"},
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "active"
        assert data["responded_by"] is not None

    async def test_reject_link_as_target_user(
        self,
        client: AsyncClient,
        test_user_2: User,
        pending_link: LegacyLink,
    ):
        headers = create_auth_headers_for_user(test_user_2)
        response = await client.patch(
            f"/api/legacy-links/{pending_link.id}/respond",
            json={"action": "reject"},
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "rejected"

    async def test_respond_invalid_action(
        self,
        client: AsyncClient,
        test_user_2: User,
        pending_link: LegacyLink,
    ):
        headers = create_auth_headers_for_user(test_user_2)
        response = await client.patch(
            f"/api/legacy-links/{pending_link.id}/respond",
            json={"action": "invalid"},
            headers=headers,
        )
        assert response.status_code == 422

    async def test_respond_not_target_user_returns_403(
        self,
        client: AsyncClient,
        auth_headers: dict,
        pending_link: LegacyLink,
    ):
        # test_user is the requester, not the target — should be denied
        response = await client.patch(
            f"/api/legacy-links/{pending_link.id}/respond",
            json={"action": "accept"},
            headers=auth_headers,
        )
        assert response.status_code == 403


@pytest.mark.asyncio
class TestRevokeLink:
    async def test_requires_auth(self, client: AsyncClient, active_link: LegacyLink):
        response = await client.patch(f"/api/legacy-links/{active_link.id}/revoke")
        assert response.status_code == 401

    async def test_revoke_link_as_requester(
        self,
        client: AsyncClient,
        auth_headers: dict,
        active_link: LegacyLink,
    ):
        response = await client.patch(
            f"/api/legacy-links/{active_link.id}/revoke",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "revoked"
        assert data["revoked_at"] is not None

    async def test_revoke_pending_link_returns_400(
        self,
        client: AsyncClient,
        auth_headers: dict,
        pending_link: LegacyLink,
    ):
        response = await client.patch(
            f"/api/legacy-links/{pending_link.id}/revoke",
            headers=auth_headers,
        )
        assert response.status_code == 400


@pytest.mark.asyncio
class TestListShares:
    async def test_requires_auth(self, client: AsyncClient, active_link: LegacyLink):
        response = await client.get(f"/api/legacy-links/{active_link.id}/shares")
        assert response.status_code == 401

    async def test_list_shares_empty(
        self,
        client: AsyncClient,
        auth_headers: dict,
        active_link: LegacyLink,
    ):
        response = await client.get(
            f"/api/legacy-links/{active_link.id}/shares",
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json() == []
