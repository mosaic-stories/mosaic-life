"""Tests for Connections Hub API endpoints."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai import AIConversation
from app.models.legacy import Legacy, LegacyMember
from app.models.user import User


class TestConnectionsStats:
    """Tests for GET /api/connections/stats."""

    @pytest.mark.asyncio
    async def test_stats_returns_all_fields(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Stats response includes all four fields."""
        response = await client.get(
            "/api/connections/stats", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "conversations_count" in data
        assert "people_count" in data
        assert "shared_legacies_count" in data
        assert "personas_used_count" in data

    @pytest.mark.asyncio
    async def test_stats_values_are_integers(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """All stats values are non-negative integers."""
        response = await client.get(
            "/api/connections/stats", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        for key, value in data.items():
            assert isinstance(value, int), f"{key} should be int"
            assert value >= 0, f"{key} should be non-negative"

    @pytest.mark.asyncio
    async def test_stats_requires_auth(self, client: AsyncClient):
        """Stats endpoint requires authentication."""
        response = await client.get("/api/connections/stats")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_stats_counts_conversations(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
        test_legacy: Legacy,
        db_session: AsyncSession,
    ):
        """Stats correctly counts user conversations."""
        conv = AIConversation(
            user_id=test_user.id,
            persona_id="biographer",
            title="Test conversation",
        )
        db_session.add(conv)
        await db_session.commit()

        response = await client.get(
            "/api/connections/stats", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["conversations_count"] >= 1
        assert data["personas_used_count"] >= 1


class TestTopConnections:
    """Tests for GET /api/connections/top-connections."""

    @pytest.mark.asyncio
    async def test_returns_list(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Returns a list (possibly empty)."""
        response = await client.get(
            "/api/connections/top-connections", headers=auth_headers
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    @pytest.mark.asyncio
    async def test_requires_auth(self, client: AsyncClient):
        """Requires authentication."""
        response = await client.get("/api/connections/top-connections")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_returns_connections_with_shared_legacies(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
        test_legacy: Legacy,
        test_user_2: User,
        db_session: AsyncSession,
    ):
        """Returns connections when users share legacies."""
        # Add test_user_2 as a member of test_legacy
        member = LegacyMember(
            legacy_id=test_legacy.id,
            user_id=test_user_2.id,
            role="advocate",
        )
        db_session.add(member)
        await db_session.commit()

        response = await client.get(
            "/api/connections/top-connections", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1
        assert data[0]["display_name"] == "Test User 2"
        assert data[0]["shared_legacy_count"] >= 1


class TestFavoritePersonas:
    """Tests for GET /api/connections/favorite-personas."""

    @pytest.mark.asyncio
    async def test_returns_list(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Returns a list (possibly empty)."""
        response = await client.get(
            "/api/connections/favorite-personas", headers=auth_headers
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    @pytest.mark.asyncio
    async def test_requires_auth(self, client: AsyncClient):
        """Requires authentication."""
        response = await client.get("/api/connections/favorite-personas")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_returns_personas_with_conversations(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
        db_session: AsyncSession,
    ):
        """Returns personas when user has conversations."""
        conv = AIConversation(
            user_id=test_user.id,
            persona_id="biographer",
            title="Test",
        )
        db_session.add(conv)
        await db_session.commit()

        response = await client.get(
            "/api/connections/favorite-personas", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1
        assert data[0]["persona_id"] == "biographer"
        assert data[0]["conversation_count"] >= 1


class TestPeople:
    """Tests for GET /api/connections/people."""

    @pytest.mark.asyncio
    async def test_returns_response_shape(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Returns items and counts."""
        response = await client.get(
            "/api/connections/people", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "counts" in data
        assert "all" in data["counts"]
        assert "co_creators" in data["counts"]
        assert "collaborators" in data["counts"]

    @pytest.mark.asyncio
    async def test_requires_auth(self, client: AsyncClient):
        """Requires authentication."""
        response = await client.get("/api/connections/people")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_returns_people_with_shared_legacies(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
        test_legacy: Legacy,
        test_user_2: User,
        db_session: AsyncSession,
    ):
        """Returns people when users share legacies."""
        member = LegacyMember(
            legacy_id=test_legacy.id,
            user_id=test_user_2.id,
            role="advocate",
        )
        db_session.add(member)
        await db_session.commit()

        response = await client.get(
            "/api/connections/people", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) >= 1
        assert data["items"][0]["display_name"] == "Test User 2"
        assert data["items"][0]["shared_legacy_count"] >= 1
        assert len(data["items"][0]["shared_legacies"]) >= 1

    @pytest.mark.asyncio
    async def test_filter_co_creators(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
        test_legacy: Legacy,
        test_user_2: User,
        db_session: AsyncSession,
    ):
        """Filters to co-creators (admin/creator role)."""
        member = LegacyMember(
            legacy_id=test_legacy.id,
            user_id=test_user_2.id,
            role="admin",
        )
        db_session.add(member)
        await db_session.commit()

        response = await client.get(
            "/api/connections/people?filter=co_creators",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["counts"]["co_creators"] >= 1
