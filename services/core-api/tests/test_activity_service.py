"""Tests for activity service."""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import UserActivity
from app.models.user import User
from app.services import activity as activity_service


@pytest_asyncio.fixture
async def tracking_user(db_session: AsyncSession) -> User:
    """Create a user with activity tracking enabled (default)."""
    user = User(
        email="tracker@example.com",
        google_id="google_tracker_123",
        name="Tracker User",
        username="tracker-0001",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def opted_out_user(db_session: AsyncSession) -> User:
    """Create a user with activity tracking disabled."""
    user = User(
        email="private@example.com",
        google_id="google_private_123",
        name="Private User",
        username="private-user-0001",
        preferences={"activity_tracking_enabled": False},
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


class TestRecordActivity:
    @pytest.mark.asyncio
    async def test_records_activity(
        self, db_session: AsyncSession, tracking_user: User
    ):
        entity_id = uuid4()
        await activity_service.record_activity(
            db=db_session,
            user_id=tracking_user.id,
            action="created",
            entity_type="story",
            entity_id=entity_id,
            metadata={"title": "Test Story"},
        )
        result = await db_session.execute(
            select(UserActivity).where(UserActivity.user_id == tracking_user.id)
        )
        activity = result.scalar_one()
        assert activity.action == "created"
        assert activity.entity_type == "story"
        assert activity.entity_id == entity_id
        assert activity.metadata_["title"] == "Test Story"

    @pytest.mark.asyncio
    async def test_skips_when_tracking_disabled(
        self, db_session: AsyncSession, opted_out_user: User
    ):
        await activity_service.record_activity(
            db=db_session,
            user_id=opted_out_user.id,
            action="created",
            entity_type="story",
            entity_id=uuid4(),
        )
        result = await db_session.execute(
            select(func.count())
            .select_from(UserActivity)
            .where(UserActivity.user_id == opted_out_user.id)
        )
        assert result.scalar_one() == 0

    @pytest.mark.asyncio
    async def test_deduplicates_views(
        self, db_session: AsyncSession, tracking_user: User
    ):
        entity_id = uuid4()
        # First view should record
        await activity_service.record_activity(
            db=db_session,
            user_id=tracking_user.id,
            action="viewed",
            entity_type="story",
            entity_id=entity_id,
            deduplicate_minutes=5,
        )
        # Second view within window should be skipped
        await activity_service.record_activity(
            db=db_session,
            user_id=tracking_user.id,
            action="viewed",
            entity_type="story",
            entity_id=entity_id,
            deduplicate_minutes=5,
        )
        result = await db_session.execute(
            select(func.count())
            .select_from(UserActivity)
            .where(UserActivity.user_id == tracking_user.id)
        )
        assert result.scalar_one() == 1

    @pytest.mark.asyncio
    async def test_records_without_metadata(
        self, db_session: AsyncSession, tracking_user: User
    ):
        await activity_service.record_activity(
            db=db_session,
            user_id=tracking_user.id,
            action="deleted",
            entity_type="legacy",
            entity_id=uuid4(),
        )
        result = await db_session.execute(
            select(UserActivity).where(UserActivity.user_id == tracking_user.id)
        )
        activity = result.scalar_one()
        assert activity.metadata_ is None


class TestGetActivityFeed:
    @pytest.mark.asyncio
    async def test_returns_activities_in_reverse_chronological_order(
        self, db_session: AsyncSession, tracking_user: User
    ):
        entity_id = uuid4()
        for action in ["created", "viewed", "updated"]:
            await activity_service.record_activity(
                db=db_session,
                user_id=tracking_user.id,
                action=action,
                entity_type="story",
                entity_id=entity_id,
            )

        result = await activity_service.get_activity_feed(
            db=db_session, user_id=tracking_user.id
        )
        assert result["tracking_enabled"] is True
        assert len(result["items"]) == 3
        # Most recent first
        actions = [a.action for a in result["items"]]
        assert actions == ["updated", "viewed", "created"]

    @pytest.mark.asyncio
    async def test_filters_by_entity_type(
        self, db_session: AsyncSession, tracking_user: User
    ):
        await activity_service.record_activity(
            db=db_session,
            user_id=tracking_user.id,
            action="created",
            entity_type="story",
            entity_id=uuid4(),
        )
        await activity_service.record_activity(
            db=db_session,
            user_id=tracking_user.id,
            action="created",
            entity_type="legacy",
            entity_id=uuid4(),
        )

        result = await activity_service.get_activity_feed(
            db=db_session, user_id=tracking_user.id, entity_type="story"
        )
        assert len(result["items"]) == 1
        assert result["items"][0].entity_type == "story"

    @pytest.mark.asyncio
    async def test_returns_empty_when_tracking_disabled(
        self, db_session: AsyncSession, opted_out_user: User
    ):
        result = await activity_service.get_activity_feed(
            db=db_session, user_id=opted_out_user.id
        )
        assert result["items"] == []
        assert result["tracking_enabled"] is False

    @pytest.mark.asyncio
    async def test_pagination_with_cursor(
        self, db_session: AsyncSession, tracking_user: User
    ):
        # Create 5 activities
        for i in range(5):
            await activity_service.record_activity(
                db=db_session,
                user_id=tracking_user.id,
                action="created",
                entity_type="story",
                entity_id=uuid4(),
                metadata={"index": i},
            )

        # Get first page (limit 2)
        page1 = await activity_service.get_activity_feed(
            db=db_session, user_id=tracking_user.id, limit=2
        )
        assert len(page1["items"]) == 2
        assert page1["has_more"] is True
        assert page1["next_cursor"] is not None

        # Get second page
        cursor_dt = datetime.fromisoformat(page1["next_cursor"])
        page2 = await activity_service.get_activity_feed(
            db=db_session, user_id=tracking_user.id, limit=2, cursor=cursor_dt
        )
        assert len(page2["items"]) == 2
        assert page2["has_more"] is True


class TestGetRecentItems:
    @pytest.mark.asyncio
    async def test_deduplicates_by_entity(
        self, db_session: AsyncSession, tracking_user: User
    ):
        entity_id = uuid4()
        # Multiple actions on same entity
        await activity_service.record_activity(
            db=db_session,
            user_id=tracking_user.id,
            action="created",
            entity_type="story",
            entity_id=entity_id,
            metadata={"title": "My Story"},
        )
        await activity_service.record_activity(
            db=db_session,
            user_id=tracking_user.id,
            action="updated",
            entity_type="story",
            entity_id=entity_id,
            metadata={"title": "My Story"},
        )

        result = await activity_service.get_recent_items(
            db=db_session, user_id=tracking_user.id
        )
        assert len(result["items"]) == 1
        assert result["items"][0]["last_action"] == "updated"

    @pytest.mark.asyncio
    async def test_returns_empty_when_tracking_disabled(
        self, db_session: AsyncSession, opted_out_user: User
    ):
        result = await activity_service.get_recent_items(
            db=db_session, user_id=opted_out_user.id
        )
        assert result["items"] == []
        assert result["tracking_enabled"] is False


class TestClearUserActivity:
    @pytest.mark.asyncio
    async def test_clears_all_activity(
        self, db_session: AsyncSession, tracking_user: User
    ):
        for _ in range(3):
            await activity_service.record_activity(
                db=db_session,
                user_id=tracking_user.id,
                action="created",
                entity_type="story",
                entity_id=uuid4(),
            )
        deleted = await activity_service.clear_user_activity(
            db=db_session, user_id=tracking_user.id
        )
        assert deleted == 3

        result = await db_session.execute(
            select(func.count())
            .select_from(UserActivity)
            .where(UserActivity.user_id == tracking_user.id)
        )
        assert result.scalar_one() == 0


class TestRetentionCleanup:
    @pytest.mark.asyncio
    async def test_deletes_old_ephemeral_events(
        self, db_session: AsyncSession, tracking_user: User
    ):
        # Create an old view event
        old_activity = UserActivity(
            user_id=tracking_user.id,
            action="viewed",
            entity_type="story",
            entity_id=uuid4(),
        )
        db_session.add(old_activity)
        await db_session.flush()

        # Manually set created_at to 31 days ago
        old_activity.created_at = datetime.now(timezone.utc) - timedelta(days=31)
        await db_session.flush()

        deleted = await activity_service.run_retention_cleanup(db=db_session)
        assert deleted == 1

    @pytest.mark.asyncio
    async def test_keeps_recent_events(
        self, db_session: AsyncSession, tracking_user: User
    ):
        # Create a recent view event
        await activity_service.record_activity(
            db=db_session,
            user_id=tracking_user.id,
            action="viewed",
            entity_type="story",
            entity_id=uuid4(),
        )

        deleted = await activity_service.run_retention_cleanup(db=db_session)
        assert deleted == 0
