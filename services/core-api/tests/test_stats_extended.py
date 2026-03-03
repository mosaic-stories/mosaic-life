"""Tests for extended user stats (legacy_links_count, favorites_count)."""

import pytest
from httpx import AsyncClient

from app.models.user import User


class TestExtendedStats:
    """Tests for GET /api/users/me/stats extended fields."""

    @pytest.mark.asyncio
    async def test_stats_includes_legacy_links_count(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Stats response includes legacy_links_count field."""
        response = await client.get("/api/users/me/stats", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "legacy_links_count" in data
        assert isinstance(data["legacy_links_count"], int)

    @pytest.mark.asyncio
    async def test_stats_includes_favorites_count(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Stats response includes favorites_count field."""
        response = await client.get("/api/users/me/stats", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "favorites_count" in data
        assert isinstance(data["favorites_count"], int)
