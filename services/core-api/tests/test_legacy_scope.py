"""Tests for legacy scope filtering on GET /api/legacies/."""

import pytest
from httpx import AsyncClient

from app.models.user import User


class TestLegacyScope:
    """Tests for GET /api/legacies/?scope=..."""

    @pytest.mark.asyncio
    async def test_default_scope_returns_all_with_counts(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Default scope returns all legacies and counts object."""
        response = await client.get("/api/legacies/", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "counts" in data
        assert "all" in data["counts"]
        assert "created" in data["counts"]
        assert "connected" in data["counts"]

    @pytest.mark.asyncio
    async def test_scope_created_filters_to_own_legacies(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Scope 'created' returns only legacies created by user."""
        response = await client.get(
            "/api/legacies/?scope=created", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        for item in data["items"]:
            assert item["created_by"] == str(test_user.id)

    @pytest.mark.asyncio
    async def test_scope_connected_excludes_created(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Scope 'connected' returns only legacies user did not create."""
        response = await client.get(
            "/api/legacies/?scope=connected", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        for item in data["items"]:
            assert item["created_by"] != str(test_user.id)

    @pytest.mark.asyncio
    async def test_scope_favorites_returns_empty_when_none(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Scope 'favorites' returns empty when user has no favorites."""
        response = await client.get(
            "/api/legacies/?scope=favorites", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["items"] == []
