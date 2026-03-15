"""Tests for social feed and enriched recent items API routes."""

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy, LegacyMember
from app.models.person import Person
from app.models.user import User
from app.services import activity as activity_service
from tests.conftest import create_auth_headers_for_user


@pytest_asyncio.fixture
async def feed_user(db_session: AsyncSession) -> User:
    """Create a user for feed tests."""
    user = User(
        email="feeduser@example.com",
        google_id="google_feeduser",
        name="Feed User",
        username="feed-user-0001",
        avatar_url="https://example.com/feed.jpg",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def feed_legacy(db_session: AsyncSession, feed_user: User) -> Legacy:
    """Create a legacy for feed tests."""
    person = Person(canonical_name="Feed Legacy")
    db_session.add(person)
    await db_session.flush()

    legacy = Legacy(
        name="Feed Legacy",
        biography="Test",
        visibility="public",
        created_by=feed_user.id,
        person_id=person.id,
    )
    db_session.add(legacy)
    await db_session.flush()

    db_session.add(
        LegacyMember(legacy_id=legacy.id, user_id=feed_user.id, role="creator")
    )
    await db_session.commit()
    await db_session.refresh(legacy)
    return legacy


class TestSocialFeedRoute:
    @pytest.mark.asyncio
    async def test_returns_feed(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        feed_user: User,
        feed_legacy: Legacy,
    ):
        headers = create_auth_headers_for_user(feed_user)
        await activity_service.record_activity(
            db=db_session,
            user_id=feed_user.id,
            action="created",
            entity_type="legacy",
            entity_id=feed_legacy.id,
            metadata={"name": "Feed Legacy"},
        )

        response = await client.get("/api/activity/feed", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["actor"]["name"] == "Feed User"
        assert data["items"][0]["entity"]["name"] == "Feed Legacy"

    @pytest.mark.asyncio
    async def test_requires_auth(self, client: AsyncClient):
        response = await client.get("/api/activity/feed")
        assert response.status_code == 401


class TestEnrichedRecentRoute:
    @pytest.mark.asyncio
    async def test_returns_enriched_items(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        feed_user: User,
        feed_legacy: Legacy,
    ):
        headers = create_auth_headers_for_user(feed_user)
        await activity_service.record_activity(
            db=db_session,
            user_id=feed_user.id,
            action="viewed",
            entity_type="legacy",
            entity_id=feed_legacy.id,
        )

        response = await client.get(
            "/api/activity/recent/enriched?action=viewed&entity_type=legacy&limit=4",
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["entity"]["name"] == "Feed Legacy"

    @pytest.mark.asyncio
    async def test_requires_auth(self, client: AsyncClient):
        response = await client.get("/api/activity/recent/enriched")
        assert response.status_code == 401
