"""Tests for activity tracking privacy opt-out."""

from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import UserActivity
from app.models.user import User
from app.services import activity as activity_service


class TestActivityPrivacyOptOut:
    @pytest.mark.asyncio
    async def test_disabling_tracking_purges_data(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        auth_headers: dict[str, str],
    ):
        # Record some activity
        await activity_service.record_activity(
            db=db_session,
            user_id=test_user.id,
            action="created",
            entity_type="story",
            entity_id=uuid4(),
        )
        await db_session.commit()

        # Verify activity exists
        count_result = await db_session.execute(
            select(func.count())
            .select_from(UserActivity)
            .where(UserActivity.user_id == test_user.id)
        )
        assert count_result.scalar_one() == 1

        # Disable tracking
        response = await client.patch(
            "/api/users/me/preferences",
            json={"activity_tracking_enabled": False},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["activity_tracking_enabled"] is False

        # Verify activity was purged
        count_result2 = await db_session.execute(
            select(func.count())
            .select_from(UserActivity)
            .where(UserActivity.user_id == test_user.id)
        )
        assert count_result2.scalar_one() == 0

    @pytest.mark.asyncio
    async def test_reenabling_tracking_starts_fresh(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        test_user: User,
        auth_headers: dict[str, str],
    ):
        # Disable tracking
        await client.patch(
            "/api/users/me/preferences",
            json={"activity_tracking_enabled": False},
            headers=auth_headers,
        )

        # Re-enable tracking
        response = await client.patch(
            "/api/users/me/preferences",
            json={"activity_tracking_enabled": True},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["activity_tracking_enabled"] is True

        # Feed should be empty but tracking enabled
        feed_response = await client.get("/api/activity", headers=auth_headers)
        data = feed_response.json()
        assert data["items"] == []
        assert data["tracking_enabled"] is True
