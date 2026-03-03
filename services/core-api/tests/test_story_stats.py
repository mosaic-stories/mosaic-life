"""Tests for GET /api/stories/stats endpoint."""

import pytest
from httpx import AsyncClient

from app.models.user import User


class TestStoryStats:
    """Tests for GET /api/stories/stats."""

    @pytest.mark.asyncio
    async def test_stats_returns_all_fields(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Stats response includes all four story stat fields."""
        response = await client.get("/api/stories/stats", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "my_stories_count" in data
        assert "favorites_given_count" in data
        assert "stories_evolved_count" in data
        assert "legacies_written_for_count" in data

    @pytest.mark.asyncio
    async def test_stats_values_are_integers(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """All stats values are non-negative integers."""
        response = await client.get("/api/stories/stats", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        for key, value in data.items():
            assert isinstance(value, int), f"{key} should be int"
            assert value >= 0, f"{key} should be non-negative"

    @pytest.mark.asyncio
    async def test_stats_requires_auth(
        self,
        client: AsyncClient,
    ):
        """Stats endpoint requires authentication."""
        response = await client.get("/api/stories/stats")
        assert response.status_code == 401
