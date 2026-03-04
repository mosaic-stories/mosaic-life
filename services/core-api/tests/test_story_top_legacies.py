"""Tests for GET /api/stories/top-legacies endpoint."""

import pytest
from httpx import AsyncClient

from app.models.user import User


class TestTopLegacies:
    """Tests for GET /api/stories/top-legacies."""

    @pytest.mark.asyncio
    async def test_returns_list(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Top legacies returns a list."""
        response = await client.get("/api/stories/top-legacies", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    @pytest.mark.asyncio
    async def test_respects_limit_parameter(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Limit parameter constrains results."""
        response = await client.get(
            "/api/stories/top-legacies?limit=2", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) <= 2

    @pytest.mark.asyncio
    async def test_items_have_required_fields(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_user: User,
    ):
        """Each item has legacy_id, legacy_name, profile_image_url, story_count."""
        response = await client.get("/api/stories/top-legacies", headers=auth_headers)
        assert response.status_code == 200
        for item in response.json():
            assert "legacy_id" in item
            assert "legacy_name" in item
            assert "profile_image_url" in item
            assert "story_count" in item
            assert isinstance(item["story_count"], int)

    @pytest.mark.asyncio
    async def test_requires_auth(
        self,
        client: AsyncClient,
    ):
        """Top legacies endpoint requires authentication."""
        response = await client.get("/api/stories/top-legacies")
        assert response.status_code == 401
