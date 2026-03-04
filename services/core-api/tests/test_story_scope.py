"""Tests for story scope filtering on GET /api/stories/."""

import pytest
from httpx import AsyncClient

from app.models.user import User


class TestStoryScope:
    """Tests for GET /api/stories/?scope=..."""

    @pytest.mark.asyncio
    async def test_scope_all_returns_items_and_counts(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Scope 'all' returns items list and counts object."""
        response = await client.get("/api/stories/?scope=all", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "counts" in data
        assert "all" in data["counts"]
        assert "mine" in data["counts"]
        assert "shared" in data["counts"]

    @pytest.mark.asyncio
    async def test_scope_mine_returns_authored_stories(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Scope 'mine' returns only stories authored by user."""
        response = await client.get("/api/stories/?scope=mine", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        for item in data["items"]:
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
        for item in data["items"]:
            assert item["author_id"] != str(test_user.id)

    @pytest.mark.asyncio
    async def test_scope_favorites_returns_wrapped(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """Scope 'favorites' returns wrapped response."""
        response = await client.get(
            "/api/stories/?scope=favorites", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "counts" in data

    @pytest.mark.asyncio
    async def test_scope_drafts_returns_only_drafts(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Scope 'drafts' returns only draft stories by the user."""
        response = await client.get("/api/stories/?scope=drafts", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        for item in data["items"]:
            assert item["status"] == "draft"
            assert item["author_id"] == str(test_user.id)

    @pytest.mark.asyncio
    async def test_no_scope_returns_plain_list(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ):
        """No scope parameter returns plain list (backward compat)."""
        response = await client.get("/api/stories/", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
