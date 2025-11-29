"""Integration tests for legacy API endpoints."""

import pytest
from datetime import datetime, timedelta, timezone
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy, LegacyMember
from app.models.user import User
from tests.conftest import create_auth_headers_for_user


class TestCreateLegacy:
    """Tests for POST /api/legacies."""

    @pytest.mark.asyncio
    async def test_create_legacy_success(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Test successful legacy creation."""
        data = {
            "name": "Jane Doe",
            "birth_date": "1950-01-15",
            "death_date": "2024-01-01",
            "biography": "A wonderful person",
        }

        response = await client.post(
            "/api/legacies/",
            json=data,
            headers=auth_headers,
        )

        assert response.status_code == 201
        result = response.json()
        assert result["name"] == "Jane Doe"
        assert result["biography"] == "A wonderful person"
        assert result["created_by"] == str(test_user.id)

    @pytest.mark.asyncio
    async def test_create_legacy_requires_auth(
        self,
        client: AsyncClient,
    ):
        """Test that creating legacy requires authentication."""
        data = {"name": "Test Legacy"}

        response = await client.post("/api/legacies/", json=data)

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_create_legacy_validation_error(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test validation error on invalid data."""
        data = {"name": ""}  # Empty name

        response = await client.post(
            "/api/legacies/",
            json=data,
            headers=auth_headers,
        )

        assert response.status_code == 422


class TestListLegacies:
    """Tests for GET /api/legacies."""

    @pytest.mark.asyncio
    async def test_list_legacies_success(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
    ):
        """Test listing user's legacies."""
        response = await client.get("/api/legacies/", headers=auth_headers)

        assert response.status_code == 200
        result = response.json()
        assert len(result) >= 1
        assert any(legacy["id"] == str(test_legacy.id) for legacy in result)

    @pytest.mark.asyncio
    async def test_list_legacies_requires_auth(
        self,
        client: AsyncClient,
    ):
        """Test that listing legacies requires authentication."""
        response = await client.get("/api/legacies/")

        assert response.status_code == 401


class TestSearchLegacies:
    """Tests for GET /api/legacies/search."""

    @pytest.mark.asyncio
    async def test_search_legacies_success(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
    ):
        """Test searching legacies by name."""
        response = await client.get(
            "/api/legacies/search",
            params={"q": "Test"},
            headers=auth_headers,
        )

        assert response.status_code == 200
        result = response.json()
        assert len(result) >= 1
        assert any(legacy["id"] == str(test_legacy.id) for legacy in result)

    @pytest.mark.asyncio
    async def test_search_requires_query_param(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Test that search requires query parameter."""
        response = await client.get(
            "/api/legacies/search",
            headers=auth_headers,
        )

        assert response.status_code == 422


class TestGetLegacy:
    """Tests for GET /api/legacies/{legacy_id}."""

    @pytest.mark.asyncio
    async def test_get_legacy_success(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
    ):
        """Test getting legacy details as member."""
        response = await client.get(
            f"/api/legacies/{test_legacy.id}",
            headers=auth_headers,
        )

        assert response.status_code == 200
        result = response.json()
        assert result["id"] == str(test_legacy.id)
        assert result["name"] == test_legacy.name
        assert "members" in result
        assert len(result["members"]) >= 1

    @pytest.mark.asyncio
    async def test_get_legacy_not_member(
        self,
        client: AsyncClient,
        test_legacy: Legacy,
        test_user_2: User,
    ):
        """Test access denied when not a member."""
        # Create auth headers for user_2
        from app.auth.middleware import create_session_cookie
        from app.auth.models import SessionData
        from app.config import get_settings

        settings = get_settings()
        now = datetime.now(timezone.utc)
        session_data = SessionData(
            user_id=test_user_2.id,
            google_id=test_user_2.google_id,
            email=test_user_2.email,
            name=test_user_2.name,
            avatar_url=test_user_2.avatar_url,
            created_at=now,
            expires_at=now + timedelta(hours=24),
        )
        cookie_name, cookie_value = create_session_cookie(settings, session_data)
        headers = {"Cookie": f"{cookie_name}={cookie_value}"}

        response = await client.get(
            f"/api/legacies/{test_legacy.id}",
            headers=headers,
        )

        assert response.status_code == 403


class TestUpdateLegacy:
    """Tests for PUT /api/legacies/{legacy_id}."""

    @pytest.mark.asyncio
    async def test_update_legacy_success(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
    ):
        """Test updating legacy as creator."""
        data = {
            "name": "Updated Name",
            "biography": "Updated bio",
        }

        response = await client.put(
            f"/api/legacies/{test_legacy.id}",
            json=data,
            headers=auth_headers,
        )

        assert response.status_code == 200
        result = response.json()
        assert result["name"] == "Updated Name"
        assert result["biography"] == "Updated bio"


class TestDeleteLegacy:
    """Tests for DELETE /api/legacies/{legacy_id}."""

    @pytest.mark.asyncio
    async def test_delete_legacy_success(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
    ):
        """Test deleting legacy as creator."""
        response = await client.delete(
            f"/api/legacies/{test_legacy.id}",
            headers=auth_headers,
        )

        assert response.status_code == 204


class TestRequestJoin:
    """Tests for POST /api/legacies/{legacy_id}/join."""

    @pytest.mark.asyncio
    async def test_request_join_success(
        self,
        client: AsyncClient,
        test_legacy: Legacy,
        test_user_2: User,
    ):
        """Test requesting to join a legacy."""
        # Create auth headers for user_2
        from app.auth.middleware import create_session_cookie
        from app.auth.models import SessionData
        from app.config import get_settings

        settings = get_settings()
        now = datetime.now(timezone.utc)
        session_data = SessionData(
            user_id=test_user_2.id,
            google_id=test_user_2.google_id,
            email=test_user_2.email,
            name=test_user_2.name,
            avatar_url=test_user_2.avatar_url,
            created_at=now,
            expires_at=now + timedelta(hours=24),
        )
        cookie_name, cookie_value = create_session_cookie(settings, session_data)
        headers = {"Cookie": f"{cookie_name}={cookie_value}"}

        response = await client.post(
            f"/api/legacies/{test_legacy.id}/join",
            headers=headers,
        )

        assert response.status_code == 201
        result = response.json()
        assert "message" in result


class TestApproveMember:
    """Tests for POST /api/legacies/{legacy_id}/members/{user_id}/approve."""

    @pytest.mark.asyncio
    async def test_approve_member_success(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy_with_pending: Legacy,
        test_user_2: User,
    ):
        """Test approving a pending member as creator."""
        response = await client.post(
            f"/api/legacies/{test_legacy_with_pending.id}/members/{test_user_2.id}/approve",
            headers=auth_headers,
        )

        assert response.status_code == 200
        result = response.json()
        assert "message" in result


class TestRemoveMember:
    """Tests for DELETE /api/legacies/{legacy_id}/members/{user_id}."""

    @pytest.mark.asyncio
    async def test_remove_member_success(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy_with_pending: Legacy,
        test_user_2: User,
    ):
        """Test removing a member as creator."""
        response = await client.delete(
            f"/api/legacies/{test_legacy_with_pending.id}/members/{test_user_2.id}",
            headers=auth_headers,
        )

        assert response.status_code == 204


class TestJoinApprovalFlow:
    """Integration tests for the complete join request and approval flow."""

    @pytest.mark.asyncio
    async def test_complete_join_flow(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        test_user_2: User,
    ):
        """Test complete flow: create legacy → request join → approve → verify access."""
        # Create auth headers for both users
        from app.auth.middleware import create_session_cookie
        from app.auth.models import SessionData
        from app.config import get_settings

        settings = get_settings()
        now = datetime.now(timezone.utc)

        # User 1 creates legacy
        session_data_1 = SessionData(
            user_id=test_user.id,
            google_id=test_user.google_id,
            email=test_user.email,
            name=test_user.name,
            avatar_url=test_user.avatar_url,
            created_at=now,
            expires_at=now + timedelta(hours=24),
        )
        cookie_name, cookie_value = create_session_cookie(settings, session_data_1)
        headers_1 = {"Cookie": f"{cookie_name}={cookie_value}"}

        create_response = await client.post(
            "/api/legacies/",
            json={"name": "Integration Test Legacy"},
            headers=headers_1,
        )
        assert create_response.status_code == 201
        legacy_id = create_response.json()["id"]

        # User 2 requests to join
        session_data_2 = SessionData(
            user_id=test_user_2.id,
            google_id=test_user_2.google_id,
            email=test_user_2.email,
            name=test_user_2.name,
            avatar_url=test_user_2.avatar_url,
            created_at=now,
            expires_at=now + timedelta(hours=24),
        )
        cookie_name, cookie_value = create_session_cookie(settings, session_data_2)
        headers_2 = {"Cookie": f"{cookie_name}={cookie_value}"}

        join_response = await client.post(
            f"/api/legacies/{legacy_id}/join",
            headers=headers_2,
        )
        assert join_response.status_code == 201

        # User 2 cannot access legacy yet (pending)
        get_response_pending = await client.get(
            f"/api/legacies/{legacy_id}",
            headers=headers_2,
        )
        assert get_response_pending.status_code == 403

        # User 1 approves user 2
        approve_response = await client.post(
            f"/api/legacies/{legacy_id}/members/{test_user_2.id}/approve",
            headers=headers_1,
        )
        assert approve_response.status_code == 200

        # User 2 can now access legacy
        get_response_approved = await client.get(
            f"/api/legacies/{legacy_id}",
            headers=headers_2,
        )
        assert get_response_approved.status_code == 200
        result = get_response_approved.json()
        assert result["id"] == legacy_id


class TestMemberManagement:
    """Tests for member management endpoints."""

    @pytest.mark.asyncio
    async def test_list_members(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
    ):
        """Test listing legacy members."""
        response = await client.get(
            f"/api/legacies/{test_legacy.id}/members",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1  # At least the creator

    @pytest.mark.asyncio
    async def test_change_member_role(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
        db_session: AsyncSession,
    ):
        """Test changing a member's role."""
        # Add another member
        other_user = User(
            email="other@example.com",
            google_id="google_other",
            name="Other User",
        )
        db_session.add(other_user)
        await db_session.commit()
        await db_session.refresh(other_user)

        member = LegacyMember(
            legacy_id=test_legacy.id,
            user_id=other_user.id,
            role="advocate",
        )
        db_session.add(member)
        await db_session.commit()

        response = await client.patch(
            f"/api/legacies/{test_legacy.id}/members/{other_user.id}",
            json={"role": "admin"},
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["role"] == "admin"

    @pytest.mark.asyncio
    async def test_remove_member(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_legacy: Legacy,
        db_session: AsyncSession,
    ):
        """Test removing a member."""
        other_user = User(
            email="removable@example.com",
            google_id="google_removable",
            name="Removable User",
        )
        db_session.add(other_user)
        await db_session.commit()
        await db_session.refresh(other_user)

        member = LegacyMember(
            legacy_id=test_legacy.id,
            user_id=other_user.id,
            role="advocate",
        )
        db_session.add(member)
        await db_session.commit()

        response = await client.delete(
            f"/api/legacies/{test_legacy.id}/members/{other_user.id}",
            headers=auth_headers,
        )

        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_leave_legacy(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_legacy: Legacy,
    ):
        """Test leaving a legacy."""
        # Create a non-creator member
        leaving_user = User(
            email="leaving@example.com",
            google_id="google_leaving",
            name="Leaving User",
        )
        db_session.add(leaving_user)
        await db_session.commit()
        await db_session.refresh(leaving_user)

        member = LegacyMember(
            legacy_id=test_legacy.id,
            user_id=leaving_user.id,
            role="advocate",
        )
        db_session.add(member)
        await db_session.commit()

        leaving_auth = create_auth_headers_for_user(leaving_user)

        response = await client.delete(
            f"/api/legacies/{test_legacy.id}/members/me",
            headers=leaving_auth,
        )

        assert response.status_code == 204
