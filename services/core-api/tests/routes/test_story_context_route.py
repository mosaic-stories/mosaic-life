"""Tests for story context routes."""

from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.ai_rate_limits import (
    STORY_CONTEXT_EXTRACT_CONCURRENCY,
    STORY_CONTEXT_EXTRACT_THRESHOLDS,
)
from app.models.ai_rate_limit import AIRateLimitEvent
from app.models.story import Story
from app.models.user import User
from app.services.ai_concurrency import AIConcurrencySlot
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


class TestStoryContextExtractRateLimiting:
    """Test story_context_extract frequency and concurrency rate limiting."""

    @pytest.mark.asyncio
    async def test_extract_returns_429_when_frequency_limit_exceeded(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_story: Story,
        test_user: User,
        auth_headers: dict[str, str],
    ) -> None:
        """Once the hourly frequency threshold is met, extract is rejected with 429.

        `test_story` (owned/authored by `test_user`) has no cached
        `StoryContext` yet, so the route's cache-hit short-circuit doesn't
        fire and the frequency check underneath it actually runs.
        """
        assert STORY_CONTEXT_EXTRACT_THRESHOLDS == [(3600, 50)]
        window_seconds, max_count = STORY_CONTEXT_EXTRACT_THRESHOLDS[0]

        for _ in range(max_count):
            db_session.add(
                AIRateLimitEvent(user_id=test_user.id, bucket="story_context_extract")
            )
        await db_session.commit()

        response = await client.post(
            f"/api/stories/{test_story.id}/context/extract",
            headers=auth_headers,
        )

        assert response.status_code == 429
        retry_after = response.headers.get("Retry-After")
        assert retry_after is not None
        assert float(retry_after) == float(window_seconds)

    @pytest.mark.asyncio
    async def test_extract_returns_429_when_concurrency_limit_exceeded(
        self,
        client: AsyncClient,
        test_story: Story,
        test_user: User,
        auth_headers: dict[str, str],
    ) -> None:
        """A pre-occupied concurrency slot rejects extract synchronously with 429.

        Acquiring the (limit=1) slot for `test_user` before calling the route
        proves the route checks/rejects on the slot *before* ever scheduling
        `background_tasks.add_task` — i.e. it can't silently accept a `202`
        whose background extraction never actually runs.
        """
        slot = await AIConcurrencySlot.acquire(
            test_user.id,
            bucket="story_context_extract",
            limit=STORY_CONTEXT_EXTRACT_CONCURRENCY,
        )
        try:
            response = await client.post(
                f"/api/stories/{test_story.id}/context/extract",
                headers=auth_headers,
            )

            assert response.status_code == 429
            retry_after = response.headers.get("Retry-After")
            assert retry_after is not None
            assert float(retry_after) == 5.0
        finally:
            await slot.release()
