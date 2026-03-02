"""Tests for activity API routes."""

from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.services import activity as activity_service


class TestGetActivityFeed:
    @pytest.mark.asyncio
    async def test_returns_feed(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        auth_headers: dict[str, str],
    ):
        # Record some activity directly
        await activity_service.record_activity(
            db=db_session,
            user_id=test_user.id,
            action="created",
            entity_type="story",
            entity_id=uuid4(),
            metadata={"title": "Test Story"},
        )
        await db_session.commit()

        response = await client.get("/api/activity", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["action"] == "created"
        assert data["tracking_enabled"] is True

    @pytest.mark.asyncio
    async def test_requires_auth(self, client: AsyncClient):
        response = await client.get("/api/activity")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_filters_by_entity_type(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        auth_headers: dict[str, str],
    ):
        await activity_service.record_activity(
            db=db_session,
            user_id=test_user.id,
            action="created",
            entity_type="story",
            entity_id=uuid4(),
        )
        await activity_service.record_activity(
            db=db_session,
            user_id=test_user.id,
            action="created",
            entity_type="legacy",
            entity_id=uuid4(),
        )
        await db_session.commit()

        response = await client.get(
            "/api/activity?entity_type=story", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 1


class TestGetRecentItems:
    @pytest.mark.asyncio
    async def test_returns_recent_items(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        auth_headers: dict[str, str],
    ):
        entity_id = uuid4()
        await activity_service.record_activity(
            db=db_session,
            user_id=test_user.id,
            action="created",
            entity_type="story",
            entity_id=entity_id,
            metadata={"title": "Test"},
        )
        await db_session.commit()

        response = await client.get("/api/activity/recent", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["entity_id"] == str(entity_id)

    @pytest.mark.asyncio
    async def test_requires_auth(self, client: AsyncClient):
        response = await client.get("/api/activity/recent")
        assert response.status_code == 401


class TestClearActivity:
    @pytest.mark.asyncio
    async def test_clears_all_activity(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        auth_headers: dict[str, str],
    ):
        await activity_service.record_activity(
            db=db_session,
            user_id=test_user.id,
            action="created",
            entity_type="story",
            entity_id=uuid4(),
        )
        await db_session.commit()

        response = await client.delete("/api/activity", headers=auth_headers)
        assert response.status_code == 204

        # Verify cleared
        feed_response = await client.get("/api/activity", headers=auth_headers)
        assert len(feed_response.json()["items"]) == 0

    @pytest.mark.asyncio
    async def test_requires_auth(self, client: AsyncClient):
        response = await client.delete("/api/activity")
        assert response.status_code == 401


class TestCleanupEndpoint:
    @pytest.mark.asyncio
    async def test_cleanup_returns_deleted_count(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ):
        response = await client.get("/api/internal/activity/cleanup")
        assert response.status_code == 200
        data = response.json()
        assert "deleted_count" in data
