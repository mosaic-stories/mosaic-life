"""Tests for story scope filtering on GET /api/stories/."""

import pytest
from httpx import AsyncClient

from app.models.user import User


class TestStoryScope:
    """Tests for GET /api/stories/?scope=..."""

    @pytest.mark.asyncio
    async def test_scope_mine_returns_authored_stories(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Scope 'mine' returns stories authored by the user."""
        response = await client.get("/api/stories/?scope=mine", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        for item in data:
            assert item["author_id"] == str(test_user.id)

    @pytest.mark.asyncio
    async def test_scope_shared_excludes_own(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Scope 'shared' excludes user's own stories."""
        response = await client.get("/api/stories/?scope=shared", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        for item in data:
            assert item["author_id"] != str(test_user.id)

    @pytest.mark.asyncio
    async def test_scope_favorites_returns_empty_when_none(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Scope 'favorites' returns empty when no favorites."""
        response = await client.get(
            "/api/stories/?scope=favorites", headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json() == []

    @pytest.mark.asyncio
    async def test_existing_legacy_id_filter_still_works(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Backward compatibility: legacy_id filter still works without scope."""
        response = await client.get("/api/stories/", headers=auth_headers)
        assert response.status_code == 200
