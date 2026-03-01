"""Tests for story context routes."""

from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.models.story import Story
from app.models.user import User
from tests.conftest import create_auth_headers_for_user


class TestStoryContextRoutes:
    """Test story context extract access control."""

    @pytest.mark.asyncio
    async def test_extract_requires_auth(self, client: AsyncClient) -> None:
        response = await client.post(f"/api/stories/{uuid4()}/context/extract")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_extract_returns_404_for_missing_story(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
    ) -> None:
        response = await client.post(
            f"/api/stories/{uuid4()}/context/extract",
            headers=auth_headers,
        )
        assert response.status_code == 404
        assert response.json()["detail"] == "Story not found"

    @pytest.mark.asyncio
    async def test_extract_rejects_unauthorized_story_access(
        self,
        client: AsyncClient,
        test_story: Story,
        test_user_2: User,
    ) -> None:
        other_headers = create_auth_headers_for_user(test_user_2)
        response = await client.post(
            f"/api/stories/{test_story.id}/context/extract",
            headers=other_headers,
        )

        assert response.status_code == 403
        assert response.json()["detail"] == "Not authorized to view this story"
