"""Tests for enriched recent items with action filter."""

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.legacy import Legacy, LegacyMember
from app.models.person import Person
from app.models.user import User
from app.services import activity as activity_service


@pytest_asyncio.fixture
async def recent_user(db_session: AsyncSession) -> User:
    """Create a user for recent items tests."""
    user = User(
        email="recent@example.com",
        google_id="google_recent_123",
        name="Recent User",
        username="recent-user-0001",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def recent_legacy(db_session: AsyncSession, recent_user: User) -> Legacy:
    """Create a legacy for recent items tests."""
    person = Person(canonical_name="Recent Legacy")
    db_session.add(person)
    await db_session.flush()

    legacy = Legacy(
        name="Recent Legacy",
        biography="A test legacy",
        visibility="public",
        created_by=recent_user.id,
        person_id=person.id,
    )
    db_session.add(legacy)
    await db_session.flush()

    db_session.add(
        LegacyMember(legacy_id=legacy.id, user_id=recent_user.id, role="creator")
    )
    await db_session.commit()
    await db_session.refresh(legacy)
    return legacy


class TestGetEnrichedRecentItems:
    @pytest.mark.asyncio
    async def test_filters_by_action(
        self, db_session: AsyncSession, recent_user: User, recent_legacy: Legacy
    ):
        # Record a view and a create
        await activity_service.record_activity(
            db=db_session,
            user_id=recent_user.id,
            action="viewed",
            entity_type="legacy",
            entity_id=recent_legacy.id,
        )
        await activity_service.record_activity(
            db=db_session,
            user_id=recent_user.id,
            action="created",
            entity_type="legacy",
            entity_id=recent_legacy.id,
        )

        # Filter by viewed only
        result = await activity_service.get_enriched_recent_items(
            db=db_session, user_id=recent_user.id, action="viewed"
        )
        assert len(result["items"]) == 1
        assert result["items"][0]["last_action"] == "viewed"

    @pytest.mark.asyncio
    async def test_enriches_entity_data(
        self, db_session: AsyncSession, recent_user: User, recent_legacy: Legacy
    ):
        await activity_service.record_activity(
            db=db_session,
            user_id=recent_user.id,
            action="viewed",
            entity_type="legacy",
            entity_id=recent_legacy.id,
        )
        result = await activity_service.get_enriched_recent_items(
            db=db_session,
            user_id=recent_user.id,
            action="viewed",
            entity_type="legacy",
        )
        assert len(result["items"]) == 1
        assert result["items"][0]["entity"] is not None
        assert result["items"][0]["entity"]["name"] == "Recent Legacy"

    @pytest.mark.asyncio
    async def test_returns_empty_when_tracking_disabled(self, db_session: AsyncSession):
        user = User(
            email="norecenttrack@example.com",
            google_id="google_norecent",
            name="No Track",
            username="norecent-0001",
            preferences={"activity_tracking_enabled": False},
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        result = await activity_service.get_enriched_recent_items(
            db=db_session, user_id=user.id, action="viewed"
        )
        assert result["items"] == []
        assert result["tracking_enabled"] is False
