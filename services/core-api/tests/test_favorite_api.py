"""Integration tests for favorite API endpoints."""

import pytest
from httpx import AsyncClient

from app.models.legacy import Legacy
from app.models.story import Story


class TestToggleFavorite:
    """Tests for POST /api/favorites."""

    @pytest.mark.asyncio
    async def test_toggle_favorite_on(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ):
        response = await client.post(
            "/api/favorites",
            json={"entity_type": "story", "entity_id": str(test_story.id)},
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["favorited"] is True
        assert data["favorite_count"] == 1

    @pytest.mark.asyncio
    async def test_toggle_favorite_off(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ):
        # First: favorite
        await client.post(
            "/api/favorites",
            json={"entity_type": "story", "entity_id": str(test_story.id)},
            headers=auth_headers,
        )
        # Second: unfavorite
        response = await client.post(
            "/api/favorites",
            json={"entity_type": "story", "entity_id": str(test_story.id)},
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["favorited"] is False
        assert data["favorite_count"] == 0

    @pytest.mark.asyncio
    async def test_toggle_requires_auth(
        self,
        client: AsyncClient,
        test_story: Story,
    ):
        response = await client.post(
            "/api/favorites",
            json={"entity_type": "story", "entity_id": str(test_story.id)},
        )
        assert response.status_code == 401


class TestCheckFavorites:
    """Tests for GET /api/favorites/check."""

    @pytest.mark.asyncio
    async def test_batch_check(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
        test_story_public: Story,
    ):
        # Favorite one story
        await client.post(
            "/api/favorites",
            json={"entity_type": "story", "entity_id": str(test_story.id)},
            headers=auth_headers,
        )

        response = await client.get(
            f"/api/favorites/check?entity_ids={test_story.id},{test_story_public.id}",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["favorites"][str(test_story.id)] is True
        assert data["favorites"][str(test_story_public.id)] is False


class TestListFavorites:
    """Tests for GET /api/favorites."""

    @pytest.mark.asyncio
    async def test_list_favorites(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
    ):
        # Favorite a story
        await client.post(
            "/api/favorites",
            json={"entity_type": "story", "entity_id": str(test_story.id)},
            headers=auth_headers,
        )

        response = await client.get(
            "/api/favorites",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["entity_type"] == "story"
        assert data["items"][0]["entity"] is not None

    @pytest.mark.asyncio
    async def test_list_favorites_filtered(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        test_story: Story,
        test_legacy: Legacy,
    ):
        await client.post(
            "/api/favorites",
            json={"entity_type": "story", "entity_id": str(test_story.id)},
            headers=auth_headers,
        )
        await client.post(
            "/api/favorites",
            json={"entity_type": "legacy", "entity_id": str(test_legacy.id)},
            headers=auth_headers,
        )

        response = await client.get(
            "/api/favorites?entity_type=story",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["entity_type"] == "story"
